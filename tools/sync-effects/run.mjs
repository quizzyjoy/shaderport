#!/usr/bin/env node
/**
 * Turn converted GLSL into shippable effect packages.
 *
 * Reads : build/wgsl/manifest.json (props, category, provenance)
 *         build/glsl/report.json   (passes, entry points, reflection)
 * Writes: effects/<id>/{spec.json, passes/<key>.glsl}
 *         harmony/library/src/main/resources/rawfile/effects/<id>/... (mirror)
 *         harmony/library/src/main/resources/rawfile/effects/index.json
 *
 * The effect list and its layer/cost buckets live in effects.config.json.
 */
import {copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..', '..')
const buildDir = join(repoRoot, 'build')
const wgslManifestPath = join(buildDir, 'wgsl', 'manifest.json')
const glslReportPath = join(buildDir, 'glsl', 'report.json')
const effectsRoot = join(repoRoot, 'effects')
const rawfileRoot = join(repoRoot, 'harmony', 'library', 'src', 'main', 'resources', 'rawfile', 'effects')

for (const p of [wgslManifestPath, glslReportPath]) {
    if (!existsSync(p)) {
        console.error(`[sync-effects] missing ${p}; run export-wgsl and wgsl2glsles first`)
        process.exit(2)
    }
}

const wgslManifest = JSON.parse(readFileSync(wgslManifestPath, 'utf8'))
const glslReport = JSON.parse(readFileSync(glslReportPath, 'utf8'))
const config = JSON.parse(readFileSync(join(here, 'effects.config.json'), 'utf8'))
const upstreamVersion = wgslManifest.upstream?.version ?? 'unknown'

const header = (name, upstreamPath) =>
    `// Ported from shader-effects-inc/shaders (MIT, (c) 2026 Shader Effects Inc.)
//   source: ${upstreamPath} @ ${upstreamVersion}
//   changes: WGSL -> GLSL ES 3.00 via naga ${glslReport.naga}; no manual edits
//   license: MIT (this file) ; Apache-2.0 (project)
`

const withHeader = (code, name, upstreamPath) => {
    const lines = code.split('\n')
    const versionIndex = lines.findIndex((l) => l.trim().startsWith('#version'))
    if (versionIndex === -1) return `${header(name, upstreamPath)}${code}`
    const before = lines.slice(0, versionIndex + 1)
    const after = lines.slice(versionIndex + 1)
    return `${before.join('\n')}\n${header(name, upstreamPath)}${after.join('\n')}`
}

const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()

const inferRole = (effect) => {
    if (!effect.requiresChild) return 'generator'
    return effect.requiresRTT ? 'filter' : 'warp-or-pointwise-filter'
}

const passOrder = (a, b) => {
    if (a.key === 'final') return 1
    if (b.key === 'final') return -1
    return a.key.localeCompare(b.key)
}

const indexEntries = []
const written = []

for (const entry of config) {
    const effect = wgslManifest.effects.find((e) => e.name === entry.name)
    if (!effect) {
        console.error(`[sync-effects] ${entry.name} was not exported (see build/wgsl/manifest.json failures)`)
        process.exit(1)
    }

    const id = entry.id ?? kebab(entry.name)
    const upstreamPath = `packages/core/src/shaders/${entry.name}/index.ts`
    const passes = glslReport.passes
        .filter((p) => p.source.startsWith(`${entry.name}__`))
        .map((p) => ({...p, key: p.source.slice(entry.name.length + 2).replace(/\.wgsl$/, '')}))
        .sort(passOrder)

    if (passes.length === 0) {
        console.error(`[sync-effects] ${entry.name} has no converted GLSL`)
        process.exit(1)
    }

    const effectDir = join(effectsRoot, id)
    // Keep the rendered reference across regeneration: it is produced by tools/render-reference,
    // not by this tool, so deleting the directory would silently drop it.
    const referencePath = join(effectDir, 'reference.png')
    const referenceBytes = existsSync(referencePath) ? readFileSync(referencePath) : null
    rmSync(effectDir, {recursive: true, force: true})
    mkdirSync(join(effectDir, 'passes'), {recursive: true})
    if (referenceBytes) writeFileSync(referencePath, referenceBytes)

    const specPasses = passes.map((p, i) => {
        // Always POSIX separators in the spec: the same value is consumed by ArkTS/native
        // rawfile lookups on device, not just by this Windows build host.
        const file = `passes/${p.key}.glsl`
        const absolute = join(effectDir, 'passes', `${p.key}.glsl`)
        const code = readFileSync(join(buildDir, 'glsl', p.file), 'utf8')
        writeFileSync(absolute, withHeader(code, entry.name, upstreamPath), 'utf8')
        return {
            index: i,
            key: p.key,
            file,
            entry: p.entryPoint,
            samplers: Object.keys(p.reflection?.textures ?? {}),
        }
    })

    const props = effect.props ?? {}
    const defaults = {}
    for (const [name, prop] of Object.entries(props)) defaults[name] = prop.default

    const spec = {
        schema: 1,
        id,
        name: entry.name,
        category: effect.category,
        layer: entry.layer,
        cost: entry.cost,
        role: inferRole(effect),
        precision: 'highp',
        glslVersion: '300 es',
        requires: effect.composite ? ['input'] : [],
        // Composite effects are exported on top of Plasma; their RTT pass needs the base
        // effect's own defaults, addressed under the `n_base` UBO node.
        base: effect.composite ? {id: 'plasma', node: 'base'} : null,
        ubo: {
            block: 'combined_block_0Fragment',
            instance: '_group_0_binding_0_fs',
            node: 'n',
            baseNode: effect.composite ? 'base' : null,
        },
        color: {
            input: 'srgb',
            working: 'p3-linear',
            output: 'srgb-encoded',
            alpha: 'straight',
            note: 'uniform colours are resolved at export time in the upstream working space (P3-linear by default); do not re-convert. The final pass already applies the sRGB OETF; do not encode again.',
        },
        passes: specPasses,
        props,
        defaults,
        // FINAL post-transform uniform values exported from the upstream uniform store
        // (colour-stops arrays, converted colours, px/percent props, enums, positions).
        resolved: effect.resolved ?? {},
        reference: {
            file: 'reference.png',
            width: 512,
            height: 512,
            time: 1.0,
        },
        provenance: {
            class: 'ported',
            repo: 'shader-effects-inc/shaders',
            version: upstreamVersion,
            path: upstreamPath,
            license: 'MIT',
            copyright: '\u00a9 2026 Shader Effects Inc.',
        },
    }

    writeFileSync(join(effectDir, 'spec.json'), JSON.stringify(spec, null, 2), 'utf8')

    // Mirror into the HAR package.
    const rawDir = join(rawfileRoot, id)
    rmSync(rawDir, {recursive: true, force: true})
    mkdirSync(join(rawDir, 'passes'), {recursive: true})
    copyFileSync(join(effectDir, 'spec.json'), join(rawDir, 'spec.json'))
    for (const p of specPasses) {
        copyFileSync(join(effectDir, p.file), join(rawDir, p.file))
    }
    // References are produced by tools/render-reference; mirror them so a later sync never
    // leaves the HAR without the image that spec.reference points at.
    if (referenceBytes) copyFileSync(referencePath, join(rawDir, 'reference.png'))

    indexEntries.push({
        id,
        name: entry.name,
        category: effect.category,
        layer: entry.layer,
        cost: entry.cost,
        passes: specPasses.length,
        requires: spec.requires,
        path: `effects/${id}`,
    })
    written.push({id, passes: specPasses.length})
}

writeFileSync(
    join(rawfileRoot, 'index.json'),
    JSON.stringify({schema: 1, upstream: wgslManifest.upstream, effects: indexEntries}, null, 2),
    'utf8',
)

console.log(`[sync-effects] wrote ${written.length} effects: ${written.map((w) => `${w.id}(${w.passes}p)`).join(', ')}`)
console.log(`[sync-effects] effects -> ${effectsRoot}`)
console.log(`[sync-effects] rawfile -> ${rawfileRoot}`)
