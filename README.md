# shadeport

> **Portable GPU effects for OpenGL ES 3.0** — a WGSL → GLSL ES 3.00 converter plus a curated, production-tested shader effect pack.

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
![Status](https://img.shields.io/badge/status-design%20phase-orange)
![GLES](https://img.shields.io/badge/OpenGL%20ES-3.0-green)

> **主仓（source of truth）**：[GitHub `quizzyjoy/shadeport`](https://github.com/quizzyjoy/shadeport)。
> GitCode / Gitee 上的同名仓库为**只读镜像**；**issue 与 PR 请提交到 GitHub**。

## 简介

`shadeport` 把一个现实问题摊开：**现代 GPU 着色器效果正被 WebGPU 垄断，而大量真实设备只有 OpenGL ES 3.0**（HarmonyOS/ArkWeb、旧 Android WebView、老设备原生 App）。本项目提供两样东西：

1. **转换与规范化工具** —— 把 WGSL 转成 GLSL ES 3.00，并报出目标能力的缺口（`@compute`、storage texture、浮点渲染目标等）；
2. **效果包与规格** —— 一批可在 GLES 3.0 跑的效果（GLSL ES 源码 + 参数规格 + 参考图 + 成本档），以及把它们接进 native/Web 两侧的集成示例。

设计目标是"**可被真实产品使用**"：首个落地场景是一个原生 GLES 音乐可视化 App 的背景与主视效分层，不是玩具 demo。

**为什么不直接用 WebGPU 方案**：在 HarmonyOS ArkWeb 上实测，`navigator.gpu` 存在但 **`requestAdapter()` 返回 null** → 纯 WebGPU 的效果库在这些设备上完全不工作，且多数库没有 WebGL/GLES 回退。

**定位是互补而非竞争**：上游 WebGPU 库覆盖 Web 侧；本项目覆盖 **native GLES 与 WebGPU 不可用的受限 Web**，并提供离线转换。

## 安装

> **状态**：v0.1 尚未发布。以下为规划中的安装方式，发布后生效。

```bash
# HarmonyOS（ohpm 中心仓，发布后）
ohpm install @quizzyjoy/shadeport

# npm（发布后，供 Web 侧示例使用）
npm install @quizzyjoy/shadeport
```

**当前可用方式**（源码）：
```bash
git clone https://github.com/quizzyjoy/shadeport.git
# 直接引用 effects/<name>/shader.glsl 与 spec.md
```

## 所需权限

**本库不申请任何系统权限**：无网络、无存储、无定位、无麦克风/相机访问。

- ArkTS 侧：仅读取随包分发的 `rawfile` 资源（GLSL 与规格 JSON）；
- 若使用 `examples/` 中的 native 示例：需要系统图形能力（XComponent + EGL/GLES），属于系统能力调用，不是用户授权权限。

## 使用示例

> **状态**：以下为 v0.1 规划中的 API 形态，用于说明设计意图；实现前请以 `effects/` 与 `tools/` 的实际产物为准。

**ArkTS 侧（取效果规格与着色器资源；渲染由宿主 native 层完成）**：
```ts
import { listEffects, getEffect, getShaderSource } from '@quizzyjoy/shadeport'

// 1) 看有哪些效果（含用途层与成本档）
const effects = listEffects()
// [{ id: 'mesh-gradient', layer: 'background', cost: 'very-low', passes: 1 }, ...]

// 2) 取单个效果的规格（uniform 定义、默认参数、参考图路径）
const spec = getEffect('mesh-gradient')

// 3) 取 GLSL ES 3.00 源码（交给 native 渲染器编译）
const vertex   = getShaderSource('mesh-gradient', 'vertex')
const fragment = getShaderSource('mesh-gradient', 'fragment')
```

**native 侧（C++/GLES）**：见 `examples/gles-cpp/`（计划）——全屏三角形 + 单 pass，按 `spec.md` 的 uniform 表绑定。

## 接口说明

> v0.1 规划的公开接口（Ts/ArkTS 侧）：

| 接口 | 说明 | 返回 |
|---|---|---|
| `listEffects()` | 列出全部效果 | `EffectSummary[]`（`id` / `layer` / `cost` / `passes`） |
| `getEffect(id)` | 取单个效果规格 | `EffectSpec`（`uniforms` / `defaults` / `reference` / `requires`） |
| `getShaderSource(id, stage)` | 取 GLSL 源码 | `string`（`#version 300 es`） |
| `validateParams(id, params)` | 参数校验（范围、类型、互斥项） | `{ ok: boolean, errors: string[] }` |

**数据约定**：
- 颜色以 **线性空间** `vec3`（0..1）传递，渲染端负责 gamma 转换；
- 时间 `uTime` 单位秒；分辨率 `uRes` 单位像素；
- 所有效果**不假设**任何输入纹理（除声明 `requires: ['texture']` 的项）。

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
shadeport/
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
