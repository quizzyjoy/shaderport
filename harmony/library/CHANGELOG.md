# Changelog

All notable changes to `@quizzyjoy/shaderport` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - Unreleased

### Added

- Initial package skeleton: rawfile-delivered GLSL ES 3.00 effects with per-effect specs.
- ArkTS API surface: `listEffects`, `getEffect`, `getShaderSource`, `validateParams`.

### Notes

- Rendering is performed by the host application's native layer
  (XComponent + EGL / OpenGL ES 3.0). This package ships effect assets and
  specifications, not a renderer.
- Effects ported from third-party sources are marked `ported` in each
  `spec.json` and recorded in `THIRD_PARTY_NOTICES.md`.
