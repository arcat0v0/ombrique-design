import type { HTMLAttributes } from "react";
import { absoluteAt, dataNameAttr, joinClass } from "./internal";
import { starPoints } from "./starMath";

export interface StarProps extends HTMLAttributes<SVGSVGElement> {
  name?: string;
  x: number;
  y: number;
  size: number;
  points?: number;
  ratio?: number;
  fill: string;
}

export function Star({
  x,
  y,
  size,
  points = 5,
  ratio = 0.4,
  fill,
  name,
  className,
  style,
  ...rest
}: StarProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      {...rest}
      {...dataNameAttr(name, rest)}
      className={joinClass(className)}
      style={{ ...absoluteAt(x, y), ...style }}
    >
      <polygon points={starPoints(size, points, ratio)} fill={fill} />
    </svg>
  );
}
