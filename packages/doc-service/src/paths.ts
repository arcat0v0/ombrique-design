import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, posix, relative, resolve, sep } from "node:path";
import { manifestSchema, type Manifest } from "@ombrique/protocol";

export const MANIFEST_NAME = "ombrique.json";

export function hashText(text: string): string {
  return createHash("sha1").update(text).digest("hex").slice(0, 16);
}

export function toPosix(path: string): string {
  return path.split(sep).join("/");
}

export function resolveInside(root: string, relativePath: string): string {
  if (relativePath.startsWith("/") || /^[a-zA-Z]:/.test(relativePath)) {
    throw new Error(`absolute paths are not allowed: ${relativePath}`);
  }
  const normalized = posix.normalize(relativePath.replace(/\\/g, "/"));
  if (normalized.startsWith("..") || normalized === ".") {
    throw new Error(`path escapes the project: ${relativePath}`);
  }
  const absolute = resolve(root, normalized);
  const rel = relative(root, absolute);
  if (rel.startsWith("..") || rel.startsWith(sep)) {
    throw new Error(`path escapes the project: ${relativePath}`);
  }
  return absolute;
}

export const DESIGN_EXTENSIONS = new Set([
  ".tsx",
  ".scss",
  ".css",
  ".json",
  ".svg",
]);

export function listDesignFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const absolute = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = entry.name.slice(entry.name.lastIndexOf("."));
      if (DESIGN_EXTENSIONS.has(ext))
        out.push(toPosix(relative(root, absolute)));
    }
  };
  walk(root);
  return out.sort();
}

export function readManifest(root: string): Manifest {
  const raw = readFileSync(join(root, MANIFEST_NAME), "utf8");
  return manifestSchema.parse(JSON.parse(raw));
}

export function writeFileAtomic(absolute: string, text: string): void {
  mkdirSync(dirname(absolute), { recursive: true });
  const temp = `${absolute}.ombrique-tmp-${process.pid}`;
  writeFileSync(temp, text, "utf8");
  renameSync(temp, absolute);
}

export function removeFile(absolute: string): void {
  rmSync(absolute, { force: true });
}

export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
