export const nativeInit: (surfaceId: string, width: number, height: number) => boolean;
export const nativeSetShader: (fragmentSource: string, blockName: string, instanceName: string) => boolean;
export const nativeSetParam: (name: string, values: number[]) => void;
export const nativeSetPointer: (x: number, y: number, active: number) => void;
export const nativeResize: (width: number, height: number) => void;
export const nativeDispose: () => void;
