#!/usr/bin/env node
/**
 * Render deterministic reference images for every effect in effects/.
 *
 * This is also the JS prototype of the native UBO packer: it reads the effect's spec defaults,
 * reflects the real UBO layout with glGetActiveUniforms(UNIFORM_OFFSET), packs by offset and
 * draws a full-screen quad. The C++ renderer will do the same thing with the same spec.
 *
 * Output: effects/<id>/reference.png (mirrored into the HAR rawfile tree)
 */
import {existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import puppeteer from 'puppeteer-core'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..', '..')
const effectsRoot = join(repoRoot, 'effects')
const rawfileRoot = join(repoRoot, 'harmony', 'library', 'src', 'main', 'resources', 'rawfile', 'effects')

const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean)

const executablePath = candidates.find((p) => existsSync(p))
if (!executablePath) {
    console.error('[render-reference] no Chrome/Edge found; set CHROME_PATH')
    process.exit(2)
}

const effectDirs = readdirSync(effectsRoot, {withFileTypes: true})
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()

const items = []
for (const id of effectDirs) {
    const dir = join(effectsRoot, id)
    const specPath = join(dir, 'spec.json')
    if (!existsSync(specPath)) continue
    const spec = JSON.parse(readFileSync(specPath, 'utf8'))
    const fragmentPath = join(dir, spec.passes[0].file)
    if (!existsSync(fragmentPath)) {
        console.warn(`[render-reference] ${id}: missing ${spec.passes[0].file}`)
        continue
    }
    if (spec.passes.length > 1) {
        console.warn(`[render-reference] ${id}: multi-pass not rendered yet (${spec.passes.length} passes)`)
        continue
    }
    // Composite effects (filters/warps) also need the base effect's defaults under `n_base`.
    const defaults = {}
    for (const [key, value] of Object.entries(spec.defaults ?? {})) {
        defaults[`n_${spec.ubo.node}.${key}`] = value
    }
    if (spec.base) {
        const baseSpecPath = join(effectsRoot, spec.base.id, 'spec.json')
        if (existsSync(baseSpecPath)) {
            const baseSpec = JSON.parse(readFileSync(baseSpecPath, 'utf8'))
            for (const [key, value] of Object.entries(baseSpec.defaults ?? {})) {
                defaults[`n_${spec.base.node}.${key}`] = value
            }
        }
    }

    items.push({
        id,
        dir,
        spec,
        defaults,
        fs: readFileSync(fragmentPath, 'utf8'),
        width: spec.reference?.width ?? 512,
        height: spec.reference?.height ?? 512,
        time: spec.reference?.time ?? 1.0,
    })
}

if (items.length === 0) {
    console.error('[render-reference] no single-pass effects found')
    process.exit(1)
}

// Optional diff mode:
//   node tools/render-reference/run.mjs --capture <capture-<id>.rgba>
// The capture file is <uint32 width><uint32 height><RGBA...> from nativeCapture().
const args = process.argv.slice(2)
const captureIndex = args.indexOf('--capture')
const capturePath = captureIndex >= 0 ? args[captureIndex + 1] : null
let capture = null

if (capturePath) {
    const raw = readFileSync(capturePath)
    const width = raw.readUInt32LE(0)
    const height = raw.readUInt32LE(4)
    const bytes = raw.subarray(8)
    const match = (capturePath.split(/[\\/]/).pop() ?? '').match(/capture-(.+)\.rgba$/)
    const id = match ? match[1] : null
    if (!id) {
        console.error(`[render-reference] cannot infer effect id from ${capturePath}`)
        process.exit(2)
    }
    const target = items.find((it) => it.id === id)
    if (!target) {
        console.error(`[render-reference] no effect package for '${id}'`)
        process.exit(2)
    }
    if (bytes.length !== width * height * 4) {
        console.error(`[render-reference] capture size mismatch: ${bytes.length} != ${width * height * 4}`)
        process.exit(2)
    }
    capture = {id, width, height, base64: bytes.toString('base64')}
    items.length = 0
    items.push({...target, width, height, time: target.spec.reference?.time ?? 1.0})
}

