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
  radiusTopLeft?: number;
  radiusTopRight?: number;
  radiusBottomRight?: number;
  radiusBottomLeft?: number;
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
  radiusTopLeft,
  radiusTopRight,
  radiusBottomRight,
  radiusBottomLeft,
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
        borderTopLeftRadius: radiusTopLeft,
        borderTopRightRadius: radiusTopRight,
        borderBottomRightRadius: radiusBottomRight,
        borderBottomLeftRadius: radiusBottomLeft,
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
