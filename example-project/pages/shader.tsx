import { Frame, Shader, Text } from "@ombrique/runtime";

export default function ShaderPage() {
  return (
    <Frame name="Shader" x={0} y={0} width={1200} height={820} fill="#0b0b12">
      <Text x={64} y={56} width={700} fontSize={40} fill="#f4f4f7">
        Static shader layer
      </Text>
      <Text x={64} y={116} width={700} fontSize={16} fill="#9a9aab">
        WebGL2 fragment shader composited above the board texture
      </Text>
      <Shader
        name="MeshGradient"
        x={64}
        y={176}
        width={720}
        height={420}
        radius={28}
        src="shaders/mesh-gradient.glsl"
        time={0}
      />
      <Shader
        name="MeshGradientSquare"
        x={824}
        y={176}
        width={312}
        height={312}
        radius={16}
        src="shaders/mesh-gradient.glsl"
        time={0}
      />
      <Text x={64} y={640} width={720} fontSize={14} fill="#7f7f90">
        u_time is fixed at 0 and u_resolution follows the backing store
      </Text>
    </Frame>
  );
}
