import type { CSSProperties, HTMLAttributes } from "react";
import { dataNameAttr, joinClass } from "./internal";

export type FrameLayout = "free" | "vertical" | "horizontal";
export type FrameAlign = "start" | "center" | "end" | "stretch" | "baseline";
export type FrameJustify =
  | "start"
  | "center"
  | "end"
  | "space-between"
  | "space-around";

export interface FrameGrid {
  columns?: number;
  rows?: number;
  gap?: number;
  columnGap?: number;
  rowGap?: number;
  padding?: number;
}

const ALIGN_TO_CSS: Record<FrameAlign, CSSProperties["alignItems"]> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
  baseline: "baseline",
};

const JUSTIFY_TO_CSS: Record<FrameJustify, CSSProperties["justifyContent"]> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  "space-between": "space-between",
  "space-around": "space-around",
};

export type PrototypeTransitionType =
  | "instant"
  | "dissolve"
  | "slide-left"
  | "slide-right"
  | "slide-up"
  | "slide-down";

export interface FrameProps extends HTMLAttributes<HTMLElement> {
  name?: string;
  x?: number;
  y?: number;
  width: number;
  height: number;
  fill?: string;
  layout?: FrameLayout;
  align?: FrameAlign;
  justify?: FrameJustify;
  wrap?: boolean;
  gap?: number;
  padding?: number;
  grid?: FrameGrid;
  radius?: number;
  radiusTopLeft?: number;
  radiusTopRight?: number;
  radiusBottomRight?: number;
  radiusBottomLeft?: number;
  onClickNavigate?: string;
  onHoverStyle?: CSSProperties;
  cursor?: "pointer" | "default";
  transitionType?: PrototypeTransitionType;
  transitionDuration?: number;
  mode?: string;
}

export function Frame({
  x,
  y,
  width,
  height,
  fill,
  layout = "free",
  align,
  justify,
  wrap,
  gap,
  padding,
  grid,
  radius,
  radiusTopLeft,
  radiusTopRight,
  radiusBottomRight,
  radiusBottomLeft,
  name,
  className,
  style,
  onClickNavigate,
  onHoverStyle,
  cursor,
  transitionType,
  transitionDuration,
  mode,
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
    if (align !== undefined) base.alignItems = ALIGN_TO_CSS[align];
    if (justify !== undefined) base.justifyContent = JUSTIFY_TO_CSS[justify];
    if (wrap) base.flexWrap = "wrap";
  } else if (grid) {
    base.display = "grid";
    if (grid.columns !== undefined)
      base.gridTemplateColumns = `repeat(${grid.columns}, 1fr)`;
    if (grid.rows !== undefined)
      base.gridTemplateRows = `repeat(${grid.rows}, 1fr)`;
    if (grid.gap !== undefined) base.gap = grid.gap;
    if (grid.columnGap !== undefined) base.columnGap = grid.columnGap;
    if (grid.rowGap !== undefined) base.rowGap = grid.rowGap;
    if (grid.padding !== undefined) base.padding = grid.padding;
  }
  if (fill !== undefined) base.background = fill;
  if (radius !== undefined) base.borderRadius = radius;
  if (radiusTopLeft !== undefined) base.borderTopLeftRadius = radiusTopLeft;
  if (radiusTopRight !== undefined) base.borderTopRightRadius = radiusTopRight;
  if (radiusBottomRight !== undefined)
    base.borderBottomRightRadius = radiusBottomRight;
  if (radiusBottomLeft !== undefined)
    base.borderBottomLeftRadius = radiusBottomLeft;
  if (rest.hidden) base.display = "none";

  let protoHover: string | undefined;
  if (typeof onHoverStyle === "string") {
    protoHover = onHoverStyle;
  } else if (onHoverStyle && typeof onHoverStyle === "object") {
    try {
      protoHover = JSON.stringify(onHoverStyle);
    } catch {}
  }
  return (
    <section
      {...rest}
      {...dataNameAttr(name, rest)}
      data-prototype-navigate={onClickNavigate || undefined}
      data-prototype-cursor={cursor || undefined}
      data-prototype-transition={transitionType || undefined}
      data-prototype-duration={
        transitionDuration !== undefined ? transitionDuration : undefined
      }
      data-prototype-hover={protoHover || undefined}
      data-mode={mode || undefined}
      className={joinClass(className)}
      style={{ ...base, ...style }}
    >
      {children}
    </section>
  );
}
