# 效果规格格式（`spec.json`）

> 状态：v1 · 2026-10-19 · `spec.json` 是效果包的**唯一源**（SSOT）。
> 由 `tools/sync-effects` 生成，**不要手改**；`spec.md`（如后续生成）只作为人类可读视图。

## 1. 目录约定

```
effects/<id>/
├── spec.json
├── passes/<key>.glsl     # 片元着色器；单 pass 时为 passes/final.glsl
└── reference.png         # 512×512、t=1.0 的参考渲染
```

- `passes` 按 `spec.passes[].index` 顺序渲染，**最后一项是 final**。
- 文件都是**片元着色器**；全屏顶点着色器由宿主提供（varying 名 `_vs2fs_location0`）。
- 同一份内容镜像到 `harmony/library/src/main/resources/rawfile/effects/`。

## 2. 顶层字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `schema` | number | 当前为 `1` |
| `id` | string | kebab-case，与目录名一致 |
| `name` | string | 上游效果名（仅用于溯源与显示） |
| `category` | string | 上游分类（Textures / Shapes / Blurs / …） |
| `layer` | string | `background` / `main`（用途层） |
| `cost` | string | `very-low` / `low` / `medium` / `high` |
| `role` | string | `generator` / `warp-or-pointwise-filter` / `filter`（启发式） |
| `precision` | string | `highp` |
| `glslVersion` | string | `300 es` |
| `requires` | string[] | 组合效果为 `["input"]`，生成器为空 |
| `base` | object \| null | 组合基底：`{ "id": "plasma", "node": "base" }` |
| `ubo` | object | 见 §3 |
| `color` | object | 见 §4 |
| `passes` | array | 见 §5 |
| `props` | object | 上游 props 的 `default` / `description` / `ui` |
| `defaults` | object | 原始默认值（供编辑器与 fallback 使用） |
| `resolved` | object | **最终 uniform 值**，见 §6 |
| `validation` | object | 参考图 diff 阈值，见 §7 |
| `reference` | object \| null | `{file,width,height,time}` |
| `provenance` | object | `class` / `repo` / `version` / `path` / `license` |

## 3. UBO

```json
"ubo": {
  "block": "combined_block_0Fragment",
  "instance": "_group_0_binding_0_fs",
  "node": "n",
  "baseNode": "base"
}
```

- 着色器里的成员路径形如 `_group_0_binding_0_fs.n_n.colorA`。
- `spec` 内的参数键去掉实例前缀，保留节点：`n_n.colorA`、`n_base.colorA`。
- 数组 uniform 在 GL 里报告为 `name[0]`，规格里**存基础路径** `n_n.colorsArray`。

## 4. 颜色与 alpha

```json
"color": {
  "input": "srgb",
  "working": "p3-linear",
  "output": "srgb-encoded",
  "alpha": "straight",
  "note": "uniform colours are resolved at export time ... do not re-convert"
}
```

- `resolved` 里的颜色已经是**工作空间最终值**（上游默认 P3-linear），**不要再做 sRGB→linear**。
- 所有 final pass 都自带 sRGB OETF；宿主**不要再次编码**。
- 中间 RTT 为 premultiplied alpha；final 前需按上游 shader 的 `unpremultiplyAlpha` 处理。

## 5. passes

```json
"passes": [
  { "index": 0, "key": "rtt_rtt_0", "file": "passes/rtt_rtt_0.glsl", "entry": "rtt_rtt_0", "samplers": [] },
  { "index": 1, "key": "final",     "file": "passes/final.glsl",     "entry": "final_1",   "samplers": ["_group_1_binding_0_fs"] }
]
```

- `entry` 是 GLSL 入口函数名（通常是 `final_1` / `rtt_0`）。
- `samplers` 列出该 pass 需要绑定的纹理（最多 1 个）。
- 渲染顺序 = `index` 升序；最后一个绘制到屏幕，其余绘制到 RTT。

## 6. `defaults` vs `resolved`（最重要）

| | `defaults` | `resolved` |
|---|---|---|
| 内容 | 上游 props 的原始默认值 | 经 uniform store **最终化**后的值 |
| 颜色 | `"#5b18ca"` | `[r,g,b,a]`（P3-linear） |
| 位置 | `{x:0.5,y:0}` | `[0.5,1]`（Y 已翻转） |
| 枚举 | `"oklab"` | 数字码 |
| 色标 | `stops` 数组 | `colorsArray` / `positionsArray` / `convertedColorsArray` / `stopCount` |
| 每帧字段 | 无 | `meshAnchors`、`convA..D`（导出时以 t=1.0 执行 `onBeforeRender` 得到） |

**打包器必须优先使用 `resolved[path]`**；`defaults` 只用于旧 spec 的 fallback 和 UI 显示。

- 数组 uniform 用 `GL_UNIFORM_ARRAY_STRIDE` 按元素写入（vec3 数组有 16 字节 padding）。
- `_animTime` / `_opacity` 由运行时提供，`resolved` 中不包含。

## 7. validation

```json
"validation": {
  "pixelDiff": { "meanAbs": 1.0, "over8Ratio": 0.01, "bandMean": 2.0 }
}
```

- 默认严格阈值；高频噪声可在 `tools/sync-effects/effects.config.json` 的条目里覆盖。
- `--strict` 可强制全部走严格阈值。

## 8. provenance

```json
"provenance": {
  "class": "ported",
  "repo": "shader-effects-inc/shaders",
  "version": "v4.0.4",
  "path": "packages/core/src/shaders/Plasma/index.ts",
  "license": "MIT",
  "copyright": "© 2026 Shader Effects Inc."
}
```

- `class` ∈ `original` / `ported` / `inspired`；自动转译产物一律 `ported`。
- GLSL 文件头保留 MIT 声明；`THIRD_PARTY_NOTICES.md` 同步维护。
