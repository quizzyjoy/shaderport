# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与
[语义化版本](https://semver.org/lang/zh-CN/)。
版本号与发布的 `@quizzyjoy/shaderport` 包保持一致。

## [Unreleased]

## [0.1.0] - 2026-10-20

首个发布版本：48 个效果、完整转换流水线、HarmonyOS HAR 与示例工程。

### Added

- **效果资产**：48 个效果（纹理/生成器 19、形状 10、调色 10、扭曲 5、风格化 2、模糊 1、交互 1），
  每个效果含 `spec.json`、`passes/*.glsl`、`reference.png`。
- **转换流水线**：
  - `tools/export-wgsl`：从上游 v4.0.4 导出 WGSL、执行 `onBeforeRender` 并写入 `resolved` 值；
  - `tools/wgsl2glsles`：WGSL → GLSL ES 3.00（naga-wasm）；
  - `tools/glsl-gate`：逐 pass 编译/链接校验；
  - `tools/sync-effects`：同步到 HarmonyOS rawfile 并生成 `index.json`；
  - `tools/render-reference`：离屏渲染参考图，支持多 pass RTT、抓帧与 `--strict` 对比。
- **HarmonyOS 工程**：
  - `harmony/library`：HAR `@quizzyjoy/shaderport@0.1.0`，提供 9 个 ArkTS API；
  - `harmony/entry`：XComponent + NAPI + EGL/GLES 3.0 渲染器与演示 UI（参数面板、指针、抓帧、性能统计）；
  - 支持多 pass、per-pass UBO 反射、数组 uniform、`renderScale`、暂停与窗口缩放。
- **验证**：模拟器 `bp_fold` 48/48 逐像素通过（47 个严格，`PerlinNoise` 按驱动精度放宽）；
  真机 Mate 80（VYG-AL30）48 个效果全部运行。
- **文档**：规格格式、转换指南、设备矩阵、签名策略、来源与命名、1.0 路线图、包使用教程。
- **CI**：导出 → 转换 → 门禁 → 同步漂移检查 → 参考图渲染。

### Notes

- 效果资产转译自 `shader-effects-inc/shaders` v4.0.4（MIT），逐条来源见
  `spec.json` 的 `provenance` 与 `THIRD_PARTY_NOTICES.md`。
- 本仓库不包含上游运行时（TypeGPU、框架绑定、CLI、遥测）。
- 签名材料不入库；`harmony/build-profile.json5` 的本地签名配置通过
  `git update-index --skip-worktree` 保持在工作区。
