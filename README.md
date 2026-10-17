# shadeport

> **Portable GPU effects for OpenGL ES 3.0** — a WGSL → GLSL ES 3.00 converter plus a curated, production-tested shader effect pack.

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
![Status](https://img.shields.io/badge/status-design%20phase-orange)

`shadeport` 把一个现实问题摊开：**现代 GPU 着色器效果正被 WebGPU 垄断，而大量真实设备只有 OpenGL ES 3.0**（HarmonyOS/ArkWeb、旧 Android WebView、老设备原生 App）。本项目提供两样东西：

1. **转换与规范化工具** —— 把 WGSL 转成 GLSL ES 3.00，并报出目标能力的缺口（`@compute`、storage texture、浮点渲染目标等）；
2. **效果包与规格** —— 一批可在 GLES 3.0 跑的效果（GLSL ES 源码 + 参数规格 + 参考图 + 成本档），以及把它们接进 native/Web 两侧的集成示例。

设计目标是"**可被真实产品使用**"：首个落地场景是一个原生 GLES 音乐可视化 App 的背景与主视效分层，不是玩具 demo。

## 与上游的关系（重要声明）

> **本项目是完全独立的第三方项目，不是 `shader-effects-inc/shaders` 的官方移植、不是其 fork，也未获得 Shader Effects Inc. 的背书或赞助。** 两者无任何组织关系。
>
> 项目名、包名与标识**不包含**上游品牌词；关系仅在文档中作事实性说明。完整政策见 [docs/provenance-and-naming.md](./docs/provenance-and-naming.md)。

若某个效果**移植自**上游代码（MIT）——含自动转译产物——该效果会在 `spec.md` 中登记来源，文件头保留版权与许可声明，并汇总到 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。**移植即衍生作品**，我们不回避这一点。

**定位是互补而非竞争**：上游覆盖 WebGPU/Web 侧；本项目覆盖 **native GLES 与 WebGPU 不可用的受限 Web**（例如 HarmonyOS ArkWeb 实测 `requestAdapter()` 返回 null），并提供离线转换。

## 为什么需要它

| 现实 | 后果 |
|---|---|
| 主流现代着色器库（如 `shaders`）**只支持 WebGPU**，失败时画布保持透明 | 目标设备上"完全没有效果" |
| WebGL2 可用但生态里几乎没有面向 GLES 3.0 的效果规范 | 每个团队各自重写一遍，参数与观感无法对齐 |
| WGSL 与 GLSL ES 差异细碎（精度、内建、数组下标、无 compute…） | 手工迁移易出隐性错误，且难以跨 GPU 验证 |

## 范围与非目标

**范围内**：WGSL → GLSL ES 3.00 转换工具与能力报告；可在 GLES 3.0 运行的效果库与规格；集成示例（C++/GLES、Web/WebGL2）；机型能力自检工具。

**非目标**：不做渲染引擎、不做完整视觉框架；不实现 WebGPU 运行时（那是上游的事）；不包含任何具体 App 的业务逻辑与素材。

## 计划中的结构

```
shadeport/
├── LICENSE / NOTICE            Apache-2.0
├── docs/                       设计与决策记录
│   └── design.md
├── effects/                    效果包（每个效果一目录：规格 + GLSL + 参考图）
└── tools/                      wgsl→GLSL ES 3.00 转换与能力检查
```

## 路线图

- **v0.1（进行中）**：规格与设计定型；转换工具骨架；3 个效果（多点网格渐变 / 极光噪声 / 等值线）带参考图。
- **v0.2**：能力矩阵（`@compute`、浮点 FBO、纹理格式）自动报告；C++/GLES 集成示例。
- **v0.3**：效果数量扩充；WebGL2 侧示例；与上游生态的互操作说明。

## 贡献

见 [CONTRIBUTING.md](./CONTRIBUTING.md)。**设计变更请先开 issue**，避免双方白做。行为准则见 [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)。

## 致谢与来源

本项目的部分知识与灵感来自以下优秀开源项目（各自遵循其许可）：

- [`shader-effects-inc/shaders`](https://github.com/shader-effects-inc/shaders)（MIT）—— WebGPU 效果库；本项目的效果选型与规格设计参考其思路（**不包含其代码**）。
- [`gfx-rs/wgpu` 的 `naga`](https://github.com/gfx-rs/wgpu)（MIT/Apache-2.0）—— WGSL 前端与 **GLSL ES 300/310 后端**，是转换工具的基石。
- [`software-mansion/TypeGPU`](https://github.com/software-mansion/TypeGPU)（MIT）—— 其 `@typegpu/gl` 提供了 WebGL/GLSL 侧的可行性证据。

## 主体与联系

本项目由 **河南趣知易解互联网科技有限公司（品牌 QuizzyJoy，一人公司 OPC）** 创建与维护。日常开发由创始人进行；**版权与商标归属公司**（Apache-2.0 只授予使用许可，不转让版权）。

| 用途 | 联系 |
|---|---|
| **安全问题（请勿公开 issue）** | security@quizzyjoy.com |
| 一般咨询 / 合作 / 行为准则举报 | opensource@quizzyjoy.com |
| 官网 | https://quizzyjoy.com |

## 许可

[Apache-2.0](./LICENSE) © 2026 河南趣知易解互联网科技有限公司（QuizzyJoy）
