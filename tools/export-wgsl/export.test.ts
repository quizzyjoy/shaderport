/**
 * Exports self-contained WGSL for every effect registered in the upstream library, plus the
 * FINAL (post-transform) uniform values for each node.
 *
 * Why this file is a vitest test: the upstream shaders use `'use gpu'` functions that must be
 * transformed by `unplugin-typegpu`, which is only wired into the upstream vitest config. A plain
 * tsx/node script resolves the definitions but produces empty shader bodies.
 *
 * `run.mjs` copies this file into `<upstream>/packages/core/src/__tests__/gpu/`, runs it, then
 * removes the copy. Output goes to `$SP_OUT`.
 */
import {createHash} from 'node:crypto'
import {mkdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {describe, it, vi} from 'vitest'
import {d, tgpu} from '@coreroot/gpu/kit'
import {composeNodeTree} from '@coreroot/gpu/composer'
import {getAllShaders, getShaderByName} from '@coreroot/shaderRegistry'
import type {GpuShaderDefinition, RegistryNode, RegistryView} from '@coreroot/gpu/contract'
import type {NodeMetadata} from '@coreroot/types'
import {ArrayFieldHandle, createUniformStore} from '@coreroot/gpu/uniformStore'
import type {FieldInit, UniformStore} from '@coreroot/gpu/uniformStore'
import {SystemUniforms} from '@coreroot/gpu/kit/coords'
import {createGpuUniformsMap} from '@coreroot/gpu/uniformBridge'
import {RootContainer} from './noiseHarness'
import type {NodeSpec} from './noiseHarness'

const OUT = process.env.SP_OUT
if (!OUT) throw new Error('SP_OUT is not set')

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex')

const jsonSafe = (value: unknown): unknown => {
    try {
        return JSON.parse(JSON.stringify(value))
    } catch {
        return undefined
    }
}

const propSchema = (def: GpuShaderDefinition): Record<string, unknown> => {
    const out: Record<string, unknown> = {}
    for (const [name, cfg] of Object.entries(def.props ?? {})) {
        const c = cfg as {default?: unknown; description?: string; ui?: unknown}
        out[name] = {default: jsonSafe(c.default), description: c.description, ui: jsonSafe(c.ui)}
    }
    return out
}

const needsChild = (def: GpuShaderDefinition): boolean => {
    const d = def as unknown as {requiresChild?: boolean; role?: string}
    return Boolean(d.requiresChild) || d.role === 'filter' || d.role === 'warp'
}

// ── GPU-free registry harness (copy of noiseHarness) that ALSO exposes the field handles ──────
function mockRoot() {
    const buffer = {
        patch: vi.fn(),
        write: vi.fn(),
        destroy: vi.fn(),
        $usage: vi.fn(function (this: unknown) {
            return buffer
        }),
    }
    return {createBuffer: vi.fn(() => buffer), createBindGroup: vi.fn(() => ({}))} as never
}

function bridgeFieldInits(def: GpuShaderDefinition, props: Record<string, unknown>, id: string): FieldInit[] {
    const map = createGpuUniformsMap(def as never, props, id)
    const inits: FieldInit[] = []
    for (const [name, u] of Object.entries(map)) {
        inits.push({name, initial: u.value, transform: u.transform, cpu: u.cpu, schema: u.schema})
    }
    return inits
}

function defaultsFor(def: GpuShaderDefinition): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const [name, cfg] of Object.entries(def.props)) out[name] = (cfg as {default: unknown}).default
    return out
}

