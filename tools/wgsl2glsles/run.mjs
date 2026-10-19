#!/usr/bin/env node
/**
 * Convert exported WGSL to GLSL ES 3.00.
 *
 * Input : build/wgsl/*.wgsl (+ manifest.json produced by tools/export-wgsl)
 * Output: build/glsl/<same name>.glsl + build/glsl/report.json
 *
 * The report records, per pass: entry point, reflection (UBO blocks / textures), hashes,
 * and the GLES capability gaps found in the source (compute / storage / external texture / f16).
 */
import {createHash} from 'node:crypto'
import {existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {nagaVersion, parseWgsl, validate, writeGlsl} from 'naga-wasm'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..', '..')
const wgslDir = join(repoRoot, 'build', 'wgsl')
const outDir = join(repoRoot, 'build', 'glsl')

if (!existsSync(wgslDir)) {
    console.error(`[wgsl2glsles] missing ${wgslDir}; run tools/export-wgsl/run.mjs first`)
    process.exit(2)
}

mkdirSync(outDir, {recursive: true})

const sha256 = (s) => createHash('sha256').update(s).digest('hex')

const ENTRY_RE = /@(fragment|compute|vertex)\s+fn\s+([A-Za-z_][A-Za-z0-9_]*)/

const scanGaps = (source) => ({
    compute: /@compute\b/.test(source),
    storage: /var<\s*storage\b/.test(source),
    textureExternal: /\btexture_external\b/.test(source),
    f16: /\bf16\b/.test(source),
})

const files = readdirSync(wgslDir).filter((f) => f.endsWith('.wgsl')).sort()
const converted = []
const failures = []
const gaps = []

for (const file of files) {
    const source = readFileSync(join(wgslDir, file), 'utf8')
    const found = source.match(ENTRY_RE)
    if (!found) {
        failures.push({file, stage: 'entry', error: 'no entry point found'})
        continue
    }
    const stage = found[1]
    const entryPoint = found[2]

    const gap = scanGaps(source)
    if (Object.values(gap).some(Boolean)) gaps.push({file, ...gap})

    if (stage !== 'fragment') {
        failures.push({file, stage: 'entry', error: `unsupported entry stage '${stage}'`})
        continue
    }

    let moduleHandle
    let infoHandle
    try {
        moduleHandle = parseWgsl(source)
        infoHandle = validate(moduleHandle)
        const out = writeGlsl(moduleHandle, infoHandle, {
            version: '300 es',
            stage: 'fragment',
            entryPoint,
            reflect: true,
        })
        const code = out.code
        const outFile = file.replace(/\.wgsl$/, '.glsl')
        writeFileSync(join(outDir, outFile), code, 'utf8')
        converted.push({
            file: outFile,
            source: file,
            entryPoint,
            bytes: Buffer.byteLength(code),
            sha256: sha256(code),
            reflection: out.reflection,
        })
    } catch (error) {
        const kind = error && typeof error === 'object' && 'kind' in error ? error.kind : 'unknown'
        const message = error && typeof error === 'object' && 'formatted' in error ? error.formatted : String(error)
        failures.push({file, stage: kind, error: String(message).split('\n').slice(0, 12).join('\n')})
    } finally {
        // naga-wasm's handles are borrowed by the writer; explicit free() throws
        // ("attempted to take ownership of Rust value while it was borrowed").
        // The CLI is short-lived, so let the wasm memory be reclaimed on process exit.
    }
}

let upstream = {repository: 'shader-effects-inc/shaders', version: 'unknown'}
const manifestPath = join(wgslDir, 'manifest.json')
if (existsSync(manifestPath)) {
    upstream = JSON.parse(readFileSync(manifestPath, 'utf8')).upstream ?? upstream
}

const report = {
    upstream,
    naga: nagaVersion,
    generatedAt: new Date().toISOString(),
    counts: {
        input: files.length,
        converted: converted.length,
        failed: failures.length,
        withCapabilityGaps: gaps.length,
    },
    passes: converted,
    capabilityGaps: gaps,
    failures,
}

writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8')

console.log(
    `[wgsl2glsles] input=${report.counts.input} converted=${report.counts.converted} failed=${report.counts.failed} gaps=${report.counts.withCapabilityGaps}`,
)
if (failures.length > 0) {
    console.log(`[wgsl2glsles] failures: ${failures.map((f) => f.file).join(', ')}`)
}
