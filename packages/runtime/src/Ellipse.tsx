import type { HTMLAttributes } from "react";
import { absoluteAt, dataNameAttr, joinClass } from "./internal";

export interface EllipseProps extends HTMLAttributes<HTMLDivElement> {
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  opacity?: number;
}

export function Ellipse({
  x,
  y,
  width,
  height,
  fill,
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
        opacity,
        ...style,
      }}
    />
  );
}
