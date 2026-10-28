import type { HTMLAttributes } from "react";
import { absoluteAt, dataNameAttr, joinClass } from "./internal";

export interface TextProps extends HTMLAttributes<HTMLDivElement> {
  name?: string;
  x?: number;
  y?: number;
  width?: number;
  fontSize?: number;
  fill?: string;
}

export function Text({
  x,
  y,
  width,
  fontSize,
  fill,
  name,
  className,
  style,
  children,
  ...rest
}: TextProps) {
  return (
    <div
      {...rest}
      {...dataNameAttr(name, rest)}
      className={joinClass(className)}
      style={{
        whiteSpace: "pre-wrap",
        ...absoluteAt(x, y),
        width,
        fontSize,
        color: fill,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
