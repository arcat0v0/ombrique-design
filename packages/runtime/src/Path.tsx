import type { SVGAttributes } from "react";
import { absoluteAt, dataNameAttr, joinClass } from "./internal";

export interface PathProps extends SVGAttributes<SVGSVGElement> {
  name?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  d: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  fillRule?: "nonzero" | "evenodd" | "inherit";
}

export function Path({
  x = 0,
  y = 0,
  width,
  height,
  d,
  fill,
  stroke,
  strokeWidth,
  fillRule,
  name,
  className,
  style,
  viewBox,
  ...rest
}: PathProps) {
  const vb =
    viewBox ??
    (width !== undefined && height !== undefined
      ? `0 0 ${width} ${height}`
      : undefined);
  return (
    <svg
      {...rest}
      {...dataNameAttr(name, rest)}
      data-primitive="path"
      data-d={d}
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
      <title>{name ?? "Path"}</title>
      <path
        d={d}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        fillRule={fillRule}
      />
    </svg>
  );
}
