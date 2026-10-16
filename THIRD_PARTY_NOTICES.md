# 第三方声明（Third-Party Notices）

本项目整体采用 **Apache-2.0**（见 `LICENSE`）。以下第三方内容按其**自身许可**使用，本项目对其不主张所有权；若本项目的某个文件改编自第三方代码，该文件仍按原许可授权。

> 维护要求：**新增或更新任何移植来源时，必须在同一 PR 内更新本文件**（见 `docs/provenance-and-naming.md` §5）。

---

## 1. shader-effects-inc/shaders — MIT

- **来源**：https://github.com/shader-effects-inc/shaders
- **许可**：MIT License，© 2026 Shader Effects Inc.
- **本项目如何使用**：
  - **效果选型与规格设计参考**（未包含其代码）；
  - **移植来源**：部分效果若自上项目移植，将在下表逐条登记。
- **与上游的关系**：本项目为独立第三方项目，**非官方移植、无隶属或背书关系**；详见 `docs/provenance-and-naming.md`。

### 许可全文

```
MIT License

Copyright (c) 2026 Shader Effects Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### 已登记的移植来源

| 本项目效果 | 类别 | 上游路径 | 上游版本 | 说明 |
|---|---|---|---|---|
| （待登记） | `ported` | `packages/core/src/shaders/<Name>/index.ts` | | WGSL → GLSL ES 3.00 |

---

## 2. naga（gfx-rs/wgpu）— MIT OR Apache-2.0

- **来源**：https://github.com/gfx-rs/wgpu（`naga` crate）
- **许可**：MIT OR Apache-2.0（双许可，使用者可择一）
- **用途**：`tools/wgsl2glsles` 的 WGSL → GLSL ES 300/310 转换后端（构建/工具链依赖）

---

## 3. software-mansion/TypeGPU — MIT

- **来源**：https://github.com/software-mansion/TypeGPU
- **许可**：MIT
- **用途**：**仅作为可行性证据与文档引用**（其 `@typegpu/gl` 提供 WebGL/GLSL 侧能力）。本项目**不包含**其代码、不作为运行时依赖。

---

## 4. 其他

| 名称 | 许可 | 用途 |
|---|---|---|
| （按需登记） | | |
