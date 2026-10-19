# 使用教程：把 shaderport 接进你的 HarmonyOS App

> 适用版本：`@quizzyjoy/shaderport` 0.1.0 · HarmonyOS **API 12+** · **OpenGL ES 3.0**
> 阅读时间 ~10 分钟；跑通最小渲染器约 1–2 小时（可直接对照 [`harmony/entry`](../harmony/entry)）

## 0. 先明确边界（很重要）

| 你**拿到** | 你要**自己实现** |
|---|---|
| 48 个效果：`spec.json` + `passes/*.glsl` + `reference.png` | **native 渲染器**（XComponent + EGL + GLES 3.0） |
| ArkTS 读取 API（列表 / 规格 / 默认值 / 参数编码） | 参数 UI（可照抄 demo 的 spec 驱动面板） |
| 参考图与逐像素校验工具 | 业务集成（背景层 / 主视效 / 转场） |

> **ArkTS 不能直接执行 GLES**。HAR 里只有资产与纯逻辑 API，**不含 `.so`**。
> 如果你的 App 还没有 native 渲染层，可以先看 [`harmony/entry/src/main/cpp/renderer.cpp`](../harmony/entry/src/main/cpp/renderer.cpp)——一个 700 行左右的完整最小实现。

## 1. 安装

### 1.1 从 ohpm（发布后）

```bash
ohpm install @quizzyjoy/shaderport
```

### 1.2 本地 HAR 源码（开发期）

`entry/oh-package.json5`：

```json5
"dependencies": {
  "@quizzyjoy/shaderport": "file:../library"
}
```

## 2. 初始化：把 ResourceManager 交给库

HAR 的 `rawfile` 会**合并进宿主资源包**，所以要告诉库用哪个 `ResourceManager`：

```ts
import { initShaderPort, listEffects } from '@quizzyjoy/shaderport'

// 在 EntryAbility.onCreate 或页面 aboutToAppear 里
initShaderPort(getContext(this).resourceManager)

const effects = listEffects()   // EffectSummary[]：id / name / category / cost / passCount
```

> 只需初始化一次；重复调用是幂等的。

## 3. 读取效果数据

```ts
import { getEffect, getPassSources, getDefaultParams } from '@quizzyjoy/shaderport'

const spec = getEffect('plasma')          // EffectSpec：props / passes / resolved / validation
const passes = getPassSources('plasma')   // PassSource[]，最后一项是 final
const values = getDefaultParams('plasma') // ParamValue[]：{ name, values } —— 已算好的最终值
```

三个数据结构要点：

