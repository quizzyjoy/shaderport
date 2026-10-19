import { display } from '@kit.ArkUI';
import { nativeInit, nativeResize, nativeSetParam, nativeSetShader, nativeDispose } from 'libentry.so';
import {
  EffectSpec,
  ParamValue,
  getDefaultParams,
  getEffect,
  getShaderSource,
  initShaderPort,
} from '@quizzyjoy/shaderport';

@Entry
@Component
struct Index {
  private controller: XComponentController = new XComponentController();
  @State status: string = 'booting';
  private started: boolean = false;

  aboutToAppear(): void {
    initShaderPort(getContext(this).resourceManager);
  }

  aboutToDisappear(): void {
    nativeDispose();
  }

  private loadPlasma(): void {
    try {
      const spec: EffectSpec = getEffect('plasma');
      const fragment: string = getShaderSource('plasma', 'fragment');
      nativeSetShader(fragment, spec.ubo.block, spec.ubo.instance);
      const params: ParamValue[] = getDefaultParams('plasma');
      for (let i = 0; i < params.length; i++) {
        nativeSetParam(params[i].name, params[i].values);
      }
      this.status = `plasma · ${params.length} params · ubo ${spec.ubo.block}`;
    } catch (error) {
      this.status = `error: ${error}`;
    }
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
    this.loadPlasma();
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
          const width: number = vp2px(Number(newValue.width));
          const height: number = vp2px(Number(newValue.height));
          if (width > 0 && height > 0) {
            nativeResize(width, height);
          }
        })
        .width('100%')
        .height('100%')

      Text(this.status)
        .fontSize(14)
        .fontColor(Color.White)
        .padding(12)
    }
    .width('100%')
    .height('100%')
    .backgroundColor(Color.Black)
  }
}
