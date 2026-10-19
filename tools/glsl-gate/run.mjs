#!/usr/bin/env node
/**
 * Compile+link every generated GLSL ES 3.00 fragment shader in a real GLSL compiler.
 *
 * Engine: headless Chrome -> WebGL2 -> ANGLE (SwiftShader when no GPU is available).
 * The fragment shaders are linked against a generated full-screen vertex shader whose varyings
 * are derived from the fragment shader's own `in` declarations, so a link failure means a real
 * interface/compile problem rather than a harness mismatch.
 *
 * Input : build/glsl/*.glsl
 * Output: build/glsl/gate.json
 */
import {existsSync, readFileSync, readdirSync, writeFileSync} from 'node:fs'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import puppeteer from 'puppeteer-core'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..', '..')
const glslDir = join(repoRoot, 'build', 'glsl')

if (!existsSync(glslDir)) {
    console.error(`[glsl-gate] missing ${glslDir}; run tools/wgsl2glsles/run.mjs first`)
    process.exit(2)
}

const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean)

const executablePath = candidates.find((p) => existsSync(p))
if (!executablePath) {
    console.error('[glsl-gate] no Chrome/Edge found; set CHROME_PATH')
    process.exit(2)
}

const files = readdirSync(glslDir).filter((f) => f.endsWith('.glsl')).sort()
const items = files.map((file) => ({file, fs: readFileSync(join(glslDir, file), 'utf8')}))

/** Build a full-screen VS that declares every varying the FS expects. */
const makeVertexShader = (fragmentSource) => {
    const inputs = [...fragmentSource.matchAll(/^\s*(?:smooth|flat|noperspective)?\s*in\s+(float|vec[234])\s+([A-Za-z_]\w*)\s*;/gm)]
    const outs = inputs.map(([, type, name]) => `smooth out ${type} ${name};`).join('\n')
    const assigns = inputs
        .map(([, type, name]) =>
            name === '_vs2fs_location0'
                ? `${name} = vec2(aUV.x, 1.0 - aUV.y);`
                : `${name} = ${type === 'float' ? '0.0' : `${type}(0.0)`};`,
        )
        .join('\n    ')

    return `#version 300 es
precision highp float;
layout(location = 0) in vec2 aUV;
${outs}
void main() {
    ${assigns}
    gl_Position = vec4(aUV * 2.0 - 1.0, 0.0, 1.0);
}
`
}

const payload = items.map((it) => ({file: it.file, fs: it.fs, vs: makeVertexShader(it.fs)}))

const launch = async (extraArgs) =>
    puppeteer.launch({
        executablePath,
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage', ...extraArgs],
    })

const tryRun = async (extraArgs) => {
    const browser = await launch(extraArgs)
    try {
        const page = await browser.newPage()
        await page.setContent('<!doctype html><html><body><canvas id="c" width="16" height="16"></canvas></body></html>')
        const result = await page.evaluate((items) => {
            const canvas = document.getElementById('c')
            const gl = canvas.getContext('webgl2', {antialias: false, depth: false, stencil: false})
            if (!gl) return {error: 'webgl2 unavailable'}

            const dbg = gl.getExtension('WEBGL_debug_renderer_info')
            const info = {
                version: gl.getParameter(gl.VERSION),
                glsl: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
                vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
                renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
            }

            const compile = (type, source) => {
                const shader = gl.createShader(type)
                gl.shaderSource(shader, source)
                gl.compileShader(shader)
                const ok = gl.getShaderParameter(shader, gl.COMPILE_STATUS)
                const log = gl.getShaderInfoLog(shader) || ''
                return {shader, ok, log}
            }

            const results = []
            const failures = []

            for (const item of items) {
                const vs = compile(gl.VERTEX_SHADER, item.vs)
                const fs = compile(gl.FRAGMENT_SHADER, item.fs)
                let linked = false
                let linkLog = ''
                let program = null

                if (vs.ok && fs.ok) {
                    program = gl.createProgram()
                gl.attachShader(program, vs.shader)
                    gl.attachShader(program, fs.shader)
                    gl.linkProgram(program)
                    linked = gl.getProgramParameter(program, gl.LINK_STATUS)
                    linkLog = gl.getProgramInfoLog(program) || ''
                }

                results.push({file: item.file, compiled: vs.ok && fs.ok, linked, linkLog})

                if (!vs.ok) failures.push({file: item.file, stage: 'vertex', log: vs.log})
                if (!fs.ok) failures.push({file: item.file, stage: 'fragment', log: fs.log})
                if (vs.ok && fs.ok && !linked) failures.push({file: item.file, stage: 'link', log: linkLog})

                gl.deleteShader(vs.shader)
                gl.deleteShader(fs.shader)
                if (program) gl.deleteProgram(program)
            }

            return {info, results, failures}
        }, payload)
        return result
    } finally {
        await browser.close()
    }
}

let result
try {
    result = await tryRun(['--enable-unsafe-swiftshader'])
    if (result.error) result = await tryRun(['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
} catch (error) {
    console.error(`[glsl-gate] browser failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
}

if (result.error) {
    console.error(`[glsl-gate] ${result.error}`)
    process.exit(1)
}

const report = {
    generatedAt: new Date().toISOString(),
    browser: {executablePath, ...result.info},
    counts: {
        input: payload.length,
        compiled: result.results.filter((r) => r.compiled).length,
        linked: result.results.filter((r) => r.linked).length,
        failed: result.failures.length,
    },
    failures: result.failures,
    results: result.results,
}

writeFileSync(join(glslDir, 'gate.json'), JSON.stringify(report, null, 2), 'utf8')

console.log(
    `[glsl-gate] input=${report.counts.input} compiled=${report.counts.compiled} linked=${report.counts.linked} failed=${report.counts.failed}`,
)
console.log(`[glsl-gate] renderer=${report.browser.renderer}`)
if (report.failures.length > 0) {
    console.log(`[glsl-gate] failures: ${report.failures.map((f) => `${f.file}(${f.stage})`).join(', ')}`)
}
