import { Frame, Rect, Text, Ellipse, Star } from "@ombrique/runtime";

export default function Home() {
  return (
    <Frame name="Home" x={0} y={0} width={1440} height={900} fill="#ffffff">
      <Ellipse
        data-name="ellipse"
        fill="#d9d9d9"
        style={{
          position: "absolute",
          left: 40,
          top: 40,
          width: 337,
          height: 297,
        }}
      />
      <Text style={{ position: "absolute", left: 24, top: 24, width: 240 }}>
        Text
      </Text>
      <Text style={{ position: "absolute", left: 40, top: 40, width: 240 }}>
        Text
      </Text>
      <Rect x={0} y={0} width={1440} height={360} fill="#14141a" radius={0} />
      <Text x={96} y={96} width={720} fontSize={56} fill="#ffffff">
        Design in code
      </Text>
      <Text x={96} y={188} width={640} fontSize={20} fill="#b9b9c8">
        Ombrique renders real React. What you see is what the browser paints.
      </Text>
      <Frame
        name="Button"
        x={96}
        y={263}
        width={196}
        height={56}
        fill="#ff3366"
        radius={12}
      >
        <Text x={16} y={18} width={164} fontSize={17} fill="#ffffff">
          Get started
        </Text>
      </Frame>
      <Text x={96} y={432} width={560} fontSize={34} fill="#14141a">
        Everything is a component
      </Text>
      <Text x={96} y={494} width={620} fontSize={17} fill="#5b5b6b">
        Frames, text, and shapes are plain TSX. Open the source and edit it by
        hand, or drag on the canvas and let the editor write the patch.
      </Text>
      <Frame
        name="Card"
        x={96}
        y={611}
        width={352}
        height={212}
        fill="#f6f7fb"
        radius={18}
      >
        <Text x={32} y={36} width={288} fontSize={20} fill="#14141a">
          Deterministic files
        </Text>
        <Text x={32} y={74} width={288} fontSize={15} fill="#5b5b6b">
          Every canvas edit becomes a minimal text patch, so git diffs stay
          readable.
        </Text>
      </Frame>
      <Frame
        name="Card"
        x={480}
        y={584}
        width={352}
        height={212}
        fill="#f6f7fb"
        radius={18}
      >
        <Text x={32} y={36} width={288} fontSize={20} fill="#14141a">
          Agent friendly
        </Text>
        <Text x={32} y={74} width={288} fontSize={15} fill="#5b5b6b">
          Agents read and write the same sources you do. No proprietary binary
          format.
        </Text>
      </Frame>
      <Frame
        name="Card"
        x={864}
        y={584}
        width={352}
        height={212}
        fill="#f6f7fb"
        radius={18}
      >
        <Text x={32} y={36} width={288} fontSize={20} fill="#14141a">
          Pixel faithful
        </Text>
        <Text x={32} y={74} width={288} fontSize={15} fill="#5b5b6b">
          Chromium lays out and paints; the compositor only moves textures around.
        </Text>
      </Frame>
    </Frame>
  );
}
