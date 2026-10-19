import { resourceManager } from '@kit.LocalizationKit';
import { util } from '@kit.ArkTS';
import { EffectIndex, EffectPass, EffectSpec, EffectSummary, ParamValue, ValidationResult } from './types';

let resource: resourceManager.ResourceManager | null = null;

const COLOR_SPACE: string[] = ['linear', 'oklch', 'oklab', 'hsl', 'hsv', 'lch'];
const EDGES: string[] = ['stretch', 'wrap', 'mirror', 'transparent'];

/**
 * Bind the package to the host application's resource manager. Must be called once before any
 * other API. Rawfile assets from a HAR are merged into the host resource package.
 */
export function initShaderPort(manager: resourceManager.ResourceManager): void {
  resource = manager;
}

function readText(path: string): string {
  if (resource === null) {
    throw new Error('initShaderPort() must be called before reading effects');
  }
  const bytes: Uint8Array = resource.getRawFileContentSync(path);
  const decoder: util.TextDecoder = util.TextDecoder.create('utf-8');
  return decoder.decodeToString(bytes);
}

export function listEffects(): EffectSummary[] {
  const index: EffectIndex = JSON.parse(readText('effects/index.json')) as EffectIndex;
  return index.effects;
}

export function getEffect(id: string): EffectSpec {
  return JSON.parse(readText(`effects/${id}/spec.json`)) as EffectSpec;
}

export function getShaderSource(id: string, stage: string): string {
  const spec: EffectSpec = getEffect(id);
  let pass: EffectPass = spec.passes[spec.passes.length - 1];
  for (let i = 0; i < spec.passes.length; i++) {
    if (spec.passes[i].key === 'final') {
      pass = spec.passes[i];
      break;
    }
  }
  if (stage === 'fragment' || stage === '') {
    return readText(`effects/${id}/${pass.file}`);
  }
  throw new Error(`unsupported stage: ${stage}`);
}

function srgbToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
}

function hexToLinear(hex: string): number[] {
  let value: string = hex.startsWith('#') ? hex.substring(1) : hex;
  if (value.length === 3 || value.length === 4) {
    let expanded: string = '';
    for (let i = 0; i < value.length; i++) {
      expanded += value.substring(i, i + 1) + value.substring(i, i + 1);
    }
    value = expanded;
  }
  const r: number = parseInt(value.substring(0, 2), 16) / 255;
  const g: number = parseInt(value.substring(2, 4), 16) / 255;
  const b: number = parseInt(value.substring(4, 6), 16) / 255;
  const a: number = value.length >= 8 ? parseInt(value.substring(6, 8), 16) / 255 : 1;
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b), a];
}

function enumValue(value: string): number {
  for (let i = 0; i < COLOR_SPACE.length; i++) {
    if (COLOR_SPACE[i] === value) {
      return i;
    }
  }
  for (let i = 0; i < EDGES.length; i++) {
    if (EDGES[i] === value) {
      return i;
    }
  }
  return 0;
}

function toNumbers(value: ESObject): number[] {
  if (typeof value === 'number') {
    return [value as number];
  }
  if (typeof value === 'string') {
    const text: string = value as string;
    if (text.startsWith('#')) {
      return hexToLinear(text);
    }
    return [enumValue(text)];
  }
  if (Array.isArray(value)) {
    const source: number[] = value as number[];
    const out: number[] = [];
    for (let i = 0; i < source.length; i++) {
      out.push(source[i]);
    }
    return out;
  }
  if (value !== null && value !== undefined) {
    const point: Record<string, number> = value as Record<string, number>;
    if (point.x !== undefined) {
      return [point.x, point.y ?? 0];
    }
  }
  return [0];
}

/**
 * Default parameter values in the form the native renderer expects: colours are converted from
 * sRGB to linear RGBA, positions become vec2, enum strings become their numeric code.
 */
export function getDefaultParams(id: string): ParamValue[] {
  const spec: EffectSpec = getEffect(id);
  const names: string[] = Object.keys(spec.defaults);
  const out: ParamValue[] = [];
  for (let i = 0; i < names.length; i++) {
    const name: string = names[i];
    const value: ESObject = spec.defaults[name];
    out.push({ name: name, values: toNumbers(value) });
  }
  return out;
}

export function validateParams(id: string, params: Record<string, ESObject>): ValidationResult {
  const spec: EffectSpec = getEffect(id);
  const errors: string[] = [];
  const names: string[] = Object.keys(params);
  for (let i = 0; i < names.length; i++) {
    const name: string = names[i];
    if (spec.props[name] === undefined) {
      errors.push(`unknown parameter: ${name}`);
      continue;
    }
    const value: ESObject = params[name];
    if (typeof value === 'number' && Number.isNaN(value as number)) {
      errors.push(`${name}: NaN is not a valid value`);
    }
  }
  return { ok: errors.length === 0, errors: errors };
}
