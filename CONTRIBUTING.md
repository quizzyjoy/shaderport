# 贡献指南

感谢参与。本项目目前处于**设计阶段**，最有价值的贡献依次是：**问题反馈 → 效果规格 → 实现**。

## 开始之前

- **设计变更 / 新增效果：先开 issue**。说清"要解决什么、目标设备是什么、成本预算多少"，设计谈拢再写代码——避免双方白做。
- **缺陷**：开 issue 并附最小复现（GLSL 片段、目标 GPU 型号、驱动版本、期望与实际）。
- **小修**（错别字、注释、明显一行错误）可直接提 PR。

## 提交规范

采用 [Conventional Commits](https://www.conventionalcommits.org/)，标题即变更说明：

```
<type>(<scope>): <描述>

type ∈ feat | fix | perf | refactor | docs | test | build | chore | revert
scope 例：converter | effects | gles | docs
```

例：`feat(effects): add contour-lines effect with GLES 3.0 preset`

- 一个 PR 只做一件事；
- 涉及效果观感的改动**必须附截图**（同一组参数、同一分辨率下的前后对比）；
- 提交信息用中文或英文均可，但同一 PR 内保持一致。

## 代码风格

- **GLSL**：`#version 300 es`；片元着色器显式 `precision highp float;` 或 `mediump`（须在 spec 中注明）；避免依赖动态下标访问 uniform 数组；不使用 GLES 3.0 不存在的特性（如 compute）。
- **TypeScript/JavaScript**：严格模式、两空格缩进、命名导入。
- **C++（示例与 native 集成）**：与目标工程既有风格一致，避免引入额外依赖。
- 新增效果必须同时提供：`effects/<name>/spec.md`（规格）、`effects/<name>/shader.glsl`（源码）、`effects/<name>/reference.png`（参考图）。

## 效果规格的最低要求

每个效果必须声明：用途层（背景 / 主视效）、输入 uniform、成本档（填充率与 pass 数）、是否需要浮点渲染目标、最低驱动要求、参考图。模板见 `effects/README.md`。

## 许可

本项目采用 **Apache-2.0**。提交贡献即表示你同意以同一许可授权（inbound = outbound），并确认你有权提交该内容。若引用第三方代码，请在 PR 中说明来源与许可，并更新 `NOTICE`。
