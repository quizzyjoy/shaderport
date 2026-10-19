/**
 * Exports self-contained WGSL for every effect registered in the upstream library.
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
import {describe, it} from 'vitest'
import {tgpu} from '@coreroot/gpu/kit'
import {composeNodeTree} from '@coreroot/gpu/composer'
import {getAllShaders, getShaderByName} from '@coreroot/shaderRegistry'
import type {GpuShaderDefinition} from '@coreroot/gpu/contract'
import {buildRegistry, RootContainer} from './noiseHarness'

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

interface ExportedPass {
    key: string
    file: string
    bytes: number
    sha256: string
}

function exportPasses(def: GpuShaderDefinition, name: string, base?: GpuShaderDefinition): ExportedPass[] {
    const specs = base
        ? [
              {id: 'root', def: RootContainer, parentId: null},
              {id: 'n', def, parentId: 'root', metadata: {renderOrder: 1}, animTime: 0},
              {id: 'base', def: base, parentId: 'n', metadata: {renderOrder: 0}, animTime: 0},
          ]
        : [
              {id: 'root', def: RootContainer, parentId: null},
              {id: 'n', def, parentId: 'root', metadata: {renderOrder: 0}, animTime: 0},
          ]

    const {registry} = buildRegistry(specs as never)
    const ir = composeNodeTree(registry) as unknown as {
        finalPass: {entry: unknown}
        rttPasses: Array<{textureKey?: string; fragment: {entry: unknown}}>
    }

    const passes = [
        {key: 'final', entry: ir.finalPass.entry},
        ...ir.rttPasses.map((p, i) => ({key: `rtt_${p.textureKey ?? i}`, entry: p.fragment.entry})),
    ]

    return passes.map((p) => {
        const code = tgpu.resolve([p.entry as never], {names: 'strict'}) as unknown as string
        const file = `${name}__${p.key}.wgsl`
        writeFileSync(join(OUT as string, file), code, 'utf8')
        return {key: p.key, file, bytes: Buffer.byteLength(code), sha256: sha256(code)}
    })
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
                const passes = exportPasses(def, entry.name, composite ? base : undefined)
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
