import { display } from '@kit.ArkUI';
import {
  nativeCapture,
  nativeCaptureReady,
  nativeDispose,
  nativeGetStats,
  nativeInit,
  nativeResize,
  nativeSetEffect,
  nativeSetParam,
  nativeSetPaused,
  nativeSetPointer,
} from 'libentry.so';
import {
  EffectSummary,
  ParamDescriptor,
  ParamValue,
  PassSource,
  encodeParam,
  getDefaultParams,
  getParamDescriptors,
  getPassSources,
  initShaderPort,
  listEffects,
} from '@quizzyjoy/shaderport';

@Entry
@Component
struct Index {
  private controller: XComponentController = new XComponentController();
  @State status: string = 'booting';
  @State info: string = '';
  @State effects: EffectSummary[] = [];
  @State current: string = '';
  @State params: ParamDescriptor[] = [];
  @State stats: string = '';
  @State paused: boolean = false;
  private started: boolean = false;
  private filesDir: string = '';
  private statsTimer: number = -1;
  private viewWidth: number = 1;
  private viewHeight: number = 1;

  aboutToAppear(): void {
    initShaderPort(getContext(this).resourceManager);
    this.filesDir = getContext(this).filesDir;
    this.effects = listEffects();
    this.statsTimer = setInterval(() => {
      const raw: string = nativeGetStats();
      const parts: string[] = raw.split('|');
      if (parts.length === 2) {
        this.stats = `${parts[0]} fps · ${parts[1]} ms`;
      }
    }, 500);
  }

  aboutToDisappear(): void {
    if (this.statsTimer !== -1) {
      clearInterval(this.statsTimer);
      this.statsTimer = -1;
    }
    nativeDispose();
  }

  private select(id: string): void {
    try {
      const sources: PassSource[] = getPassSources(id);
      const fragments: string[] = [];
      const blocks: string[] = [];
      const instances: string[] = [];
      for (let i = 0; i < sources.length; i++) {
        fragments.push(sources[i].fragment);
        blocks.push(sources[i].block);
        instances.push(sources[i].instance);
      }
      nativeSetEffect(fragments, blocks, instances);
      const values: ParamValue[] = getDefaultParams(id);
      for (let i = 0; i < values.length; i++) {
        nativeSetParam(values[i].name, values[i].values);
      }
      this.current = id;
      this.params = getParamDescriptors(id);
      this.paused = false;
      nativeSetPaused(false);

      const summary: EffectSummary | undefined = this.effects.find((item: EffectSummary) => item.id === id);
      if (summary !== undefined) {
        this.info = `${summary.category} · ${summary.layer} · ${summary.cost} · ${summary.passes}p`;
        this.status = `${summary.name} · ${values.length} params`;
      } else {
        this.status = `${id} · ${values.length} params`;
      }
    } catch (error) {
      this.status = `error: ${error}`;
    }
  }

  private step(delta: number): void {
    if (this.effects.length === 0) {
      return;
    }
    const index: number = this.effectIndex();
    const next: number = (index + delta + this.effects.length) % this.effects.length;
    this.select(this.effects[next].id);
  }

  private effectIndex(): number {
    for (let i = 0; i < this.effects.length; i++) {
      if (this.effects[i].id === this.current) {
        return i;
      }
    }
    return 0;
  }

  private effectName(): string {
    if (this.effects.length === 0) {
      return '';
    }
    return this.effects[this.effectIndex()].name;
  }

  private makeEffectOptions(): SelectOption[] {
    const out: SelectOption[] = [];
    for (let i = 0; i < this.effects.length; i++) {
      out.push({ value: this.effects[i].name });
    }
    return out;
  }

  private updateParam(index: number, value: ESObject): void {
    const param: ParamDescriptor = this.params[index];
    try {
      const encoded: ParamValue = encodeParam(this.current, param.name, value);
      nativeSetParam(encoded.name, encoded.values);
      param.value = value;
      this.params = this.params.slice();
    } catch (error) {
      this.status = `error: ${error}`;
    }
  }

  private resetParams(): void {
    try {
      const values: ParamValue[] = getDefaultParams(this.current);
      for (let i = 0; i < values.length; i++) {
        nativeSetParam(values[i].name, values[i].values);
      }
      this.params = getParamDescriptors(this.current);
      this.status = `${this.effectName()} · defaults restored`;
    } catch (error) {
      this.status = `error: ${error}`;
    }
  }

