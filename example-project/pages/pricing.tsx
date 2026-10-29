import { Frame, Rect, Text } from "@ombrique/runtime";

export default function Pricing() {
  return (
    <Frame name="Pricing" x={0} y={0} width={1440} height={900} fill="#ffffff">
      <Text x={96} y={96} width={720} fontSize={48} fill="#14141a">
        Simple pricing
      </Text>
      <Rect
        x={96}
        y={208}
        width={360}
        height={420}
        fill="#f6f7fb"
        radius={18}
      />
      <Text x={128} y={248} width={296} fontSize={22} fill="#14141a">
        Solo
      </Text>
      <Text x={128} y={296} width={296} fontSize={44} fill="#14141a">
        $0
      </Text>
      <Rect
        x={504}
        y={208}
        width={360}
        height={420}
        fill="#14141a"
        radius={18}
      />
      <Text x={536} y={248} width={296} fontSize={22} fill="#ffffff">
        Team
      </Text>
      <Text x={536} y={296} width={296} fontSize={44} fill="#ffffff">
        $24
      </Text>
      <Rect
        x={912}
        y={208}
        width={360}
        height={420}
        fill="#f6f7fb"
        radius={18}
      />
      <Text x={944} y={248} width={296} fontSize={22} fill="#14141a">
        Studio
      </Text>
      <Text x={944} y={296} width={296} fontSize={44} fill="#14141a">
        $99
      </Text>
    </Frame>
  );
}
