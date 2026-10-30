import type { HTMLAttributes } from "react";
import { absoluteAt, dataNameAttr, joinClass } from "./internal";
import { starPoints } from "./starMath";

export interface StarProps extends HTMLAttributes<SVGSVGElement> {
  name?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  size?: number;
  points?: number;
  ratio?: number;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}

export function Star({
  x,
  y,
  width,
  height,
  size,
  points = 5,
  ratio = 0.4,
  fill,
  stroke,
  strokeWidth,
  opacity,
  name,
  className,
  style,
  ...rest
}: StarProps) {
  const w = width ?? size ?? 100;
  const h = height ?? size ?? 100;
  const dim = Math.min(w, h);
  return (
    <svg
      aria-hidden="true"
      width={w}
      height={h}
      viewBox={`0 0 ${dim} ${dim}`}
      {...rest}
      {...dataNameAttr(name, rest)}
      className={joinClass(className)}
      style={{ ...absoluteAt(x, y), ...style }}
    >
      <polygon
        points={starPoints(dim, points, ratio)}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        opacity={opacity}
      />
    </svg>
  );
}
