import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { Manifest } from "@ombrique/protocol";

export function starterManifest(): Manifest {
  return {
    formatVersion: 1,
    pages: [{ id: "home", name: "Home", file: "pages/home.tsx" }],
  };
}

export function starterPageSource(projectName: string): string {
  const label = projectName.trim() || "Untitled";
  return `import { Ellipse, Frame, Rect, Text } from "@ombrique/runtime";

export default function Home() {
  return (
    <Frame name="Home" x={0} y={0} width={1440} height={900} fill="#0d0d12">
      <Rect x={96} y={96} width={1248} height={708} fill="#17171f" radius={28} />
      <Ellipse x={1120} y={140} width={160} height={160} fill="#ff3366" />
      <Rect x={144} y={152} width={148} height={30} fill="#26262f" radius={15} />
      <Text x={164} y={160} width={120} fontSize={13} fill="#b9b9c8">
        NEW PROJECT
      </Text>
      <Text x={144} y={230} width={760} fontSize={64} fill="#ffffff">
        {${JSON.stringify(label)}}
      </Text>
      <Text x={144} y={330} width={620} fontSize={20} fill="#9a9aad">
        A fresh Ombrique design. Everything on this canvas is real TSX.
      </Text>
      <Rect x={144} y={404} width={184} height={52} fill="#ff3366" radius={12} />
      <Text x={180} y={420} width={140} fontSize={16} fill="#ffffff">
        Start designing
      </Text>
    </Frame>
  );
}
`;
}

export function scaffoldProject(directory: string): Manifest {
  const entries = readdirSync(directory, { withFileTypes: true }).filter(
    (entry) => !entry.name.startsWith("."),
  );
  if (entries.length > 0) {
    throw new Error("请选择一个空文件夹来创建新项目");
  }
  const manifest = starterManifest();
  const name = basename(directory).trim() || "Untitled";
  mkdirSync(join(directory, "pages"), { recursive: true });
  writeFileSync(
    join(directory, "ombrique.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    join(directory, "pages", "home.tsx"),
    starterPageSource(name),
    "utf8",
  );
  return manifest;
}
