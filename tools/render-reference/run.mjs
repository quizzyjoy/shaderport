#!/usr/bin/env node
/**
 * Render deterministic reference images for every effect in effects/.
 *
 * This is also the JS prototype of the native renderer: it reflects each pass's real UBO layout
 * with glGetActiveUniforms(UNIFORM_OFFSET), packs the spec defaults by offset, ping-pongs
 * intermediate passes through RGBA8 FBOs and draws the final pass to the canvas. The C++ renderer
 * does the same thing with the same spec.
 *
 * Output: effects/<id>/reference.png (mirrored into the HAR rawfile tree)
 *
 * Diff mode:
 *   node tools/render-reference/run.mjs --capture <capture-<id>.rgba>
 * The capture file is <uint32 width><uint32 height><RGBA...> from nativeCapture().
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

/** Merge the effect's defaults with the composite base effect's defaults, keyed by UBO path. */
const collectDefaults = (spec) => {
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
    return defaults
}

/** Enum props carry their value order in ui.options; key by UBO path. */
const collectEnums = (spec) => {
    const enums = {}
    const add = (source, node) => {
        for (const [key, prop] of Object.entries(source.props ?? {})) {
            const options = prop?.ui?.options
            if (Array.isArray(options)) {
                const map = {}
                options.forEach((option, index) => {
                    map[option.value] = index
                })
                enums[`n_${node}.${key}`] = map
            }
        }
    }
    add(spec, spec.ubo.node)
    if (spec.base) {
        const baseSpecPath = join(effectsRoot, spec.base.id, 'spec.json')
        if (existsSync(baseSpecPath)) {
            add(JSON.parse(readFileSync(baseSpecPath, 'utf8')), spec.base.node)
        }
    }
    return enums
}

/** UI types are needed for position props (they are Y-inverted in the uniform). */
const collectUiTypes = (spec) => {
    const types = {}
    const add = (source, node) => {
        for (const [key, prop] of Object.entries(source.props ?? {})) {
            if (typeof prop?.ui?.type === 'string') {
                types[`n_${node}.${key}`] = prop.ui.type
            }
        }
    }
    add(spec, spec.ubo.node)
    if (spec.base) {
        const baseSpecPath = join(effectsRoot, spec.base.id, 'spec.json')
        if (existsSync(baseSpecPath)) {
            add(JSON.parse(readFileSync(baseSpecPath, 'utf8')), spec.base.node)
        }
    }
    return types
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
    const passes = []
    for (const pass of spec.passes) {
        const file = join(dir, pass.file)
        if (!existsSync(file)) {
            console.warn(`[render-reference] ${id}: missing ${pass.file}`)
            break
        }
        passes.push({fs: readFileSync(file, 'utf8'), block: spec.ubo.block, instance: spec.ubo.instance})
    }
    if (passes.length !== spec.passes.length) continue

    items.push({
        id,
        dir,
        spec,
        passes,
        defaults: collectDefaults(spec),
        enums: collectEnums(spec),
        uiTypes: collectUiTypes(spec),
        resolved: spec.resolved ?? {},
        width: spec.reference?.width ?? 512,
        height: spec.reference?.height ?? 512,
        time: spec.reference?.time ?? 1.0,
    })
}

if (items.length === 0) {
    console.error('[render-reference] no effects found')
    process.exit(1)
}

const args = process.argv.slice(2)
const captureIndex = args.indexOf('--capture')
const capturePath = captureIndex >= 0 ? args[captureIndex + 1] : null
const onlyIndex = args.indexOf('--only')
const onlyId = onlyIndex >= 0 ? args[onlyIndex + 1] : null
if (onlyId) {
    const kept = items.filter((item) => item.id === onlyId)
    items.length = 0
    items.push(...kept)
}

