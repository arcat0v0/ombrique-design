import { Frame, Icon, Rect, Text } from "@ombrique/runtime";
import { IconBadge } from "../components/IconBadge";

export default function Showcase() {
  return (
    <Frame
      name="Showcase"
      x={0}
      y={0}
      width={1440}
      height={900}
      fill="var(--color-bg)"
      data-mode="dark"
      data-density="condensed"
    >
      <Frame
        name="ShowcaseContent"
        x={0}
        y={0}
        width={720}
        height={420}
        layout="vertical"
        style={{
          padding: "var(--space-6)",
          gap: "var(--space-4)",
        }}
      >
        <Text
          x={0}
          y={0}
          width={720}
          fontSize={48}
          fill="var(--color-fg)"
          style={{ position: "relative", width: "100%" }}
        >
          Multi-axis tokens, icons, components
        </Text>
        <Text
          x={0}
          y={0}
          width={720}
          fontSize={18}
          fill="var(--color-muted)"
          style={{ position: "relative", width: "100%" }}
        >
          data-mode and data-density resolve through tokens.css
        </Text>
        <Frame
          name="ShowcaseBadges"
          x={0}
          y={0}
          width={720}
          height={64}
          layout="horizontal"
          style={{
            gap: "var(--space-4)",
            alignItems: "center",
          }}
        >
          <Icon
            data-name="Sparkles"
            x={0}
            y={0}
            width={64}
            height={64}
            iconSet="lucide"
            iconName="sparkles"
            iconKind="stroke"
            strokeWidth={1.5}
            fill="var(--color-primary)"
            style={{ position: "relative" }}
          />
          <Rect
            x={0}
            y={0}
            width={2}
            height={64}
            fill="var(--color-border)"
            style={{ position: "relative" }}
          />
          <IconBadge tone="brand" size="lg" x={0} y={0} />
          <IconBadge tone="neutral" size="sm" x={0} y={0} />
        </Frame>
      </Frame>
    </Frame>
  );
}
