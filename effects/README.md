# 效果包（effects）

每个效果一个目录，**三件套缺一不可**：

```
effects/<name>/
├── spec.json          # 规格（SSOT）：用途层、UBO、参数、成本、溯源
├── passes/<key>.glsl  # GLSL ES 3.00 片元；单 pass 时为 passes/final.glsl
└── reference.png      # 参考图（固定参数、固定分辨率的渲染结果）
```

- **`spec.json` 是唯一源**；`spec.md` 仅作可选的人类可读视图（v0.1 不提交），字段语义见下方模板。
- **多 pass**：按 `spec.passes` 的 `index` 顺序渲染，最后一项是 final；文件一律是**片元着色器**，全屏顶点着色器由宿主提供（`#version 300 es`，varying 名与片元一致）。
- **口径**：所有 pass 的输出**已包含 sRGB OETF**（见 `spec.color`），宿主不得再次编码；中间 RTT 为 premultiplied alpha，final 前需 unpremultiply。
- `spec.json` / `passes/` 由 `tools/sync-effects` 生成；`reference.png` 由参考渲染器生成，**不手改**。
- **已收录 48 个**，索引见 `harmony/library/src/main/resources/rawfile/effects/index.json`。

## 命名

- 目录名与效果名：**小写 + 连字符**（如 `mesh-gradient`、`contour-lines`、`dot-grid`），与上游组件名解耦（便于各自演进）。
- 同一效果的不同实现变体加后缀：`mesh-gradient.gles`、`mesh-gradient.webgl2`（仅在确实需要时）。

## 规格模板（字段语义；`spec.md` 仅作可选视图）

```markdown
# <效果名>（<English Name>）

- **用途层**：背景 / 主视效 / 可两者
- **来源**（三选一，**必填**）：
  - `original` —— 独立实现（反距离加权、值噪声这类公共技法本身无需归属）
  - `ported` —— **改编了上游代码（含自动转译产物）**：须填上游 `repo@版本` + 文件路径 + 许可；文件头保留版权声明；同步更新 `THIRD_PARTY_NOTICES.md`
  - `inspired` —— 只参考思路/观感、**未复制代码**：注明来源并写"未包含其代码"
  - 判定准则与义务见 `../docs/provenance-and-naming.md` §4–§5
- **目录命名**：用功能描述名（`mesh-gradient`），**不照搬上游组件名**（`MeshGradient`）；上游对应关系写在本字段
- **GLES 版本**：3.0（`#version 300 es`）
- **精度**：highp（片元必须显式声明）

## 输入 uniform

| 名称 | 类型 | 含义 | 取值范围 |
|---|---|---|---|
| uTime | float | 秒 | — |
| uRes | vec2 | 像素分辨率 | — |
| uColors[5] | vec3[5] | 调色板 | 0..1（线性空间） |
| uOpacity | float | 整体强度 | 0..1 |

## 驱动源

- 必需：时间
- 可选：响度包络 / 节拍脉冲 / 频谱（常理上背景层**不需要 FFT**）
- 不需要：compute、纹理输入

## 成本

- **pass 数**：1（无 FBO）
- **片元复杂度**：固定 5 次循环，无纹理采样
- **填充率档**：极低（可全屏 1.5×DPR；背景层建议 1/2 或 1/4 分辨率）
- **是否需要浮点渲染目标**：否

## 驱动/机型要求

- 最低 GLES 3.0；无扩展依赖。
- 已验证机型：<机型 / GPU / 结果 fps>

## 验收

- 参考图：`reference.png`（分辨率 <W×H>，DPR <x>，参数见上表）
- 对比方式：同参数渲染 → 目视 + （可选）逐像素差异报告

## 备注

- 已知问题 / 观感取舍 / 与其他效果的搭配建议
```

## 已收录

| 效果 | 用途层 | pass | 状态 |
|---|---|---|---|
| （待添加） | | | |
