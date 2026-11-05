export interface ShaderInit {
  el: HTMLCanvasElement;
  worldX: number;
  worldY: number;
  worldW: number;
  worldH: number;
  radius?: number;
}

export interface ShaderAnchorPlacement {
  id: string;
  worldX: number;
  worldY: number;
  worldW: number;
  worldH: number;
  radius: number;
}

export type ShaderWorldPlacement = ShaderAnchorPlacement;

export function placeShaders(
  anchors: readonly ShaderAnchorPlacement[],
  readyIds: ReadonlySet<string>,
): ShaderWorldPlacement[] {
  const out: ShaderWorldPlacement[] = [];
  for (const anchor of anchors) {
    if (!readyIds.has(anchor.id)) continue;
    if (!(anchor.worldW > 0) || !(anchor.worldH > 0)) continue;
    out.push({
      id: anchor.id,
      worldX: anchor.worldX,
      worldY: anchor.worldY,
      worldW: anchor.worldW,
      worldH: anchor.worldH,
      radius: Math.max(0, anchor.radius),
    });
  }
  return out;
}

export function shaderTextureSize(
  worldWidth: number,
  worldHeight: number,
  dpr: number,
  maxDimension: number,
): { width: number; height: number } {
  const ratio = Number.isFinite(dpr) ? Math.max(1, dpr) : 1;
  return {
    width: Math.min(maxDimension, Math.max(1, Math.round(worldWidth * ratio))),
    height: Math.min(
      maxDimension,
      Math.max(1, Math.round(worldHeight * ratio)),
    ),
  };
}
