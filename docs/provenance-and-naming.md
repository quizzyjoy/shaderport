# 与上游的关系：隶属、命名与溯源政策

> 适用对象：`shadeport` 项目及其产出的效果、工具、文档。
> 状态：v1 · 2026-10-16 · 变更需走 PR（本文件是政策，不是建议）

## 0. 结论速览

1. **隶属**：`shadeport` 是**完全独立的第三方项目**（由 **河南趣知易解互联网科技有限公司 / QuizzyJoy** 创建与维护）——不是 `shader-effects-inc/shaders` 的官方移植、不是 fork、未获其背书或赞助，两者无任何组织关系。
2. **命名**：项目名/包名**一律不包含上游品牌**（不带 `shaders`、`shader-effects`、`shaders.com` 等字样）。关系只在**文档里描述**，不体现在名字里。
3. **溯源**：每个效果必须声明来源类别（`original` / `ported` / `inspired`）与许可；**移植来的代码必须保留上游版权与许可声明**，并记录上游路径与版本。

## 1. 隶属关系（Affiliation）

**事实**：本项目由 **河南趣知易解互联网科技有限公司（品牌 QuizzyJoy，一人公司 OPC）** 创建与维护；日常开发由创始人进行，**版权与商标归属公司**。与 Shader Effects Inc.、`shader-effects-inc/shaders` 项目**没有雇佣、赞助、合作、授权或背书关系**。

**必须做的表述**（README 醒目位置）：

> `shadeport` is an independent project. It is **not affiliated with, endorsed by, or sponsored by** Shader Effects Inc. or the `shader-effects-inc/shaders` project.

**禁止的表述**：

| 禁止 | 原因 |
|---|---|
| "official port of Shaders" / "Shaders 官方 GLES 版" | 虚假官方身份，可能构成商标侵权或不正当竞争 |
| "powered by Shaders" / "in partnership with Shader Effects Inc." | 暗示背书 |
| 使用其 logo、图标、品牌色作为本项目的标识 | 商标与视觉资产不可借用 |
| 在仓库/包描述里把自己写成其生态官方组成部分 | 误导使用者 |

**允许的表述**（描述性、事实性）：

- "includes effects **ported from** `shader-effects-inc/shaders` (MIT)"
- "**compatible with** the effect presets of …"（仅在确实验证过兼容时使用）
- "**inspired by** the approach of …，**does not include its code**"

## 2. 法律基础

| 事项 | 结论 |
|---|---|
| 上游许可 | **MIT**（© 2026 Shader Effects Inc.） |
| 能否移植/改写/再分发 | **可以**，MIT 允许，**无需事先取得许可** |
| MIT 的硬性条件 | ① **保留版权声明与许可全文**；② 不得使用其作者名义为衍生品背书 |
| 本项目许可 | **Apache-2.0**；MIT 与 Apache-2.0 **兼容**（可把 MIT 代码纳入 Apache-2.0 项目，但该部分**仍按 MIT 授权**） |
| 是否需要 CLA/DCO（对外贡献上游） | 上游 `CONTRIBUTING` 明确：**无 CLA、无 DCO**，提交即视为按 MIT 授权 |
| 转译产物是否算衍生作品 | **算**——自动/手工把其上 WGSL 转成 GLSL ES 属于改编，须按 `ported` 处理并归属 |

## 3. 命名关系（Naming）

三档命名，本项目采用 **A 档**：

| 档 | 示例 | 评价 |
|---|---|---|
| **A. 独立功能名（采用）** | `shadeport`、`glessence` | ✅ 无品牌关联，无商标风险；关系由文档说明 |
| B. 描述性技术名 | `wgsl-to-gles`、`gles-effect-kit` | ⚪ 可接受，但通用、搜索易淹没 |
| C. 派生式命名 | `shaders-es`、`shaders-port`、`shaders-for-gles` | ❌ 暗示官方派生、与 npm/ohpm 上 `shaders` 混淆、一旦被异议改名成本极高（注册表名永久占用） |

