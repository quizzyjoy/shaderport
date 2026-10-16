## 这个 PR 做了什么

<!-- 一句话说明；标题请用 Conventional Commits：feat|fix|perf|refactor|docs|test|build|chore(revert) -->

## 关联

- Closes #
- 设计讨论（如为新增功能/效果，须先有 issue）：

## 类型

- [ ] 新效果
- [ ] 缺陷修复
- [ ] 工具/转换器
- [ ] 文档
- [ ] 其他：

## 溯源自检（**必勾**）

- [ ] 每个新/改效果的 `spec.md` 已填写「来源」类别（`original` / `ported` / `inspired`）
- [ ] 若为 **`ported`**：文件头已加版权与许可注释（含上游 `repo@版本` 与文件路径），且已更新 `THIRD_PARTY_NOTICES.md`
- [ ] 若为 **`inspired`**：已注明来源并写明"未包含其代码"
- [ ] 项目名 / 包名 / 标识**未使用**上游品牌词（`shaders`、`shader-effects`、`Shader Effects`）

## 效果类改动（非效果类可跳过）

- [ ] 已附**参考图或录屏**（同参数、同分辨率、与 `reference.png` 可对比）
- [ ] 已注明**验证机型/GPU 与实测帧率**
- [ ] `spec.md` 的成本档（pass 数、填充率、是否需浮点渲染目标）已更新
- [ ] 未使用 GLES 3.0 不存在的能力（`@compute`、storage texture 等）

## 检查清单

- [ ] 一个 PR 只做一件事
- [ ] 未改动 `CHANGELOG.md`（由维护者按提交标题生成）
- [ ] 许可：本 PR 内容按 **Apache-2.0** 授权；第三方内容已按原许可归属
