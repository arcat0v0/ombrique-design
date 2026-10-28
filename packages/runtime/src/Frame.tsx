import type { HTMLAttributes } from "react";
import { dataNameAttr, joinClass } from "./internal";

export type FrameLayout = "free" | "vertical" | "horizontal";

export interface FrameProps extends HTMLAttributes<HTMLElement> {
  name?: string;
  x?: number;
  y?: number;
  width: number;
  height: number;
  fill?: string;
  layout?: FrameLayout;
  gap?: number;
  padding?: number;
  radius?: number;
}

export function Frame({
  x,
  y,
  width,
  height,
  fill,
  layout = "free",
  gap,
  padding,
  radius,
  name,
  className,
  style,
  children,
  ...rest
}: FrameProps) {
  const base: HTMLAttributes<HTMLElement>["style"] = {
    position: "relative",
    width,
    height,
  };
  if (x !== undefined) base.left = x;
  if (y !== undefined) base.top = y;
  if (layout === "vertical" || layout === "horizontal") {
    base.display = "flex";
    base.flexDirection = layout === "vertical" ? "column" : "row";
    if (gap !== undefined) base.gap = gap;
    if (padding !== undefined) base.padding = padding;
  }
  if (fill !== undefined) base.background = fill;
  if (radius !== undefined) base.borderRadius = radius;
  return (
    <section
      {...rest}
      {...dataNameAttr(name, rest)}
      className={joinClass(className)}
      style={{ ...base, ...style }}
    >
      {children}
    </section>
  );
}
