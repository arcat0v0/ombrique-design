import { createElement } from "react";
import type { ReactElement, SVGAttributes } from "react";
import type { IconNode } from "./icon-codec";
import { absoluteAt, dataNameAttr, joinClass } from "./internal";
import {
  getIconSetKind,
  missingIconDiagnostic,
  resolveIcon,
} from "./icon-registry";

export interface IconProps extends SVGAttributes<SVGSVGElement> {
  name?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  iconSet?: string;
  iconName: string;
  iconKind?: "stroke" | "fill";
  strokeWidth?: number;
  fill?: string;
  stroke?: string;
  opacity?: number;
}

export const DEFAULT_ICON_SET = "lucide";
export const DEFAULT_ICON_SIZE = 24;
export const DEFAULT_ICON_STROKE_WIDTH = 2;

const SVG_TAGS = new Set([
  "circle",
  "ellipse",
  "line",
  "path",
  "polygon",
  "polyline",
  "rect",
]);

const warnedMissing = new Set<string>();

function warnMissing(iconSet: string, iconName: string): void {
  const key = `${iconSet}\u0000${iconName}`;
  if (warnedMissing.has(key)) return;
  warnedMissing.add(key);
  console.warn(missingIconDiagnostic(iconSet, iconName));
}

function renderNode(node: IconNode, key: number): ReactElement | null {
  if (!SVG_TAGS.has(node.tag)) return null;
  return createElement(node.tag, { ...node.attrs, key });
}

function iconPaint(
  kind: "stroke" | "fill",
  ink: string,
  stroke: string | undefined,
  strokeWidth: number | undefined,
): Record<string, unknown> {
  if (kind === "stroke") {
    return {
      fill: "none",
      color: ink,
      stroke: stroke ?? ink,
      strokeWidth: strokeWidth ?? DEFAULT_ICON_STROKE_WIDTH,
      strokeLinecap: "round",
      strokeLinejoin: "round",
    };
  }
  return { fill: ink, color: ink };
}

export function Icon({
  x = 0,
  y = 0,
  width,
  height,
  iconSet = DEFAULT_ICON_SET,
  iconName,
  iconKind,
  strokeWidth,
  fill,
  stroke,
  opacity,
  name,
  className,
  style,
  ...rest
}: IconProps) {
  const resolved = resolveIcon(iconSet, iconName);
  if (!resolved) {
    warnMissing(iconSet, iconName);
    const size = width ?? height ?? DEFAULT_ICON_SIZE;
    const box = Math.min(width ?? size, height ?? size);
    return (
      <svg
        {...rest}
        {...dataNameAttr(name, rest)}
        data-primitive="icon"
        data-icon-set={iconSet}
        data-icon-name={iconName}
        data-icon-missing={`${iconSet}/${iconName}`}
        viewBox={`0 0 ${size} ${size}`}
        width={width ?? DEFAULT_ICON_SIZE}
        height={height ?? DEFAULT_ICON_SIZE}
        className={joinClass(className)}
        style={{
          ...absoluteAt(x, y),
          width,
          height,
          overflow: "visible",
          ...style,
        }}
        aria-hidden="true"
      >
        <title>{missingIconDiagnostic(iconSet, iconName)}</title>
        <rect
          x={1}
          y={1}
          width={Math.max(box - 2, 0)}
          height={Math.max(box - 2, 0)}
          rx={Math.min(4, Math.max(box - 2, 0) / 4)}
          fill="none"
          stroke="currentColor"
          strokeWidth={1}
          strokeDasharray="3 2"
        />
        <text
          x="50%"
          y="50%"
          fontSize={Math.max(box / 4, 6)}
          textAnchor="middle"
          dominantBaseline="central"
          fill="currentColor"
        >
          ?
        </text>
      </svg>
    );
  }

  const { geometry } = resolved;
  const kind = iconKind ?? getIconSetKind(resolved.set) ?? "stroke";
  const ink = fill ?? "currentColor";
  return (
    <svg
      {...rest}
      {...dataNameAttr(name, rest)}
      data-primitive="icon"
      data-icon-set={resolved.set}
      data-icon-name={resolved.name}
      viewBox={geometry.viewBox}
      width={width ?? DEFAULT_ICON_SIZE}
      height={height ?? DEFAULT_ICON_SIZE}
      className={joinClass(className)}
      style={{
        ...absoluteAt(x, y),
        width,
        height,
        overflow: "visible",
        opacity,
        ...style,
      }}
      aria-hidden="true"
      {...iconPaint(kind, ink, stroke, strokeWidth)}
    >
      <title>{name ?? resolved.name}</title>
      {geometry.nodes.map((node, index) => renderNode(node, index))}
    </svg>
  );
}