const makeVertexShader = (fragmentSource) => {
    const inputs = [...fragmentSource.matchAll(/^\s*(?:smooth|flat|noperspective)?\s*in\s+(float|vec[234])\s+([A-Za-z_]\w*)\s*;/gm)]
    const outs = inputs.map(([, type, name]) => `smooth out ${type} ${name};`).join('\n')
    const assigns = inputs
        .map(([, type, name]) =>
            name === '_vs2fs_location0'
                ? `${name} = vec2(uv.x, 1.0 - uv.y);`
                : `${name} = ${type === 'float' ? '0.0' : `${type}(0.0)`};`,
        )
        .join('\n    ')

    return `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
${outs}
void main() {
    vec2 uv = aPos * 0.5 + 0.5;
    ${assigns}
    gl_Position = vec4(aPos, 0.0, 1.0);
}
`
}

const payload = items.map((it) => ({
    id: it.id,
    fs: it.fs,
    vs: makeVertexShader(it.fs),
    width: it.width,
    height: it.height,
    time: it.time,
    ubo: it.spec.ubo,
    defaults: it.defaults,
    compare: capture ? capture.base64 : null,
}))

const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'],
})

let results
try {
    const page = await browser.newPage()
    await page.setContent('<!doctype html><html><body></body></html>')
    results = await page.evaluate((items) => {
        const EDGES = {stretch: 0, wrap: 1, mirror: 2, transparent: 3}
        const COLOR_SPACE = {linear: 0, oklch: 1, oklab: 2, hsl: 3, hsv: 4, lch: 5}

        const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))

        const parseHex = (hex) => {
            const h = hex.replace('#', '')
            const full = h.length === 3 || h.length === 4 ? h.split('').map((c) => c + c).join('') : h
            const r = parseInt(full.slice(0, 2), 16) / 255
            const g = parseInt(full.slice(2, 4), 16) / 255
            const b = parseInt(full.slice(4, 6), 16) / 255
            const a = full.length >= 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1
            return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b), a]
        }

        const toNumbers = (value, n) => {
            if (typeof value === 'string') {
                if (value.startsWith('#')) return parseHex(value).slice(0, n)
                if (value in EDGES) return [EDGES[value]]
                if (value in COLOR_SPACE) return [COLOR_SPACE[value]]
                return null
            }
            if (typeof value === 'number') return [value]
            if (Array.isArray(value)) return value.map(Number).slice(0, n)
            if (value && typeof value === 'object') {
                const keys = ['x', 'y', 'z', 'w']
                if (keys.some((k) => k in value)) return keys.map((k) => Number(value[k] ?? 0)).slice(0, n)
            }
            return null
        }

        const out = []

        for (const item of items) {
            const canvas = document.createElement('canvas')
            canvas.width = item.width
            canvas.height = item.height
            const gl = canvas.getContext('webgl2', {
                antialias: false,
                depth: false,
                stencil: false,
                preserveDrawingBuffer: true,
                premultipliedAlpha: false,
            })
            if (!gl) return {error: 'webgl2 unavailable'}

            const compile = (type, source) => {
                const shader = gl.createShader(type)
                gl.shaderSource(shader, source)
                gl.compileShader(shader)
                if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                    const log = gl.getShaderInfoLog(shader)
                    gl.deleteShader(shader)
                    throw new Error(`compile: ${log}`)
                }
                return shader
            }

            let program
            try {
                const vs = compile(gl.VERTEX_SHADER, item.vs)
                const fs = compile(gl.FRAGMENT_SHADER, item.fs)
                program = gl.createProgram()
                gl.attachShader(program, vs)
                gl.attachShader(program, fs)
                gl.linkProgram(program)
                if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                    throw new Error(`link: ${gl.getProgramInfoLog(program)}`)
                }
                gl.useProgram(program)
            } catch (error) {
                out.push({id: item.id, error: String(error.message ?? error)})
                continue
            }

            // ---- UBO reflection + packing (prototype of the native SpPack) ----
            const prefix = item.ubo.instance
            let blockIndex = gl.getUniformBlockIndex(program, item.ubo.block)
            if (blockIndex === gl.INVALID_INDEX) {
                const blocks = gl.getProgramParameter(program, gl.ACTIVE_UNIFORM_BLOCKS)
                for (let i = 0; i < blocks; i++) {
                    if (gl.getActiveUniformBlockName(program, i) === item.ubo.block) {
                        blockIndex = i
                        break
                    }
                }
            }

            const members = []
            const missing = []
            let blockSize = 0

            if (blockIndex !== gl.INVALID_INDEX) {
                blockSize = gl.getActiveUniformBlockParameter(program, blockIndex, gl.UNIFORM_BLOCK_DATA_SIZE)
                gl.uniformBlockBinding(program, blockIndex, 0)

                const buffer = new ArrayBuffer(blockSize)
                const view = new DataView(buffer)
                const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS)

                for (let i = 0; i < count; i++) {
                    const info = gl.getActiveUniform(program, i)
                    if (!info || !info.name.startsWith(`${prefix}.`)) continue
                    const offset = gl.getActiveUniforms(program, [i], gl.UNIFORM_OFFSET)[0]
                    const path = info.name.slice(prefix.length + 1)
                    const [node, ...rest] = path.split('.')
                    const member = rest.join('.')

                    let value = null
                    if (node === '_sys') {
                        const system = {
                            time: item.time,
                            viewportSize: [item.width, item.height],
                            logicalViewportSize: [item.width, item.height],
                            aspect: item.width / item.height,
                            pointer: [0.5, 0.5],
                            pointerActive: 0,
                        }
                        value = system[member]
                    } else if (node === 'n_root') {
                        value = member === '_opacity' ? 1 : undefined
                    } else if (node === 'n_n' || node === 'n_base') {
                        if (member === '_opacity') value = 1
                        else if (member === '_animTime') value = item.time
                        else if (member === 'stopCount') value = Array.isArray(item.defaults[`${node}.stops`]) ? item.defaults[`${node}.stops`].length : 0
                        else value = item.defaults[path]
                    }

                    const nums = value === undefined || value === null ? null : toNumbers(value, info.size > 1 ? info.size * 4 : 4)
                    // Padding and compile-time-disabled arrays are expected to stay zero.
                    const ignorable = /_pad\d_$/.test(member) || info.size > 1
                    if (nums === null && !ignorable) missing.push(info.name)

                    if (info.size === 1 && nums) {
                        switch (info.type) {
                            case gl.FLOAT:
                                view.setFloat32(offset, Number(nums[0] ?? 0), true)
                                break
                            case gl.FLOAT_VEC2:
                                for (let k = 0; k < 2; k++) view.setFloat32(offset + k * 4, Number(nums[k] ?? 0), true)
                                break
                            case gl.FLOAT_VEC3:
                                for (let k = 0; k < 3; k++) view.setFloat32(offset + k * 4, Number(nums[k] ?? 0), true)
                                break
                            case gl.FLOAT_VEC4:
                                for (let k = 0; k < 4; k++) view.setFloat32(offset + k * 4, Number(nums[k] ?? 0), true)
                                break
                            case gl.INT:
                            case gl.BOOL:
                                view.setInt32(offset, Number(nums[0] ?? 0), true)
                                break
                            default:
                                break
                        }
                    }

                    members.push({name: info.name, type: info.type, offset, size: info.size})
                }

                const ubo = gl.createBuffer()
                gl.bindBuffer(gl.UNIFORM_BUFFER, ubo)
                gl.bufferData(gl.UNIFORM_BUFFER, blockSize, gl.DYNAMIC_DRAW)
                gl.bufferSubData(gl.UNIFORM_BUFFER, 0, new Uint8Array(buffer))
                gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, ubo)
            }

            // ---- fullscreen draw ----
            const vao = gl.createVertexArray()
            gl.bindVertexArray(vao)
            const vbo = gl.createBuffer()
            gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
            gl.bufferData(
                gl.ARRAY_BUFFER,
                new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
                gl.STATIC_DRAW,
            )
            gl.enableVertexAttribArray(0)
            gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
            gl.viewport(0, 0, item.width, item.height)
            gl.clearColor(0, 0, 0, 0)
            gl.clear(gl.COLOR_BUFFER_BIT)
            gl.drawArrays(gl.TRIANGLES, 0, 6)
            gl.finish()

            const pixels = new Uint8Array(item.width * item.height * 4)
            gl.readPixels(0, 0, item.width, item.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
            let min = 255
            let max = 0
            let sum = 0
            let nonBlack = 0
            for (let i = 0; i < pixels.length; i += 4) {
                const lum = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3
                if (lum < min) min = lum
                if (lum > max) max = lum
                sum += lum
                if (lum > 2) nonBlack++
            }

            let diff = null
            if (item.compare) {
                const binary = atob(item.compare)
                if (binary.length !== pixels.length) {
                    diff = {error: `size mismatch: reference=${pixels.length} capture=${binary.length}`}
                } else {
                    const total = pixels.length / 4
                    let diffSum = 0
                    let diffMax = 0
                    let over8 = 0
                    let over16 = 0
                    for (let i = 0; i < pixels.length; i += 4) {
                        const dr = Math.abs(pixels[i] - binary.charCodeAt(i))
                        const dg = Math.abs(pixels[i + 1] - binary.charCodeAt(i + 1))
                        const db = Math.abs(pixels[i + 2] - binary.charCodeAt(i + 2))
                        const d = Math.max(dr, dg, db)
                        diffSum += (dr + dg + db) / 3
                        if (d > diffMax) diffMax = d
                        if (d > 8) over8++
                        if (d > 16) over16++
                    }
                    diff = {
                        meanAbs: diffSum / total,
                        maxAbs: diffMax,
                        over8Ratio: over8 / total,
                        over16Ratio: over16 / total,
                        pixels: total,
                    }
                }
            }

            out.push({
                id: item.id,
                png: canvas.toDataURL('image/png'),
                blockSize,
                members,
                missing,
                diff,
                stats: {
                    min,
                    max,
                    mean: sum / (pixels.length / 4),
                    nonBlackRatio: nonBlack / (pixels.length / 4),
                },
            })
        }

        return {items: out}
    }, payload)
} finally {
    await browser.close()
}