function buildRegistryWithHandles(specs: NodeSpec[]): {
    registry: RegistryView
    store: UniformStore
    handlesById: Record<string, Record<string, unknown>>
} {
    const store = createUniformStore(mockRoot(), {systemSchema: SystemUniforms})
    const handlesById: Record<string, Record<string, unknown>> = {}
    for (const s of specs) {
        const props = {...defaultsFor(s.def), ...(s.props ?? {})}
        const propFields = bridgeFieldInits(s.def, props, s.id)
        const synthetic: FieldInit[] = [{name: '_opacity', schema: d.f32, initial: s.metadata?.opacity ?? 1}]
        if (s.def.animatedTime) synthetic.push({name: '_animTime', schema: d.f32, initial: s.animTime ?? 0})
        if (s.def.extraFields) {
            for (const [name, f] of Object.entries(s.def.extraFields)) {
                synthetic.push({name, schema: f.schema, initial: f.initial})
            }
        }
        handlesById[s.id] = store.defineNode(s.id, [...propFields, ...synthetic]) as never
    }
    store.finalize()

    const nodes = new Map<string, RegistryNode>()
    const childrenByParent = new Map<string, RegistryNode[]>()
    for (const s of specs) {
        nodes.set(s.id, {
            id: s.id,
            componentName: s.def.name,
            parentId: s.parentId,
            definition: s.def,
            metadata: {blendMode: 'normal', opacity: undefined, renderOrder: 0, ...s.metadata} as NodeMetadata,
            handles: handlesById[s.id],
        })
    }
    for (const s of specs) {
        if (s.parentId) {
            const arr = childrenByParent.get(s.parentId) ?? []
            arr.push(nodes.get(s.id)!)
            childrenByParent.set(s.parentId, arr)
        }
    }
    const root = specs.find((s) => s.parentId === null)!
    const registry: RegistryView = {
        rootId: root.id,
        getNode: (id) => nodes.get(id),
        getChildren: (parentId) => childrenByParent.get(parentId) ?? [],
        resolveCustomId: () => null,
        store,
    }
    return {registry, store, handlesById}
}

const serializeHandle = (handle: unknown): unknown => {
    if (handle instanceof ArrayFieldHandle) {
        return handle.array.slice()
    }
    const v = (handle as {value?: unknown}).value
    if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') return v
    if (v && typeof v === 'object') {
        const obj = v as Record<string, unknown>
        const comps: number[] = []
        for (const key of ['x', 'y', 'z', 'w']) {
            if (obj[key] !== undefined) comps.push(Number(obj[key]))
        }
        if (comps.length > 0) return comps
    }
    return undefined
}

const collectResolved = (handlesById: Record<string, Record<string, unknown>>, ids: string[]): Record<string, unknown> => {
    const out: Record<string, unknown> = {}
    for (const id of ids) {
        const handles = handlesById[id]
        if (!handles) continue
        for (const [name, handle] of Object.entries(handles)) {
            if (name.startsWith('_')) continue
            const path = (handle as {accessorPath?: string}).accessorPath ?? `${id}.${name}`
            const value = serializeHandle(handle)
            if (value !== undefined) out[path] = value
        }
    }
    return out
}

interface ExportedPass {
    key: string
    file: string
    bytes: number
    sha256: string
}

