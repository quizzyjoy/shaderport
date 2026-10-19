import { display } from '@kit.ArkUI';
import {
  nativeCapture,
  nativeCaptureReady,
  nativeDispose,
  nativeInit,
  nativeResize,
  nativeSetEffect,
  nativeSetParam,
  nativeSetPointer,
  nativeSetTime,
} from 'libentry.so';
import {
  EffectSummary,
  ParamValue,
  PassSource,
  getDefaultParams,
  getPassSources,
  initShaderPort,
  listEffects,
} from '@quizzyjoy/shaderport';

@Entry
@Component
struct Index {
  private controller: XComponentController = new XComponentController();
  @State status: string = 'booting';
  @State effects: EffectSummary[] = [];
  @State current: string = '';
  private started: boolean = false;
  private filesDir: string = '';
  private autoIndex: number = 0;
  private viewWidth: number = 1;
  private viewHeight: number = 1;

  aboutToAppear(): void {
    initShaderPort(getContext(this).resourceManager);
    this.filesDir = getContext(this).filesDir;
    this.effects = listEffects();
  }

  aboutToDisappear(): void {
    nativeDispose();
  }

  private apply(id: string): void {
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
      const params: ParamValue[] = getDefaultParams(id);
      for (let i = 0; i < params.length; i++) {
        nativeSetParam(params[i].name, params[i].values);
      }
      // Freeze at the reference time so the captured frame can be diffed, then unfreeze.
      nativeSetTime(1.0, true);
      this.current = id;
      this.status = `${id} · ${params.length} params`;
      const path: string = `${this.filesDir}/capture-${id}.rgba`;
      setTimeout(() => {
        nativeCapture(path);
        this.pollCapture(id);
      }, 400);
    } catch (error) {
      this.status = `error: ${error}`;
    }
  }

  private pollCapture(id: string): void {
    let attempts: number = 0;
    const timer: number = setInterval(() => {
      attempts++;
      if (nativeCaptureReady()) {
        clearInterval(timer);
        nativeSetTime(0, false);
        this.status = `${id} captured · ${this.current}`;
      } else if (attempts > 50) {
        clearInterval(timer);
        this.status = `${id} capture timeout`;
      }
    }, 100);
  }

  private applyNext(): void {
    if (this.autoIndex >= this.effects.length) {
      this.status = 'all effects captured';
      return;
    }
    const id: string = this.effects[this.autoIndex].id;
    this.autoIndex++;
    this.apply(id);
    setTimeout(() => this.applyNext(), 1800);
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
    this.applyNext();
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
        Text(this.status)
          .fontSize(14)
          .fontColor(Color.White)
          .padding(12)

        Blank()

        Row({ space: 8 }) {
          ForEach(this.effects, (item: EffectSummary) => {
            Button(item.name)
              .fontSize(12)
              .height(34)
              .padding({ left: 12, right: 12 })
              .backgroundColor(this.current === item.id ? '#5b18ca' : '#33FFFFFF')
              .onClick(() => {
                this.autoIndex = this.effects.length;
                this.apply(item.id);
              })
          }, (item: EffectSummary) => item.id)
        }
        .padding(12)
      }
      .width('100%')
      .height('100%')
      .justifyContent(FlexAlign.SpaceBetween)
      .alignItems(HorizontalAlign.Start)
      // Overlay participates in hit testing (buttons work) and lets the XComponent underneath
      // receive the same touch/pointer events.
      .hitTestBehavior(HitTestMode.Transparent)
    }
    .width('100%')
    .height('100%')
    .backgroundColor(Color.Black)
  }
}
