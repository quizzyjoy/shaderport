# Changelog

All notable changes to `@quizzyjoy/shaderport` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - Unreleased

### Added

- **48 GLSL ES 3.00 effects**, delivered as `spec.json` + `passes/*.glsl` +
  `reference.png` under `rawfile/effects/`, with a generated `index.json`.
- **Final uniform values** (`spec.resolved`): colours in the upstream P3-linear
  working space, Y-inverted positions, enum codes, colour-stop arrays and
  per-frame extra fields (`meshAnchors`, `convA..D`).
- **ArkTS API**: `initShaderPort`, `listEffects`, `getEffect`,
  `getShaderSource`, `getPassSources`, `getDefaultParams`,
  `getParamDescriptors`, `encodeParam`, `validateParams`.
- **Reference validation metadata** (`spec.validation.pixelDiff`) with strict
  defaults and per-effect overrides for driver-sensitive noise.
- **Multi-pass support**: ordered `passes` with RTT ping-pong, sampler binding
  and premultiplied-alpha handling; includes `Blur`, `Glow`, `CursorRipples`.
- **Pointer support**: normalised `_sys.pointer` / `_sys.pointerActive`.

### Notes

- Rendering is performed by the host application's native layer
  (XComponent + EGL / OpenGL ES 3.0). This package ships effect assets and
  specifications, not a renderer.
- Effects ported from third-party sources are marked `ported` in each
  `spec.json` and recorded in `THIRD_PARTY_NOTICES.md`.
- Requirements: HarmonyOS API 12+, OpenGL ES 3.0, arm64-v8a.
- Known limits: effects that need shape/child alpha (`Chrome`, `Neon`) and
  stateful simulations (smoke / reaction-diffusion / boids) are not included;
  `MeshGradient` is GPU-heavy at full resolution (`cost: high`).