- **`passes[]`**：`{ fragment, block, instance }`；`block` 是 UBO 块名，`instance` 是实例名；
- **`resolved` / `getDefaultParams`**：返回的是**最终值**，不是原始 UI 值——颜色已在 P3-linear、位置已 Y 翻转、枚举已转码、色标已是数组；
- 字段全表见 [spec 格式](https://github.com/quizzyjoy/shaderport/blob/main/docs/spec-format.md)。

## 4. 实现 native 渲染器（核心）

下面是**完整最小骨架**，逐段对应 [`renderer.cpp`](../harmony/entry/src/main/cpp/renderer.cpp)。

### 4.1 全屏顶点着色器

片元只含 `@fragment` 入口，**varying 名固定为 `_vs2fs_location0`**（naga 产物约定）：

```glsl
#version 300 es
layout(location = 0) in vec2 aPosition;   // [-1,1] 全屏三角形/四边形
out vec2 _vs2fs_location0;
void main() {
  _vs2fs_location0 = aPosition * 0.5 + 0.5;  // 送 UV
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
```

### 4.2 逐 pass 编译

```cpp
for (int i = 0; i < passCount; ++i) {
  GLuint vs = compile(GL_VERTEX_SHADER, kFullscreenVS);
  GLuint fs = compile(GL_FRAGMENT_SHADER, passes[i].fragment);
  program[i] = link(vs, fs);
  uboIndex[i] = glGetUniformBlockIndex(program[i], passes[i].block.c_str());
  glUniformBlockBinding(program[i], uboIndex[i], 0);   // 统一绑到 point 0
}
```

### 4.3 UBO 打包（不要手写 layout）

**推荐做法**：保留 naga 产出的 UBO 布局，用 GL 自己去查偏移——避免手工维护 `vec3` padding：

```cpp
GLint count = 0;
glGetProgramiv(program, GL_ACTIVE_UNIFORMS, &count);
for (GLint i = 0; i < count; ++i) {
  char name[256]; GLint size; GLenum type;
  glGetActiveUniform(program, i, sizeof(name), nullptr, &size, &type, name);
  GLint offset = -1, arrayStride = 0;
  GLenum props[2] = { GL_UNIFORM_OFFSET, GL_UNIFORM_ARRAY_STRIDE };
  glGetActiveUniformsiv(program, 1, (GLuint*)&i, 2, props, &offset);  // 示意，实际按索引批量取
  // 把 name（形如 n_n.colorA / n_base.time）映射到 offset 后 memcpy 进 UBO
}
```

约定：
- UBO **块名** = `spec.passes[i].block`，绑定 point **0**；
- 成员路径 `n_n.*`（效果参数）/ `n_base.*`（基底）；
- 数组按 `GL_UNIFORM_ARRAY_STRIDE` 逐元素写（**`vec3` 数组元素间有 16 字节 padding**，不能紧密排列）。

### 4.4 pass 顺序与 RTT

```cpp
for (int i = 0; i < passCount; ++i) {
  bool isFinal = (i == passCount - 1);
  glBindFramebuffer(GL_FRAMEBUFFER, isFinal ? 0 : rttFbo[i % 2]);  // ping-pong
  glUseProgram(program[i]);
  glBindBuffer(GL_UNIFORM_BUFFER, ubo);
  glBindTexture(GL_TEXTURE_2D, i == 0 ? 0 : rttTex[(i - 1) % 2]);
  glDrawArrays(GL_TRIANGLES, 0, 3);
}
```

**alpha 契约**：中间 RTT 是 **premultiplied**；final 之前按该 pass 的 `unpremultiplyAlpha` 标记处理。

### 4.5 每帧运行时 uniform（宿主填）

| 路径 | 含义 |
|---|---|
| `_sys.time` | 秒（暂停时冻结） |
| `_sys.viewportSize` | 像素宽高（vec2） |
| `_sys.logicalViewportSize` | 逻辑宽高（vp，vec2） |
| `_sys.aspect` | `w/h` |
| `_sys.pointer` | 归一化 `[0,1]`，**y 从顶部起算** |
| `_sys.pointerActive` | 0/1 |
| `n_n._animTime` / `n_n._opacity` | 动画时间 / 整体不透明度 |

### 4.6 缩放档位（性能救命）

把**整条链**渲染到低分辨率 FBO，最后线性上采样：`1x / 0.75x / 0.5x`。
> 不要在中间 pass 改 viewport——只改 FBO 尺寸，uniform 仍按最终 viewport 填。

## 5. 参数面板（spec 驱动，零硬编码）

```ts
import { getParamDescriptors, encodeParam, validateParams } from '@quizzyjoy/shaderport'

const controls = getParamDescriptors('plasma')  // ParamDescriptor[]
// kind: range | color | select | position | boolean

// UI 变化 → UBO 路径 + 数值
const encoded = encodeParam('plasma', 'intensity', 2.0)
nativeSetParam(encoded.name, encoded.values)    // "n_n.intensity", [2.0]

// 提交前校验
const { ok, errors } = validateParams('plasma', { intensity: 2.0 })
```

Demo 的 `Slider / ColorPicker / Select / 双 Slider / Switch` 就是按 `kind` 自动生成的，可直接参考 [`Index.ets`](../harmony/entry/src/main/ets/pages/Index.ets)。

## 6. 接上 XComponent（ArkTS ↔ native 桥）

Demo 的 native 接口（声明见 [`Index.d.ts`](../harmony/entry/src/main/cpp/types/libentry/Index.d.ts)）：

```ts
import { nativeInit, nativeSetEffect, nativeSetParam, nativeSetPointer,
         nativeResize, nativeSetRenderScale, nativeSetPaused, nativeDispose } from 'libentry.so'

// 1) surface 就绪后初始化
nativeInit(surfaceId, pxWidth, pxHeight)

// 2) 切换效果：一次性把所有 pass 的源码与块名交过去
nativeSetEffect(passes.map(p => p.fragment), passes.map(p => p.block), passes.map(p => p.instance))
passes && getDefaultParams(id).forEach(v => nativeSetParam(v.name, v.values))

// 3) 每帧/交互
nativeSetPointer(x, y, active)
nativeResize(pxWidth, pxHeight)
nativeSetRenderScale(0.75)
nativeSetPaused(false)

// 4) 销毁
nativeDispose()
```

## 7. 验证：抓帧 + 逐像素对比

```bash
# demo 里点 Capture 后，从沙箱拉原始 RGBA
hdc file recv /data/app/el2/100/base/com.quizzyjoy.shaderport.demo/haps/entry/files/capture-plasma.rgba /tmp/cap.rgba

# 与参考渲染器比较（Node 侧，无需 GPU 现场）
node tools/render-reference/run.mjs --capture /tmp/cap.rgba --only plasma
```

默认阈值：`meanAbs ≤ 1`、`over8 ≤ 1%`、band ≤ 2；高频噪声效果在 `spec.validation.pixelDiff` 里单独放宽。

## 8. 常见问题

| 现象 | 原因 / 处理 |
|---|---|
| **整图发灰** | 做了两次 sRGB 编码。final pass 已带 OETF，**不要**再加 gamma；示例的 RTT 用 `RGBA8`，需要 HDR 时再改 `RGBA16F`（先确认 `EXT_color_buffer_float`） |
| 上下颠倒 | UV 契约是 **y 向下**（与 WGSL 一致），不要再翻一次；`_sys.pointer` 同样从顶部起算 |
| 黑屏、无报错 | 检查 `glGetShaderInfoLog` / `glGetProgramInfoLog`；确认 final pass 是最后一个 |
| 参数改了没反应 | 名字必须用 `encodeParam` 返回的 `name`（`n_n.xxx`），不能自己拼 |
| 数组类参数错位 | 忘了 `GL_UNIFORM_ARRAY_STRIDE`（`vec3[]` 每元素 16 字节） |
| 多 pass 闪烁 | ping-pong 的两个 FBO 没交替，或没解绑上一帧纹理 |
| 真机与模拟器有微小色差 | Maleoon/Adreno 驱动精度差异（纯色 ~7/255），属正常；参考图对比时用宽松阈值 |
| 折叠屏/旋转后拉伸 | `onAreaChange` 的 resize 没传到 native，或 Scale 档位下改了 viewport |

## 9. 参考实现

| 文件 | 作用 |
|---|---|
| [`harmony/entry/src/main/cpp/renderer.cpp`](../harmony/entry/src/main/cpp/renderer.cpp) | EGL/GLES3、UBO 反射、RTT、Scale、指针、抓帧 |
| [`harmony/entry/src/main/cpp/napi_init.cpp`](../harmony/entry/src/main/cpp/napi_init.cpp) | ArkTS ↔ native 桥 |
| [`harmony/entry/src/main/ets/pages/Index.ets`](../harmony/entry/src/main/ets/pages/Index.ets) | 工具栏 + spec 驱动参数面板 |
| [`harmony/README.md`](../harmony/README.md) | Demo 总览、真机截图、性能表、排障 |
