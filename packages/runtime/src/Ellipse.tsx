import type { HTMLAttributes } from "react";
import { absoluteAt, dataNameAttr, joinClass } from "./internal";

export interface EllipseProps extends HTMLAttributes<HTMLDivElement> {
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}

export function Ellipse({
  x,
  y,
  width,
  height,
  fill,
  stroke,
  strokeWidth,
  opacity,
  name,
  className,
  style,
  ...rest
}: EllipseProps) {
  return (
    <div
      {...rest}
      {...dataNameAttr(name, rest)}
      className={joinClass(className)}
      style={{
        ...absoluteAt(x, y),
        width,
        height,
        background: fill,
        borderRadius: "50%",
        border:
          stroke === undefined
            ? undefined
            : `${strokeWidth ?? 1}px solid ${stroke}`,
        opacity,
        ...style,
      }}
    />
  );
}
