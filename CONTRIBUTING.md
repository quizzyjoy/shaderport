# 贡献指南

感谢参与。项目已发布 `@quizzyjoy/shaderport@0.1.0`，包含 48 个效果。
最有价值的贡献依次是：**问题反馈 → 工具链改进 → 新效果 / 上游同步 → 文档**。

## 开始之前

- **缺陷**：开 issue 并附最小复现：
  - 效果 id 与参数值（`spec.json` 路径，如 `n_base.color`）；
  - 设备型号 / GPU / HarmonyOS 版本；
  - 期望与实际（截图或参考图 diff）。
- **新效果 / 行为变更**：先开 issue 对齐范围与成本预算。新效果必须能通过
  `glsl-gate`，并给出默认参数下的参考图与 `validation.pixelDiff`。
- **小修**（错别字、注释、明显一行错误）可直接提 PR。

## 效果改动流程

`effects/` 下的 `spec.json`、`passes/*.glsl`、`reference.png` 是**生成产物**，不要手改：

```bash
npm run export     # 上游 WGSL → effects/*/spec.json 草稿 + resolved
npm run convert    # WGSL → GLSL ES 3.00
npm run gate       # 逐 pass 编译/链接
npm run sync       # 同步到 harmony/library rawfile + index.json
npm run render     # 重生成 reference.png（--strict 校验像素差）
```

需要调整默认值时，修改 `tools/sync-effects/effects.config.json` 中的 `overrides`
（或上游导出逻辑），再重跑流水线。

- 新增效果需在 `effects.config.json` 登记源文件与分类；
- 效果 id 使用 kebab-case，与上游 class 名的对应关系见 `docs/provenance-and-naming.md`；
- 每个效果必须有 `reference.png`（512×512，P3-linear 渲染后经 sRGB OETF 编码）；
- 噪声类效果允许在 `spec.validation.pixelDiff` 中放宽阈值，但需在 PR 中说明原因。

## 提交规范

采用 [Conventional Commits](https://www.conventionalcommits.org/)，标题即变更说明：

```
<type>(<scope>): <描述>

type ∈ feat | fix | perf | refactor | docs | test | build | chore | revert
scope 例：converter | effects | gles | harmony | docs
```

例：`feat(effects): add contour-lines effect with GLES 3.0 preset`

- 一个 PR 只做一件事；
- 涉及观感的改动**必须附截图**（同一组参数、同一分辨率下的前后对比）；
- 提交信息用中文或英文均可，但同一 PR 内保持一致；
- **禁止提交签名材料**（`.p12`、`.cer`、`.p7b`、私钥、口令），见 `docs/signing.md`。

## 代码风格

- **GLSL**：`#version 300 es`；片元着色器显式声明 `precision highp float;` 或 `mediump`
  （须在 `spec` 中注明）；避免动态下标访问 uniform 数组；不使用 GLES 3.0 不存在的特性（如 compute）。
- **TypeScript/JavaScript**：严格模式、两空格缩进、命名导入；转换器改动必须补测试。
- **C++（渲染器）**：C++17，避免引入额外依赖；EGL/GLES 资源需在析构时释放。

## 验证

提交前至少运行：

```bash
npm run build
npm run export && npm run convert && npm run gate && npm run sync
npm run render
```

涉及 HarmonyOS 工程的改动，再构建 HAR/HAP：

```bash
hvigorw assembleHar --mode module -p module=library@default -p product=default
hvigorw assembleHap --mode module -p module=entry@default -p product=default
```

## 许可

本项目采用 **Apache-2.0**。提交贡献即表示你同意以同一许可授权（inbound = outbound），
并确认你有权提交该内容。若引用第三方代码，请在 PR 中说明来源与许可，并更新
`THIRD_PARTY_NOTICES.md`。