function exportPasses(
    def: GpuShaderDefinition,
    name: string,
    base?: GpuShaderDefinition,
): {passes: ExportedPass[]; resolved: Record<string, unknown>} {
    // Reference time used for the exported reference images. Seeding _animTime lets the
    // per-frame extraFields (meshAnchors, preconverted colours) compute their real values.
    const referenceTime = 1.0
    const specs = base
        ? [
              {id: 'root', def: RootContainer, parentId: null},
              {id: 'n', def, parentId: 'root', metadata: {renderOrder: 1}, animTime: referenceTime},
              {id: 'base', def: base, parentId: 'n', metadata: {renderOrder: 0}, animTime: referenceTime},
          ]
        : [
              {id: 'root', def: RootContainer, parentId: null},
              {id: 'n', def, parentId: 'root', metadata: {renderOrder: 0}, animTime: referenceTime},
          ]

    const {registry, handlesById} = buildRegistryWithHandles(specs as never)

    // Route params.setExtraField(...) into the corresponding store handle so the per-frame
    // writers (scatteredAnchors, preconverted colours) leave their computed values behind.
    const writeExtraField = (nodeId: string, field: string, value: number | number[]): void => {
        const handle = handlesById[nodeId]?.[field]
        if (!handle) return
        if (handle instanceof ArrayFieldHandle) {
            handle.array = Array.isArray(value) ? value : [value]
        } else {
            ;(handle as {value: unknown}).value = value
        }
    }

    const ir = composeNodeTree(registry, {writeExtraField}) as unknown as {
        finalPass: {entry: unknown}
        rttPasses: Array<{textureKey?: string; fragment: {entry: unknown}}>
        onBeforeRender?: Array<(params?: unknown) => void>
    }

    // Run the shader-registered per-frame writers once so extraFields hold their frame values.
    for (const callback of ir.onBeforeRender ?? []) {
        try {
            callback({})
        } catch {
            // A host-only driver may need a GPU/device; the field keeps its initial value.
        }
    }

    const passes = [
        {key: 'final', entry: ir.finalPass.entry},
        ...ir.rttPasses.map((p, i) => ({key: `rtt_${p.textureKey ?? i}`, entry: p.fragment.entry})),
    ]

    const resolved = collectResolved(handlesById, base ? ['n', 'base'] : ['n'])

    return {
        passes: passes.map((p) => {
            const code = tgpu.resolve([p.entry as never], {names: 'strict'}) as unknown as string
            const file = `${name}__${p.key}.wgsl`
            writeFileSync(join(OUT as string, file), code, 'utf8')
            return {key: p.key, file, bytes: Buffer.byteLength(code), sha256: sha256(code)}
        }),
        resolved,
    }
}

describe('shaderport export', () => {
    it('exports every registered effect', () => {
        mkdirSync(OUT as string, {recursive: true})

        const base = getShaderByName('Plasma')?.definition as GpuShaderDefinition | undefined
        if (!base) throw new Error('Plasma is required as the composite base but was not found')

        const shaders = getAllShaders()
        const effects: Record<string, unknown>[] = []
        const failures: Array<{name: string; error: string}> = []

        for (const entry of shaders) {
            const def = entry.definition as GpuShaderDefinition
            const d = def as unknown as {requiresRTT?: boolean; requiresChild?: boolean; role?: string; category?: string}
            const composite = needsChild(def) && entry.name !== 'Plasma'

            try {
                const {passes, resolved} = exportPasses(def, entry.name, composite ? base : undefined)
                effects.push({
                    name: entry.name,
                    category: d.category ?? entry.category ?? 'Uncategorized',
                    role: d.role ?? 'unknown',
                    requiresRTT: Boolean(d.requiresRTT),
                    requiresChild: Boolean(d.requiresChild),
                    composite,
                    passCount: passes.length,
                    passes,
                    props: propSchema(def),
                    resolved,
                })
            } catch (error) {
                failures.push({name: entry.name, error: error instanceof Error ? error.message : String(error)})
            }
        }

        const manifest = {
            upstream: {
                repository: 'shader-effects-inc/shaders',
                version: process.env.SP_UPSTREAM_VERSION ?? 'unknown',
            },
            generatedAt: new Date().toISOString(),
            counts: {
                registered: shaders.length,
                exported: effects.length,
                failed: failures.length,
                passes: effects.reduce((n, e) => n + (e.passCount as number), 0),
            },
            effects,
            failures,
        }

        writeFileSync(join(OUT as string, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')

        // eslint-disable-next-line no-console
        console.log(
            `[export-wgsl] registered=${shaders.length} exported=${effects.length} failed=${failures.length}`,
        )
        if (failures.length > 0) {
            // eslint-disable-next-line no-console
            console.log(`[export-wgsl] failures: ${failures.map((f) => f.name).join(', ')}`)
        }
    })
})
