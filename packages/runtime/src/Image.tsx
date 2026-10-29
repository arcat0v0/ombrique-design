import type { HTMLAttributes } from "react";
import { absoluteAt, dataNameAttr, joinClass } from "./internal";

export interface ImageProps extends HTMLAttributes<HTMLDivElement> {
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  src: string;
  radius?: number;
  opacity?: number;
}

export function Image({
  x,
  y,
  width,
  height,
  src,
  radius,
  opacity,
  name,
  className,
  style,
  ...rest
}: ImageProps) {
  return (
    <div
      {...rest}
      {...dataNameAttr(name, rest)}
      className={joinClass(className)}
      style={{
        ...absoluteAt(x, y),
        width,
        height,
        borderRadius: radius,
        opacity,
        overflow: "hidden",
        ...style,
      }}
    >
      <img
        src={src}
        alt={name ?? ""}
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
        }}
      />
    </div>
  );
}