const timeIndex = args.indexOf('--time')
const timeOverride = timeIndex >= 0 ? Number(args[timeIndex + 1]) : null
// Force the strict thresholds even for effects that widen them in their spec.
const strictMode = args.includes('--strict')
const STRICT_TOLERANCE = {meanAbs: 1.0, over8Ratio: 0.01, bandMean: 2.0}
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
    capture = {
        id,
        width,
        height,
        base64: bytes.toString('base64'),
        tolerance: strictMode ? STRICT_TOLERANCE : (target.spec.validation?.pixelDiff ?? STRICT_TOLERANCE),
    }
    items.length = 0
    items.push({...target, width, height, time: timeOverride ?? target.spec.reference?.time ?? 1.0})
} else if (timeOverride !== null) {
    for (const item of items) {
        item.time = timeOverride
    }
}

const payload = items.map((it) => ({
    id: it.id,
    passes: it.passes,
    width: it.width,
    height: it.height,
    time: it.time,
    ubo: it.spec.ubo,
    defaults: it.defaults,
    enums: it.enums,
    uiTypes: it.uiTypes,
    resolved: it.resolved,
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
        const EDGES = {stretch: 0, transparent: 1, mirror: 2, wrap: 3}
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

        const toNumbers = (value, n, enumMap, uiType) => {
            if (typeof value === 'string') {
                if (value.startsWith('#')) return parseHex(value).slice(0, n)
                if (enumMap && Object.prototype.hasOwnProperty.call(enumMap, value)) return [enumMap[value]]
                if (value in EDGES) return [EDGES[value]]
                if (value in COLOR_SPACE) return [COLOR_SPACE[value]]
                return null
            }
            if (typeof value === 'number') return [value]
            if (Array.isArray(value)) return value.map(Number).slice(0, n)
            if (value && typeof value === 'object') {
                const keys = ['x', 'y', 'z', 'w']
                if (keys.some((k) => k in value)) {
                    const out = keys.map((k) => Number(value[k] ?? 0)).slice(0, n)
                    // transformPosition inverts Y: prop 0 = top, uniform 1 = top.
                    if (uiType === 'position' && out.length > 1) out[1] = 1 - out[1]
                    return out
                }
            }
            return null
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

            const programs = []
            const membersReport = []
            const missingReport = []
            try {
                for (const pass of item.passes) {
                    const vs = compile(gl.VERTEX_SHADER, makeVertexShader(pass.fs))
                    const fs = compile(gl.FRAGMENT_SHADER, pass.fs)
                    const program = gl.createProgram()
                    gl.attachShader(program, vs)
                    gl.attachShader(program, fs)
                    gl.linkProgram(program)
                    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                        throw new Error(`link: ${gl.getProgramInfoLog(program)}`)
                    }
                    gl.useProgram(program)

                    const prefix = pass.instance
                    let blockIndex = gl.getUniformBlockIndex(program, pass.block)
                    if (blockIndex === gl.INVALID_INDEX) {
                        const blocks = gl.getProgramParameter(program, gl.ACTIVE_UNIFORM_BLOCKS)
                        for (let i = 0; i < blocks; i++) {
                            if (gl.getActiveUniformBlockName(program, i) === pass.block) {
                                blockIndex = i
                                break
                            }
                        }
                    }

                    let blockSize = 0
                    let ubo = null
                    const members = []
                    const missing = []
                    if (blockIndex !== gl.INVALID_INDEX) {
                        blockSize = gl.getActiveUniformBlockParameter(program, blockIndex, gl.UNIFORM_BLOCK_DATA_SIZE)
                        gl.uniformBlockBinding(program, blockIndex, 0)

                        const buffer = new ArrayBuffer(blockSize)
                        const view = new DataView(buffer)
                        const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS)

                        for (let i = 0; i < count; i++) {
                            const info = gl.getActiveUniform(program, i)
                            if (!info) continue
                            if (info.type === gl.SAMPLER_2D) {
                                gl.uniform1i(gl.getUniformLocation(program, info.name), 0)
                                continue
                            }
                            if (!info.name.startsWith(`${prefix}.`)) continue
                            const offset = gl.getActiveUniforms(program, [i], gl.UNIFORM_OFFSET)[0]
                            // Array uniforms report "name[0]"; the spec stores the base path.
                            const path = info.name.slice(prefix.length + 1).replace(/\[0\]$/, '')
                            const [node, ...rest] = path.split('.')
                            const member = rest.join('.')

                            if (info.size > 1) {
                                const array = item.resolved[path]
                                if (Array.isArray(array)) {
                                    const stride = gl.getActiveUniforms(program, [i], gl.UNIFORM_ARRAY_STRIDE)[0]
                                    let components = 1
                                    if (info.type === gl.FLOAT_VEC4) components = 4
                                    else if (info.type === gl.FLOAT_VEC3) components = 3
                                    else if (info.type === gl.FLOAT_VEC2) components = 2
                                    for (let element = 0; element < info.size; element++) {
                                        for (let c = 0; c < components; c++) {
                                            const value = Number(array[element * components + c] ?? 0)
                                            view.setFloat32(offset + element * stride + c * 4, value, true)
                                        }
                                    }
                                }
                                members.push({name: info.name, type: info.type, offset, size: info.size})
                                continue
                            }

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
                                const resolvedValue = item.resolved[path]
                                if (resolvedValue !== undefined && resolvedValue !== null) {
                                    value = resolvedValue
                                } else if (member === '_opacity') {
                                    value = 1
                                } else if (member === '_animTime') {
                                    value = item.time
                                } else if (member === 'stopCount') {
                                    value = Array.isArray(item.defaults[`${node}.stops`]) ? item.defaults[`${node}.stops`].length : 0
                                } else {
                                    value = item.defaults[path]
                                }
                            }

                            const nums = value === undefined || value === null
                                ? null
                                : toNumbers(value, info.size > 1 ? info.size * 4 : 4, item.enums[path], item.uiTypes[path])
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

                        ubo = gl.createBuffer()
                        gl.bindBuffer(gl.UNIFORM_BUFFER, ubo)
                        gl.bufferData(gl.UNIFORM_BUFFER, blockSize, gl.DYNAMIC_DRAW)
                        gl.bufferSubData(gl.UNIFORM_BUFFER, 0, new Uint8Array(buffer))
                    }

                    programs.push({program, ubo, blockSize})
                    membersReport.push(members.length)
                    missingReport.push(...missing)
                }
            } catch (error) {
                out.push({id: item.id, error: String(error.message ?? error)})
                continue
            }

            // RTT targets (only needed for multi-pass effects).
            const textures = []
            const framebuffers = []
            if (item.passes.length > 1) {
                for (let i = 0; i < 2; i++) {
                    const texture = gl.createTexture()
                    gl.bindTexture(gl.TEXTURE_2D, texture)
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, item.width, item.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
                    const framebuffer = gl.createFramebuffer()
                    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
                    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
                    textures.push(texture)
                    framebuffers.push(framebuffer)
                }
            }

            const vao = gl.createVertexArray()
            gl.bindVertexArray(vao)
            const vbo = gl.createBuffer()
            gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
            gl.enableVertexAttribArray(0)
            gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

            const passCount = programs.length
            for (let i = 0; i < passCount; i++) {
                const isFinal = i === passCount - 1
                gl.bindFramebuffer(gl.FRAMEBUFFER, isFinal ? null : framebuffers[i % 2])
                gl.viewport(0, 0, item.width, item.height)
                gl.clearColor(0, 0, 0, isFinal ? 1 : 0)
                gl.clear(gl.COLOR_BUFFER_BIT)

                gl.useProgram(programs[i].program)
                if (programs[i].ubo) {
                    gl.bindBuffer(gl.UNIFORM_BUFFER, programs[i].ubo)
                    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, programs[i].ubo)
                }
                if (i > 0) {
                    gl.activeTexture(gl.TEXTURE0)
                    gl.bindTexture(gl.TEXTURE_2D, textures[(i - 1) % 2])
                }
                gl.drawArrays(gl.TRIANGLES, 0, 6)
            }
            gl.bindFramebuffer(gl.FRAMEBUFFER, null)
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
            let capturePng = null
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
                    const bandCount = 10
                    const refBand = new Array(bandCount).fill(0)
                    const capBand = new Array(bandCount).fill(0)
                    const diffBand = new Array(bandCount).fill(0)
                    const refAlphaBand = new Array(bandCount).fill(0)
                    const capAlphaBand = new Array(bandCount).fill(0)
                    const bandPixels = new Array(bandCount).fill(0)
                    const bandRowBytes = item.width * 4
                    for (let i = 0; i < pixels.length; i += 4) {
                        const dr = Math.abs(pixels[i] - binary.charCodeAt(i))
                        const dg = Math.abs(pixels[i + 1] - binary.charCodeAt(i + 1))
                        const db = Math.abs(pixels[i + 2] - binary.charCodeAt(i + 2))
                        const d = Math.max(dr, dg, db)
                        diffSum += (dr + dg + db) / 3
                        if (d > diffMax) diffMax = d
                        if (d > 8) over8++
                        if (d > 16) over16++

                        const row = Math.floor(i / bandRowBytes)
                        const band = Math.min(bandCount - 1, Math.floor((row / item.height) * bandCount))
                        const refLum = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3
                        const capLum = (binary.charCodeAt(i) + binary.charCodeAt(i + 1) + binary.charCodeAt(i + 2)) / 3
                        refBand[band] += refLum
                        capBand[band] += capLum
                        diffBand[band] += (dr + dg + db) / 3
                        refAlphaBand[band] += pixels[i + 3]
                        capAlphaBand[band] += binary.charCodeAt(i + 3)
                        bandPixels[band]++
                    }
                    for (let b = 0; b < bandCount; b++) {
                        if (bandPixels[b] > 0) {
                            refBand[b] /= bandPixels[b]
                            capBand[b] /= bandPixels[b]
                            diffBand[b] /= bandPixels[b]
                            refAlphaBand[b] /= bandPixels[b]
                            capAlphaBand[b] /= bandPixels[b]
                        }
                    }
                    diff = {
                        meanAbs: diffSum / total,
                        maxAbs: diffMax,
                        over8Ratio: over8 / total,
                        over16Ratio: over16 / total,
                        pixels: total,
                        bands: {
                            ref: refBand.map((v) => Number(v.toFixed(1))),
                            cap: capBand.map((v) => Number(v.toFixed(1))),
                            diff: diffBand.map((v) => Number(v.toFixed(1))),
                            refAlpha: refAlphaBand.map((v) => Number(v.toFixed(0))),
                            capAlpha: capAlphaBand.map((v) => Number(v.toFixed(0))),
                        },
                    }

                    // Save the capture as a PNG too (flip from GL bottom-up, drop alpha).
                    const capCanvas = document.createElement('canvas')
                    capCanvas.width = item.width
                    capCanvas.height = item.height
                    const capCtx = capCanvas.getContext('2d')
                    const image = capCtx.createImageData(item.width, item.height)
                    const src = new Uint8Array(binary.length)
                    for (let i = 0; i < binary.length; i++) src[i] = binary.charCodeAt(i)
                    const rowBytes = item.width * 4
                    for (let y = 0; y < item.height; y++) {
                        const from = (item.height - 1 - y) * rowBytes
                        const to = y * rowBytes
                        for (let x = 0; x < rowBytes; x += 4) {
                            image.data[to + x] = src[from + x]
                            image.data[to + x + 1] = src[from + x + 1]
                            image.data[to + x + 2] = src[from + x + 2]
                            image.data[to + x + 3] = 255
                        }
                    }
                    capCtx.putImageData(image, 0, 0)
                    capturePng = capCanvas.toDataURL('image/png')
                }
            }

            // Flatten over black for the human-facing reference: transparent generators (Aurora)
            // would otherwise read as a blank white image in most viewers. The diff still uses the
            // raw RGBA above, so alpha is not lost from the comparison.
            const flat = document.createElement('canvas')
            flat.width = item.width
            flat.height = item.height
            const flatCtx = flat.getContext('2d')
            flatCtx.fillStyle = '#000000'
            flatCtx.fillRect(0, 0, item.width, item.height)
            flatCtx.drawImage(canvas, 0, 0)

            out.push({
                id: item.id,
                png: flat.toDataURL('image/png'),
                passCount,
                members: membersReport,
                missing: missingReport,
                diff,
                capturePng,
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
        const diffDir = join(repoRoot, 'build', 'diff')
        const diffPath = join(diffDir, `${result.id}.json`)
        mkdirSync(dirname(diffPath), {recursive: true})
        writeFileSync(diffPath, JSON.stringify({id: result.id, capture: capturePath, ...result.diff}, null, 2))
        writeFileSync(join(diffDir, `${result.id}-reference.png`), Buffer.from(result.png.split(',')[1], 'base64'))
        if (result.capturePng) {
            writeFileSync(join(diffDir, `${result.id}-capture.png`), Buffer.from(result.capturePng.split(',')[1], 'base64'))
        }
        if (result.diff.error) {
            console.error(`[render-reference] diff ${result.id}: FAIL ${result.diff.error}`)
            process.exitCode = 1
        } else {
            const tolerance = capture.tolerance
            const bandDelta = result.diff.bands
                ? Math.max(...result.diff.bands.ref.map((value, i) => Math.abs(value - result.diff.bands.cap[i])))
                : 0
            const passed =
                result.diff.meanAbs <= tolerance.meanAbs &&
                result.diff.over8Ratio <= tolerance.over8Ratio &&
                bandDelta <= tolerance.bandMean

            result.pass = passed
            result.tolerance = tolerance
            result.bandDelta = bandDelta

            console.log(
                `[render-reference] diff ${result.id}: ${passed ? 'PASS' : 'FAIL'} ` +
                    `meanAbs=${result.diff.meanAbs.toFixed(2)}<=${tolerance.meanAbs} ` +
                    `max=${result.diff.maxAbs} ` +
                    `over8=${(result.diff.over8Ratio * 100).toFixed(2)}%<=${(tolerance.over8Ratio * 100).toFixed(1)}% ` +
                    `bandDelta=${bandDelta.toFixed(1)}<=${tolerance.bandMean} ` +
                    `(${capture.width}x${capture.height}, ${result.passCount}p)`,
            )
            if (!passed) {
                console.log(`[render-reference]   ref bands: ${result.diff.bands.ref.join(' ')}`)
                console.log(`[render-reference]   cap bands: ${result.diff.bands.cap.join(' ')}`)
                console.log(`[render-reference]   dif bands: ${result.diff.bands.diff.join(' ')}`)
                process.exitCode = 1
            }

            writeFileSync(
                diffPath,
                JSON.stringify(
                    {
                        id: result.id,
                        capture: capturePath,
                        ...result.diff,
                        tolerance,
                        bandDelta,
                        pass: passed,
                    },
                    null,
                    2,
                ),
            )
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
        `[render-reference] ${result.id}: ${bytes.length}B passes=${result.passCount} ` +
            `members=${result.members.join('/')} missing=${result.missing.length} ` +
            `nonBlack=${(result.stats.nonBlackRatio * 100).toFixed(1)}% ` +
            `lum=${result.stats.min.toFixed(0)}..${result.stats.max.toFixed(0)} mean=${result.stats.mean.toFixed(1)}`,
    )
    if (result.missing.length > 0) {
        console.log(`[render-reference]   missing defaults: ${result.missing.join(', ')}`)
    }
}

console.log(`[render-reference] wrote ${written}/${results.items.length} reference images`)