  private togglePause(): void {
    this.paused = !this.paused;
    nativeSetPaused(this.paused);
  }

  private capture(): void {
    const path: string = `${this.filesDir}/capture-${this.current}.rgba`;
    if (!nativeCapture(path)) {
      this.status = 'capture failed';
      return;
    }
    this.pollCapture(this.current);
  }

  private pollCapture(id: string): void {
    let attempts: number = 0;
    const timer: number = setInterval(() => {
      attempts++;
      if (nativeCaptureReady()) {
        clearInterval(timer);
        this.status = `${id} captured`;
      } else if (attempts > 50) {
        clearInterval(timer);
        this.status = `${id} capture timeout`;
      }
    }, 100);
  }

  private pushPointer(x: number, y: number, active: number): void {
    const nx: number = Math.max(0, Math.min(1, x / this.viewWidth));
    const ny: number = Math.max(0, Math.min(1, y / this.viewHeight));
    nativeSetPointer(nx, ny, active);
  }

  private start(surfaceId: string): void {
    if (this.started) {
      return;
    }
    const screen = display.getDefaultDisplaySync();
    const ok: boolean = nativeInit(surfaceId, screen.width, screen.height);
    if (!ok) {
      this.status = 'EGL init failed';
      return;
    }
    this.started = true;
    this.select('plasma');
  }

  @Builder
  paramRow(param: ParamDescriptor, index: number) {
    if (param.kind === 'range' || param.kind === 'map') {
      Row({ space: 8 }) {
        Text(param.label).fontSize(11).fontColor(Color.White).width(92)
        Slider({
          value: Number(param.value),
          min: param.min,
          max: param.max,
          step: param.step,
        })
          .layoutWeight(1)
          .onChange((value: number) => this.updateParam(index, value))
        Text(Number(param.value).toFixed(2)).fontSize(11).fontColor(Color.White).width(42)
      }
      .width('100%')
      .height(34)
    } else if (param.kind === 'color') {
      Row({ space: 8 }) {
        Text(param.label).fontSize(11).fontColor(Color.White).width(92)
        TextInput({ text: param.value as string })
          .height(28)
          .fontSize(12)
          .layoutWeight(1)
          .onChange((text: string) => this.updateParam(index, text))
      }
      .width('100%')
      .height(34)
    } else if (param.kind === 'select' && param.options.length > 0) {
      Row({ space: 8 }) {
        Text(param.label).fontSize(11).fontColor(Color.White).width(92)
        Select(this.makeOptions(param.options))
          .selected(Math.max(0, param.optionValues.indexOf(param.value as string)))
          .value(param.options[Math.max(0, param.optionValues.indexOf(param.value as string))])
          .layoutWeight(1)
          .onSelect((selected: number) => this.updateParam(index, param.optionValues[selected]))
      }
      .width('100%')
      .height(34)
    } else if (param.kind === 'position') {
      Column({ space: 2 }) {
        Text(param.label).fontSize(11).fontColor(Color.White).width('100%')
        Row({ space: 8 }) {
          Text('x').fontSize(10).fontColor(Color.White)
          Slider({
            value: Number((param.value as Record<string, number>).x ?? 0.5),
            min: 0,
            max: 1,
            step: 0.01,
          })
            .layoutWeight(1)
            .onChange((value: number) => {
              const point: Record<string, number> = param.value as Record<string, number>;
              this.updateParam(index, { x: value, y: point.y ?? 0.5 });
            })
        }
        Row({ space: 8 }) {
          Text('y').fontSize(10).fontColor(Color.White)
          Slider({
            value: Number((param.value as Record<string, number>).y ?? 0.5),
            min: 0,
            max: 1,
            step: 0.01,
          })
            .layoutWeight(1)
            .onChange((value: number) => {
              const point: Record<string, number> = param.value as Record<string, number>;
              this.updateParam(index, { x: point.x ?? 0.5, y: value });
            })
        }
      }
      .width('100%')
      .height(62)
    } else if (typeof param.value === 'boolean') {
      Row({ space: 8 }) {
        Text(param.label).fontSize(11).fontColor(Color.White).width(92)
        Toggle({ type: ToggleType.Switch, isOn: param.value as boolean })
          .onChange((isOn: boolean) => this.updateParam(index, isOn))
      }
      .width('100%')
      .height(34)
    }
  }