if (results.error) {
    console.error(`[render-reference] ${results.error}`)
    process.exit(1)
}

let written = 0
for (const result of results.items) {
    if (result.error) {
        console.error(`[render-reference] ${result.id}: ${result.error}`)
        continue
    }
    if (capture) {
        const diffPath = join(repoRoot, 'build', 'diff', `${result.id}.json`)
        mkdirSync(dirname(diffPath), {recursive: true})
        writeFileSync(diffPath, JSON.stringify({id: result.id, capture: capturePath, ...result.diff}, null, 2))
        if (result.diff.error) {
            console.error(`[render-reference] diff ${result.id}: ${result.diff.error}`)
            process.exitCode = 1
        } else {
            console.log(
                `[render-reference] diff ${result.id}: meanAbs=${result.diff.meanAbs.toFixed(2)} ` +
                    `max=${result.diff.maxAbs} over8=${(result.diff.over8Ratio * 100).toFixed(2)}% ` +
                    `over16=${(result.diff.over16Ratio * 100).toFixed(2)}% (${capture.width}x${capture.height})`,
            )
            if (result.diff.over8Ratio > 0.05) {
                process.exitCode = 1
            }
        }
        continue
    }
    const base64 = result.png.replace(/^data:image\/png;base64,/, '')
    const bytes = Buffer.from(base64, 'base64')
    const effectDir = join(effectsRoot, result.id)
    writeFileSync(join(effectDir, 'reference.png'), bytes)

    const rawDir = join(rawfileRoot, result.id)
    mkdirSync(rawDir, {recursive: true})
    writeFileSync(join(rawDir, 'reference.png'), bytes)

    written++
    console.log(
        `[render-reference] ${result.id}: ${bytes.length}B block=${result.blockSize} members=${result.members.length} ` +
            `missing=${result.missing.length} nonBlack=${(result.stats.nonBlackRatio * 100).toFixed(1)}% ` +
            `lum=${result.stats.min.toFixed(0)}..${result.stats.max.toFixed(0)} mean=${result.stats.mean.toFixed(1)}`,
    )
    if (result.missing.length > 0) {
        console.log(`[render-reference]   missing defaults: ${result.missing.join(', ')}`)
    }
}

console.log(`[render-reference] wrote ${written}/${results.items.length} reference images`)
