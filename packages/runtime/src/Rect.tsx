import type { HTMLAttributes } from "react";
import { absoluteAt, dataNameAttr, joinClass } from "./internal";

export interface RectProps extends HTMLAttributes<HTMLDivElement> {
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  radius?: number;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}

export function Rect({
  x,
  y,
  width,
  height,
  fill,
  radius,
  stroke,
  strokeWidth,
  opacity,
  name,
  className,
  style,
  ...rest
}: RectProps) {
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
        borderRadius: radius,
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
