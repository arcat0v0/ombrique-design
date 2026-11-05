import { Frame, Text } from "@ombrique/runtime";

export interface IconBadgeProps {
  tone?: "brand" | "neutral";
  size?: "sm" | "lg";
  x?: number;
  y?: number;
}

export const variantAxes = [
  { name: "tone", values: ["brand", "neutral"] },
  { name: "size", values: ["sm", "lg"] },
];

export function IconBadge({
  tone = "brand",
  size = "lg",
  x = 0,
  y = 0,
}: IconBadgeProps) {
  const fill =
    tone === "brand" ? "var(--color-primary)" : "var(--color-border)";
  const ink = tone === "brand" ? "var(--color-on-primary)" : "var(--color-fg)";
  const width = size === "lg" ? 120 : 88;
  return (
    <Frame
      name="IconBadge"
      x={x}
      y={y}
      width={width}
      height={40}
      fill={fill}
      radius={20}
      data-tone={tone}
      data-size={size}
    >
      <Text
        x={0}
        y={0}
        width={width - 32}
        fontSize={14}
        fill={ink}
        style={{
          left: "var(--space-4)",
          top: "var(--space-2)",
          width: "calc(100% - var(--space-4) - var(--space-4))",
        }}
      >
        {size} / {tone}
      </Text>
    </Frame>
  );
}
