# shaderport

> **Portable GPU effects for OpenGL ES 3.0** — 48 个可在 GLES 3.0 运行的效果资产，附规格、参考图与离线 WGSL → GLSL ES 3.00 工具链。

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
![Status](https://img.shields.io/badge/status-0.1.0%20beta%20%C2%B7%2048%20effects-blue)
![GLES](https://img.shields.io/badge/OpenGL%20ES-3.0-green)

> **主仓（source of truth）**：[GitHub `quizzyjoy/shaderport`](https://github.com/quizzyjoy/shaderport)。
> GitCode / Gitee 上的同名仓库为**只读镜像**；**issue 与 PR 请提交到 GitHub**。

## 简介

现代着色器效果生态正在向 **WebGPU/WGSL** 收敛，但真实设备的可用面要窄得多：

- HarmonyOS **ArkWeb** 实测：`navigator.gpu` 存在，**`requestAdapter()` 返回 null** → WebGPU 效果完全不可用；
- 原生 App（HarmonyOS / Android / iOS）**根本没有 WebGPU**，只有 OpenGL ES / Metal / Vulkan；
- 大量旧 WebView 与中低端设备只有 **GLES 3.0**。

`shaderport` 把上游 WebGPU 效果库（MIT）的资产转成 **GLSL ES 3.00**，以"**源码 + 规格 + 参考图**"交付，并提供离线转换工具链。它**不是** WebGPU 运行时，也**不包含渲染器**——渲染由宿主 App 的 native 层完成。

- **48 个效果**：生成器 / 形状 / warp / filter / 调整
- **每个效果三件套**：`spec.json`（最终 uniform 值 + 参数 UI）、`passes/*.glsl`、`reference.png`
- **多 pass**：RTT ping-pong（Blur / Glow / CursorRipples）
- **可验证**：模拟器 48/48 逐像素通过；真机差异有记录（见设备矩阵）

## 环境要求

| 项 | 要求 |
|---|---|
| HarmonyOS | **API 12+**（compatibleSdkVersion 5.0.0(12)） |
| 图形 | **OpenGL ES 3.0**（`#version 300 es`）；不支持 compute |
| ABI | arm64-v8a |
| 宿主 | 必须提供 native 渲染器（XComponent + EGL/GLES）；**ArkTS 不能直接执行 GLES** |
| 权限 | 无（只读取随包分发的 rawfile） |

## 安装

> **状态**：0.1.0 已实现并在 HarmonyOS 模拟器完成 48 个效果验证，**尚未发布到 ohpm**。

```bash
# 发布后
ohpm install @quizzyjoy/shaderport

# 本地开发（HAR 源码）
# entry/oh-package.json5:
#   "@quizzyjoy/shaderport": "file:../library"
```

## 快速开始（ArkTS 侧）

```ts
import {
  initShaderPort, listEffects, getEffect, getPassSources,
  getDefaultParams, getParamDescriptors, encodeParam,
} from '@quizzyjoy/shaderport'

// 1) 绑定宿主资源管理器（HAR 的 rawfile 会合并进宿主资源包）
initShaderPort(getContext(this).resourceManager)

// 2) 列效果 / 取规格
const effects = listEffects()
const spec = getEffect('plasma')

// 3) 取所有 pass 的 GLSL 与 UBO 绑定（最后一项是 final）
const passes = getPassSources('plasma')
// [{ fragment, block, instance }, ...]

// 4) 取最终 uniform 值，交给 native 打包
const values = getDefaultParams('plasma')
// [{ name: 'n_n.colorA', values: [...] }, ...]

// 5) 参数面板
const controls = getParamDescriptors('plasma')
const encoded = encodeParam('plasma', 'intensity', 2.0)
nativeSetParam(encoded.name, encoded.values)   // n_n.intensity = [2.0]
```

## 渲染契约（native 侧必须做什么）

宿主需要自己实现一个 GLES 3.0 渲染器。最小骨架见 [`harmony/entry/src/main/cpp`](./harmony/entry/src/main/cpp)。

| 事项 | 约定 |
|---|---|
| 顶点阶段 | 宿主提供全屏 VS，varying 名 **`_vs2fs_location0`**；片元只含 `@fragment` 入口 |
| pass 顺序 | `spec.passes` 按 `index` 升序；**最后一项绘制到屏幕**，其余进 RTT |
| UBO | 块名 `combined_block_0Fragment`，绑定 point 0；成员路径 `n_n.*` / `n_base.*` |
| 参数 | `getDefaultParams` 返回的是**最终值**（P3-linear 颜色、Y 翻转位置、枚举码、色标数组） |
| 数组 | 用 `GL_UNIFORM_ARRAY_STRIDE` 按元素写入（vec3 数组有 16 字节 padding） |
| 颜色 | **不要**再做 sRGB→linear；final pass 已经带 sRGB OETF，**不要**再次编码 |
| alpha | 中间 RTT 为 premultiplied；final 前按 shader 的 `unpremultiplyAlpha` 处理 |
| 运行时 uniform | `_sys.*`（time/viewport/aspect/pointer）、`_animTime`、`_opacity` 由宿主填 |
| 指针 | `_sys.pointer` 为归一化 `[0,1]`，**y 从顶部起算** |
| 缩放 | 可整条链渲染到低分辨率 FBO 再上采样（示例提供 1x/0.75x/0.5x） |

## API 参考

| 接口 | 说明 | 返回 |
|---|---|---|
| `initShaderPort(resourceManager)` | 绑定宿主资源管理器 | `void` |
| `listEffects()` | 列出全部效果 | `EffectSummary[]` |
| `getEffect(id)` | 取完整规格 | `EffectSpec` |
| `getShaderSource(id, 'fragment')` | 取 final pass 的 GLSL | `string` |
| `getPassSources(id)` | 取所有 pass 的源码 + UBO 绑定 | `PassSource[]` |
| `getDefaultParams(id)` | 取最终 uniform 值（含组合基底） | `ParamValue[]` |
| `getParamDescriptors(id)` | 参数面板描述符（range/color/select/position/boolean） | `ParamDescriptor[]` |
| `encodeParam(id, name, value)` | UI 值 → UBO 路径 + 数值 | `ParamValue` |
| `validateParams(id, params)` | 参数校验 | `{ ok, errors }` |

完整字段说明见 [`docs/spec-format.md`](./docs/spec-format.md)。

## 效果目录（48）

| 类别 | 数量 | 代表 |
|---|---|---|
| Textures | 19 | Plasma、Marble、Aurora、MeshGradient、FlowingGradient、Perlin/Simplex/BlockNoise、Checkerboard、Spiral |
| Shapes | 10 | Circle、RoundedRect、Polygon、Ring、Star、Ellipse、Heart、Teardrop、Arc、Cross |
| Adjustments | 10 | BrightnessContrast、Duotone、HueShift、Exposure、Grayscale、Invert、Posterize、Saturation、Tint、Tritone |
| Distortions | 5 | Twirl、Flip、Mirror、PolarCoordinates、RectangularCoordinates |
| Stylize | 2 | Vignette、Glow |
| Blurs | 1 | Blur（2 pass RTT） |
| Interactive | 1 | CursorRipples（指针驱动，2 pass） |

> 形状类默认 `radius=1` 填满画布（参考图为纯白，属预期）；调整类部分默认参数为恒等变换。

## 性能

Mate 80（1280×2598）实测，完整表见 [`docs/device-matrix.md`](./docs/device-matrix.md)：

- 纯色 / 轻渐变：**120 fps**
- Plasma / PerlinNoise / Aurora：**~60 fps**
- Blur / Glow（2 pass）：**56–58 fps**
- FlowingGradient：**54 fps**（`cost: medium`）
- MeshGradient：**11.8 fps**（`cost: high`，建议半分辨率或 `Scale` 档位）

`Scale` 档位：`1x / 0.75x / 0.5x`，整条链低分辨率渲染后线性上采样。

## 已知限制

- `Chrome` / `Neon` 依赖 shape/child alpha，暂不收录；
- 有状态模拟类（Smoke / ReactionDiffusion / Boids）需要跨帧状态，暂不收录；
- `meshAnchors` 在导出时按 1:1 aspect 烘焙，非 1:1 下跨端一致但与上游"每帧按实际 aspect 重算"略有差异；
- 真机（Maleoon GPU）与参考渲染器存在驱动精度差异（纯色 ~7/255），属 GPU 精度而非管线错误。

## 文档

- [效果规格格式（spec.json）](./docs/spec-format.md)
- [转换与验证指南](./docs/conversion-guide.md)
- [设备矩阵与验证记录](./docs/device-matrix.md)
- [HarmonyOS 示例工程](./harmony/README.md)
- [签名与凭据管理](./docs/signing.md)
- [1.0 路线图](./docs/roadmap-1.0.md)
- [溯源与命名政策](./docs/provenance-and-naming.md)

## 目录结构

```
shaderport/
├── effects/                 效果包（spec + passes + reference）
├── tools/                   export / naga / gate / sync / render-reference
├── harmony/                 DevEco 工程（library HAR + entry demo）
├── docs/                    规格、指南、设备矩阵、路线图
├── .github/workflows/       Node 侧 CI（导出/转换/门禁/漂移检查）
├── LICENSE / NOTICE / THIRD_PARTY_NOTICES.md
└── README.md / CHANGELOG.md / CONTRIBUTING.md
```

## 与上游的关系

> 本项目是完全独立的第三方项目，不是 `shader-effects-inc/shaders` 的官方移植、不是其 fork，也未获其背书。
>
> 48 个效果由上游 WGSL 自动转译为 GLSL ES 3.00（`ported`），每个文件保留 MIT 声明；逐条来源见 `spec.json` 的 `provenance` 与 [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)。

## 主体与联系

河南趣知易解互联网科技有限公司（品牌 **QuizzyJoy**，一人公司 OPC）创建与维护。

| 用途 | 联系 |
|---|---|
| 安全问题（请勿公开 issue） | security@quizzyjoy.com |
| 一般咨询 / 合作 / 行为准则 | opensource@quizzyjoy.com |
| 官网 | https://quizzyjoy.com |

## 开源协议

[Apache-2.0](./LICENSE) © 2026 河南趣知易解互联网科技有限公司（QuizzyJoy）
第三方内容按其原许可使用，详见 [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)。
