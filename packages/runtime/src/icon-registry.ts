import {
  decodeIconNodes,
  type IconNode,
  type IconSetDefinition,
  type IconSetKind,
} from "./icon-codec";
import { LUCIDE_ICON_SET } from "./icons.generated";

export type IconSet = IconSetDefinition;

export interface IconGeometry {
  viewBox: string;
  nodes: IconNode[];
}

export interface IconResolution {
  set: string;
  name: string;
  geometry: IconGeometry;
}

interface IconSetRegistration {
  set: IconSet;
  aliases: Record<string, string>;
  decoded: Map<string, IconGeometry>;
}

const sets = new Map<string, IconSetRegistration>();

export function registerIconSet(set: IconSetDefinition): void {
  if (!set.name) throw new Error("icon set registration needs a name");
  sets.set(set.name, {
    set,
    aliases: set.aliases ?? {},
    decoded: new Map(),
  });
}

export function unregisterIconSet(name: string): void {
  sets.delete(name);
}

export function getIconSet(name: string): IconSet | undefined {
  return sets.get(name)?.set;
}

export function getIconSetKind(name: string): IconSetKind | undefined {
  return sets.get(name)?.set.kind;
}

export function listIconSets(): string[] {
  return [...sets.keys()].sort();
}

export function listIconNames(iconSet: string): string[] {
  const registration = sets.get(iconSet);
  if (!registration) return [];
  return Object.keys(registration.set.icons).sort();
}

function geometryFor(
  registration: IconSetRegistration,
  name: string,
): IconGeometry | undefined {
  let geometry = registration.decoded.get(name);
  if (!geometry) {
    const encoded = registration.set.icons[name];
    if (encoded === undefined) return undefined;
    geometry = {
      viewBox:
        registration.set.iconViewBoxes?.[name] ?? registration.set.viewBox,
      nodes: decodeIconNodes(encoded),
    };
    registration.decoded.set(name, geometry);
  }
  return geometry;
}

export function resolveIcon(
  iconSet: string,
  iconName: string,
): IconResolution | undefined {
  const registration = sets.get(iconSet);
  if (!registration) return undefined;
  const resolved = resolveWithin(registration, iconName);
  if (!resolved) return undefined;
  const geometry = geometryFor(registration, resolved);
  if (!geometry) return undefined;
  return { set: registration.set.name, name: resolved, geometry };
}

function resolveWithin(
  registration: IconSetRegistration,
  iconName: string,
): string | undefined {
  if (iconName in registration.set.icons) return iconName;
  const seen = new Set([iconName]);
  let current = registration.aliases[iconName];
  for (let i = 0; current !== undefined; i += 1) {
    if (i > 8) return undefined;
    if (current in registration.set.icons) return current;
    const next = registration.aliases[current];
    if (next === undefined || seen.has(next)) return undefined;
    seen.add(next);
    current = next;
  }
  return undefined;
}

export function missingIconDiagnostic(
  iconSet: string,
  iconName: string,
): string {
  const registration = sets.get(iconSet);
  if (!registration) {
    return `unknown icon set "${iconSet}"; known sets: ${listIconSets().join(", ")}`;
  }
  const alias = registration.aliases[iconName];
  const hint =
    alias === undefined
      ? `unknown icon "${iconName}" in icon set "${registration.set.name}"`
      : `icon "${iconName}" aliases to "${alias}", which is not defined`;
  return `${hint}; known icons: ${Object.keys(registration.set.icons).length}`;
}

registerIconSet(LUCIDE_ICON_SET);
