import type { SVGAttributes } from "react";
import { absoluteAt, dataNameAttr, joinClass } from "./internal";

export interface VectorProps extends SVGAttributes<SVGSVGElement> {
  name?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  viewBox?: string;
}

export function Vector({
  x = 0,
  y = 0,
  width,
  height,
  viewBox,
  name,
  className,
  style,
  children,
  ...rest
}: VectorProps) {
  const vb =
    viewBox ??
    (width !== undefined && height !== undefined
      ? `0 0 ${width} ${height}`
      : undefined);
  return (
    <svg
      {...rest}
      {...dataNameAttr(name, rest)}
      viewBox={vb}
      width={width}
      height={height}
      className={joinClass(className)}
      style={{
        ...absoluteAt(x, y),
        width,
        height,
        overflow: "visible",
        ...style,
      }}
    >
      <title>{name ?? "Vector"}</title>
      {children}
    </svg>
  );
}
