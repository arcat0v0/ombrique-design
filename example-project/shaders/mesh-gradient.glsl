#version 300 es
precision highp float;

uniform float u_time;
uniform vec2 u_resolution;

out vec4 outColor;

vec3 palette(float t) {
  return 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + t));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec2 p = uv - 0.5;
  float phase = u_time * 0.15;
  float warpA = sin(p.x * 2.2 + p.y * 1.4 + phase);
  float warpB = sin(p.y * 2.6 - p.x * 1.1 - phase * 0.5);
  float radial = length(p * vec2(1.6, 1.0)) * 2.0;
  vec3 color = palette(warpA * 0.12 + warpB * 0.09 + radial * 0.18 + 0.08);
  color *= 0.75 + 0.25 * smoothstep(0.9, 0.1, length(p));
  outColor = vec4(color, 1.0);
}
