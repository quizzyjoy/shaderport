# shaderport

> **Portable GPU effects for OpenGL ES 3.0** — a WGSL → GLSL ES 3.00 converter plus a curated, production-tested shader effect pack.

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
![Status](https://img.shields.io/badge/status-0.1.0%20beta%20%C2%B7%2048%20effects-blue)
![GLES](https://img.shields.io/badge/OpenGL%20ES-3.0-green)

> **主仓（source of truth）**：[GitHub `quizzyjoy/shaderport`](https://github.com/quizzyjoy/shaderport)。
> GitCode / Gitee 上的同名仓库为**只读镜像**；**issue 与 PR 请提交到 GitHub**。

## 简介

`shaderport` 把一个现实问题摊开：**现代 GPU 着色器效果正被 WebGPU 垄断，而大量真实设备只有 OpenGL ES 3.0**（HarmonyOS/ArkWeb、旧 Android WebView、老设备原生 App）。本项目提供两样东西：

1. **转换与规范化工具** —— 把 WGSL 转成 GLSL ES 3.00，并报出目标能力的缺口（`@compute`、storage texture、浮点渲染目标等）；
2. **效果包与规格** —— 一批可在 GLES 3.0 跑的效果（GLSL ES 源码 + 参数规格 + 参考图 + 成本档），以及把它们接进 native/Web 两侧的集成示例。

设计目标是"**可被真实产品使用**"：首个落地场景是一个原生 GLES 音乐可视化 App 的背景与主视效分层，不是玩具 demo。

**为什么不直接用 WebGPU 方案**：在 HarmonyOS ArkWeb 上实测，`navigator.gpu` 存在但 **`requestAdapter()` 返回 null** → 纯 WebGPU 的效果库在这些设备上完全不工作，且多数库没有 WebGL/GLES 回退。

**定位是互补而非竞争**：上游 WebGPU 库覆盖 Web 侧；本项目覆盖 **native GLES 与 WebGPU 不可用的受限 Web**，并提供离线转换。

## 安装

> **状态**：0.1.0 已实现并在 HarmonyOS 模拟器上完成 48 个效果的逐像素验证，**尚未发布到 ohpm**。以下安装方式在发布后生效。

```bash
# HarmonyOS（ohpm 中心仓，发布后）
ohpm install @quizzyjoy/shaderport

# npm（发布后，供 Web 侧示例使用）
npm install @quizzyjoy/shaderport
```

**当前可用方式**（源码）：
```bash
git clone https://github.com/quizzyjoy/shaderport.git
# 直接引用 effects/<name>/shader.glsl 与 spec.md
```

## 所需权限

**本库不申请任何系统权限**：无网络、无存储、无定位、无麦克风/相机访问。

- ArkTS 侧：仅读取随包分发的 `rawfile` 资源（GLSL 与规格 JSON）；
- 若使用 `examples/` 中的 native 示例：需要系统图形能力（XComponent + EGL/GLES），属于系统能力调用，不是用户授权权限。

## 使用示例

> **状态**：以下 API 已实现（`harmony/library`）。

**ArkTS 侧（取效果规格与着色器资源；渲染由宿主 native 层完成）**：
```ts
import {
  initShaderPort, listEffects, getEffect, getShaderSource,
  getPassSources, getDefaultParams, getParamDescriptors, encodeParam,
} from '@quizzyjoy/shaderport'

// 0) 绑定宿主 resourceManager（HAR 的 rawfile 会合并进宿主资源包）
initShaderPort(getContext(this).resourceManager)

// 1) 列出效果
const effects = listEffects()
// [{ id: 'plasma', layer: 'main', cost: 'medium', passes: 1, ... }]

// 2) 取规格与最终 uniform 值
const spec = getEffect('plasma')
const defaults = getDefaultParams('plasma')   // [{ name: 'n_n.colorA', values: [...] }, ...]

// 3) 取全部分 pass 的 GLSL（最后一项是 final）
const passes = getPassSources('plasma')       // [{ fragment, block, instance }, ...]

// 4) 参数面板
const controls = getParamDescriptors('plasma')
const encoded = encodeParam('plasma', 'intensity', 2.0)
nativeSetParam(encoded.name, encoded.values)   // n_n.intensity = [2.0]
```

**native 侧（C++/GLES）**：见 `harmony/entry/src/main/cpp`（`renderer.cpp`）——EGL/GLES3、XComponent surface、per-pass UBO 反射、RTT ping-pong、指针与 resize。

## 接口说明

公开接口（ArkTS 侧，已实现）：

| 接口 | 说明 | 返回 |
|---|---|---|
| `initShaderPort(resourceManager)` | 绑定宿主资源管理器 | `void` |
| `listEffects()` | 列出全部效果 | `EffectSummary[]` |
| `getEffect(id)` | 取单个效果规格 | `EffectSpec` |
| `getShaderSource(id, 'fragment')` | 取 final pass 的 GLSL | `string`（`#version 300 es`） |
| `getPassSources(id)` | 取所有 pass 的源码与 UBO 绑定 | `PassSource[]` |
| `getDefaultParams(id)` | 取最终 uniform 值（含组合基底） | `ParamValue[]` |
| `getParamDescriptors(id)` | 参数面板描述符（range/color/select/position/boolean） | `ParamDescriptor[]` |
| `encodeParam(id, name, value)` | 把 UI 值编码为 UBO 路径 + 数值 | `ParamValue` |
| `validateParams(id, params)` | 参数校验 | `{ ok, errors }` |

**数据约定**：
- `spec.resolved` 已是**最终 uniform 值**（P3-linear 颜色、Y 翻转后的位置、枚举码、色标数组）；**不要再次转换**。
- 所有 final pass 自带 sRGB OETF；**不要再次编码**。中间 RTT 为 premultiplied alpha。
- `passes` 按顺序渲染，最后一项到屏幕，其余进 RTT；宿主提供全屏顶点着色器（varying `_vs2fs_location0`）。
- 所有效果**不假设**任何输入纹理（除 `requires: ['input']` 的组合效果）。

## 文档

- [效果规格格式](./docs/spec-format.md)
- [转换与验证指南](./docs/conversion-guide.md)
- [设备矩阵与验证记录](./docs/device-matrix.md)
- [1.0 路线图](./docs/roadmap-1.0.md)
- [溯源与命名政策](./docs/provenance-and-naming.md)

## 约束与限制

| 项 | 约束 |
|---|---|
| **OpenHarmony API** | 目标 API 12+ / SDK 5.0+（**待真机验证后定稿**） |
| **GLES 版本** | **3.0**（`#version 300 es`）；**不支持 compute shader**（需 GLES 3.1） |
| **精度** | 片元着色器必须显式 `precision highp float;` |
| **依赖** | 无第三方运行时依赖；转换工具依赖 `naga`（MIT/Apache-2.0） |
| **不支持** | WebGPU 专有能力（storage texture 写、compute、`f16`）；依赖的多 pass 效果需浮点渲染目标 |
| **分辨率** | 背景层建议 1/2~1/4 分辨率 + 降帧；主视效层全分辨率 |

## 目录结构

```
shaderport/
├── LICENSE / NOTICE / THIRD_PARTY_NOTICES.md   Apache-2.0 + 第三方归属
├── README.md / CHANGELOG.md / CONTRIBUTING.md / CODE_OF_CONDUCT.md
├── .github/PULL_REQUEST_TEMPLATE.md            含"溯源自检"必勾项
├── docs/
│   ├── design.md                               设计说明（目标/非目标/关键决定）
│   └── provenance-and-naming.md                与上游的隶属/命名/溯源政策
├── effects/                                    效果包：每个效果 spec.md + shader.glsl + reference.png
├── tools/                                      wgsl2glsles 转换与能力检查、capability-probe
└── examples/                                   GLES C++ / WebGL2 / capability-probe 示例
```

## 贡献

见 [CONTRIBUTING.md](./CONTRIBUTING.md)。**设计变更与新效果请先开 issue**；行为准则见 [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)。

## 与上游的关系

> **本项目是完全独立的第三方项目，不是 `shader-effects-inc/shaders` 的官方移植、不是其 fork，也未获得 Shader Effects Inc. 的背书或赞助。** 两者无任何组织关系。
>
> 项目名、包名与标识不包含上游品牌词；关系仅在文档中作事实性说明。完整政策见 [docs/provenance-and-naming.md](./docs/provenance-and-naming.md)。

若某个效果**移植自**上游代码（MIT，含自动转译产物），该效果会在 `spec.md` 登记来源，文件头保留版权与许可声明，并汇总到 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。**移植即衍生作品**，不回避这一点。

## 主体与联系

本项目由 **河南趣知易解互联网科技有限公司（品牌 QuizzyJoy，一人公司 OPC）** 创建与维护。日常开发由创始人进行；**版权与商标归属公司**（Apache-2.0 只授予使用许可，不转让版权）。

| 用途 | 联系 |
|---|---|
| **安全问题（请勿公开 issue）** | security@quizzyjoy.com |
| 一般咨询 / 合作 / 行为准则举报 | opensource@quizzyjoy.com |
| 官网 | https://quizzyjoy.com |

## 开源协议

[Apache-2.0](./LICENSE) © 2026 河南趣知易解互联网科技有限公司（QuizzyJoy）

第三方内容按其原许可使用，详见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。