**禁用词表**（不得出现在项目名、包名、组织名、域名、logo 中）：
`shaders`、`shader-effects`、`Shader Effects`、`shaders.com`、`Shaders` 作为独立词、其 logo/字形。

**允许的用法**：在 README / 文档 / 描述字段里**以文字提及**上游全名与仓库地址（用于事实性说明与致谢）。

**内部命名规则**：

- 效果目录用**功能描述名**（`mesh-gradient`、`contour-lines`），**不直接照搬上游组件名**（如 `MeshGradient`）；
- 上游对应关系写进该效果的 `spec.md` 的「来源」字段；
- 包名若将来拆分：`shadeport-core`、`shadeport-effects` —— 不得出现 `@shadeport/shaders` 这类擦边命名。

## 4. 溯源分类（Provenance classes）

每个效果 **必须**声明且仅声明一类：

| 类别 | 含义 | 归属义务 |
|---|---|---|
| `original` | 完全独立实现（含通用数学：反距离加权、值噪声、smoothstep 等公共技法） | 无（技法本身不受版权保护） |
| `ported` | **转载/改编了上游代码**（含自动转译产物、逐行改写） | **必须**：保留 MIT 版权与许可声明 + 记录上游 repo@版本/文件路径 + 标注"已修改" |
| `inspired` | 只参考思路/观感，**未复制任何代码** | 记录来源并注明"未包含其代码" |

**判定准则**：只要**复制了代码或结构**（哪怕经过自动转译）→ 判为 `ported`，不因"改写幅度大"而降级。只有在能证明"照数学定义从零实现"时才可标 `original`——此时也应在 spec 里注明已知的相似实现。

## 5. 落地机制（每个效果/每次 PR 都要满足）

1. **`spec.md` 的「来源」字段必填**，格式：
   `ported` + `shader-effects-inc/shaders@v4.0.4 packages/core/src/shaders/MeshGradient/index.ts` + `MIT © 2026 Shader Effects Inc.`
2. **移植文件的头部注释模板**：
   ```glsl
   // Ported from shader-effects-inc/shaders (MIT, © 2026 Shader Effects Inc.)
   //   source: packages/core/src/shaders/<Name>/index.ts @ v4.0.4
   //   changes: WGSL → GLSL ES 3.00, uniform 拆解，去掉 compute 依赖
   //   license: MIT (this file) ; Apache-2.0 (project)
   ```
3. **`THIRD_PARTY_NOTICES.md` 汇总**：每次新增/更新移植来源，必须在同一 PR 内更新该文件（含上游 MIT 许可全文或稳定链接）。
4. **评审闸门**（PR 模板勾选项）：
   - [ ] 每个新效果的 `spec.md` 已声明来源类别
   - [ ] 若为 `ported`，文件头注释与 `THIRD_PARTY_NOTICES.md` 已更新
   - [ ] 项目名/包名/标识未使用上游品牌词

## 6. 与上游的沟通姿态

- 定位是 **互补而非竞争**：上游覆盖 WebGPU/Web 侧；本项目覆盖 **native GLES 与受限 Web**（WebGPU 不可用的设备），并提供离线转换。
- **主动告知**：在发布前后向上游开 issue 说明本项目的存在与范围（避免被认为"蹭名"），并询问是否愿意接受 WebGL2 回退 PR。
- **若上游接受回退 PR**：本项目继续独立存在（面向 native 场景），两者可共存；向其中提交的代码按其 MIT 授权。
- **若上游明确表示不希望**出现同名/近似名的第三方项目：本项目的名字本就无关联，无需改名；仅在文档中调整表述即可。

## 7. 品牌与视觉资产

- 本项目使用**自有** logo/图标（不使用上游或任何第三方的视觉资产）。
- 命名与描述不模仿上游的视觉风格与文案结构，避免"看起来是一家"。

## 8. 附：待办

- [ ] README 增加"不隶属声明"（已加）
- [ ] `THIRD_PARTY_NOTICES.md` 建立并填入上游 MIT 条目（已建）
- [ ] PR 模板加入溯源勾选项（见 §5.4）
- [ ] 首批效果落地时逐条填 `spec.md` 来源字段
