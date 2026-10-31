export interface TextureSize {
  width: number;
  height: number;
}

export function fitTextureSize(
  worldWidth: number,
  worldHeight: number,
  scale: number,
  maxDimension: number,
  maxPixels: number,
): TextureSize {
  const rawWidth = Math.max(1, worldWidth * scale);
  const rawHeight = Math.max(1, worldHeight * scale);
  const fit = Math.min(
    1,
    Math.sqrt(maxPixels / Math.max(1, rawWidth * rawHeight)),
    maxDimension / rawWidth,
    maxDimension / rawHeight,
  );
  return {
    width: Math.max(1, Math.round(rawWidth * fit)),
    height: Math.max(1, Math.round(rawHeight * fit)),
  };
}
