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
  opacity?: number;
}

export function Rect({
  x,
  y,
  width,
  height,
  fill,
  radius,
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
        opacity,
        ...style,
      }}
    />
  );
}
