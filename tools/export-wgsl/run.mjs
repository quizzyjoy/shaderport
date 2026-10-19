#!/usr/bin/env node
/**
 * Export every upstream effect to self-contained WGSL.
 *
 * Usage:
 *   node tools/export-wgsl/run.mjs
 *   SHADERS_DIR=/path/to/shaders node tools/export-wgsl/run.mjs
 *
 * Output: build/wgsl/<Name>__<pass>.wgsl + build/wgsl/manifest.json
 *
 * The heavy lifting lives in export.test.ts, which must run inside the upstream package because
 * the `'use gpu'` functions are transformed by the upstream vitest config (unplugin-typegpu).
 */
import {spawnSync} from 'node:child_process'
import {copyFileSync, existsSync, mkdirSync, rmSync} from 'node:fs'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..', '..')
const upstream = process.env.SHADERS_DIR ? resolve(process.env.SHADERS_DIR) : resolve(repoRoot, '..', 'shaders')
const core = join(upstream, 'packages', 'core')
const out = join(repoRoot, 'build', 'wgsl')
const tmpTest = join(core, 'src', '__tests__', 'gpu', '_shaderport_export.test.ts')

if (!existsSync(join(core, 'package.json'))) {
    console.error(`[export-wgsl] upstream not found at ${upstream}`)
    console.error('[export-wgsl] set SHADERS_DIR to the upstream checkout root')
    process.exit(2)
}

const exec = (command, cwd) => {
    const result = spawnSync(command, {
        cwd,
        stdio: 'inherit',
        shell: true,
        env: {...process.env, SP_OUT: out},
    })
    if (result.status !== 0) process.exit(result.status ?? 1)
}

const gitDescribe = () => {
    const result = spawnSync('git describe --tags --always', {cwd: upstream, shell: true, encoding: 'utf8'})
    return result.status === 0 ? result.stdout.trim() : 'unknown'
}

if (!existsSync(join(upstream, 'node_modules'))) {
    console.log('[export-wgsl] upstream dependencies missing, installing (first run only)...')
    exec('corepack pnpm install --filter shaders-core... --ignore-scripts', upstream)
}

mkdirSync(out, {recursive: true})
process.env.SP_UPSTREAM_VERSION = gitDescribe()
console.log(`[export-wgsl] upstream=${upstream} version=${process.env.SP_UPSTREAM_VERSION}`)

copyFileSync(join(here, 'export.test.ts'), tmpTest)
try {
    exec('corepack pnpm exec vitest run src/__tests__/gpu/_shaderport_export.test.ts', core)
} finally {
    rmSync(tmpTest, {force: true})
}

console.log(`[export-wgsl] done -> ${out}`)