  private makeOptions(labels: string[]): SelectOption[] {
    const out: SelectOption[] = [];
    for (let i = 0; i < labels.length; i++) {
      out.push({ value: labels[i] });
    }
    return out;
  }

  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      XComponent({
        id: 'shaderport',
        type: XComponentType.SURFACE,
        controller: this.controller,
      })
        .onLoad(() => {
          this.start(this.controller.getXComponentSurfaceId());
        })
        .onAreaChange((_oldValue: Area, newValue: Area) => {
          const viewWidth: number = Number(newValue.width);
          const viewHeight: number = Number(newValue.height);
          if (viewWidth > 0 && viewHeight > 0) {
            this.viewWidth = viewWidth;
            this.viewHeight = viewHeight;
            nativeResize(vp2px(viewWidth), vp2px(viewHeight));
          }
        })
        .onTouch((event: TouchEvent) => {
          if (event.touches.length > 0) {
            const touch: TouchObject = event.touches[0];
            const active: number =
              event.type === TouchType.Down || event.type === TouchType.Move ? 1 : 0;
            this.pushPointer(touch.x, touch.y, active);
          }
        })
        .onHover((isHover: boolean, event: HoverEvent) => {
          this.pushPointer(event.x ?? 0, event.y ?? 0, isHover ? 1 : 0);
        })
        .onMouse((event: MouseEvent) => {
          const active: number =
            event.action === MouseAction.Press || event.action === MouseAction.Move ? 1 : 0;
          this.pushPointer(event.x ?? 0, event.y ?? 0, active);
        })
        .width('100%')
        .height('100%')

      Column() {
        Row({ space: 10 }) {
          Text(this.status).fontSize(13).fontColor(Color.White).layoutWeight(1)
          Text(this.stats).fontSize(12).fontColor('#CCFFFFFF')
        }
        .padding({ left: 12, right: 12, top: 8, bottom: 2 })

        Text(this.info)
          .fontSize(11)
          .fontColor('#AAFFFFFF')
          .padding({ left: 12, right: 12, bottom: 6 })

        Blank()

        Column({ space: 4 }) {
          Row({ space: 6 }) {
            Button('‹')
              .fontSize(16)
              .width(36)
              .height(32)
              .backgroundColor('#33FFFFFF')
              .onClick(() => this.step(-1))

            Select(this.makeEffectOptions())
              .selected(this.effectIndex())
              .value(this.effectName())
              .layoutWeight(1)
              .onSelect((index: number) => this.select(this.effects[index].id))

            Button('›')
              .fontSize(16)
              .width(36)
              .height(32)
              .backgroundColor('#33FFFFFF')
              .onClick(() => this.step(1))
          }
          .width('100%')

          Scroll() {
            Column() {
              ForEach(this.params, (param: ParamDescriptor, index: number) => {
                this.paramRow(param, index)
              }, (param: ParamDescriptor) => param.path)
            }
            .width('100%')
            .alignItems(HorizontalAlign.Start)
          }
          .height(160)
          .width('100%')
          .scrollBar(BarState.Auto)

          Row({ space: 8 }) {
            Button('Reset')
              .fontSize(11)
              .height(28)
              .backgroundColor('#33FFFFFF')
              .onClick(() => this.resetParams())
            Button(this.paused ? 'Play' : 'Pause')
              .fontSize(11)
              .height(28)
              .backgroundColor('#33FFFFFF')
              .onClick(() => this.togglePause())
            Button('Capture')
              .fontSize(11)
              .height(28)
              .onClick(() => this.capture())
            Blank()
            Text(`${this.params.length} params`)
              .fontSize(10)
              .fontColor('#CCFFFFFF')
          }
          .width('100%')
        }
        .width('100%')
        .padding({ left: 12, right: 12, bottom: 10, top: 6 })
        .backgroundColor('#CC000000')
      }
      .width('100%')
      .height('100%')
      .justifyContent(FlexAlign.SpaceBetween)
      .alignItems(HorizontalAlign.Start)
      .hitTestBehavior(HitTestMode.Transparent)
    }
    .width('100%')
    .height('100%')
    .backgroundColor(Color.Black)
  }
}
