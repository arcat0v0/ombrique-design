import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, normalize, relative, resolve, sep } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

export interface BundleManifest {
  formatVersion: 1;
  created: number;
  files: Array<{ path: string; size: number }>;
}

export interface BundlePayload {
  manifest: BundleManifest;
  entries: Record<string, string>; // base64 encoded file contents
}

const INCLUDED_PREFIXES = ["pages", "components", "assets", "fonts"];
const INCLUDED_ROOT_FILES = new Set(["ombrique.json", "tokens.css"]);

function shouldIncludeFile(relPath: string): boolean {
  const norm = relPath.replace(/\\/g, "/");
  if (
    norm.startsWith(".") ||
    norm.includes("/.") ||
    norm.includes("node_modules")
  ) {
    return false;
  }
  if (INCLUDED_ROOT_FILES.has(norm)) return true;
  for (const prefix of INCLUDED_PREFIXES) {
    if (norm === prefix || norm.startsWith(`${prefix}/`)) return true;
  }
  return false;
}

export function createBundle(
  root: string,
  outFilePath: string,
): Promise<string> {
  const entries: Record<string, string> = {};
  const fileList: Array<{ path: string; size: number }> = [];

  const walk = (dir: string) => {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      if (item.name.startsWith(".") || item.name === "node_modules") continue;
      const full = join(dir, item.name);
      if (item.isDirectory()) {
        walk(full);
      } else if (item.isFile()) {
        const rel = relative(root, full).replace(/\\/g, "/");
        if (shouldIncludeFile(rel)) {
          const buf = readFileSync(full);
          entries[rel] = buf.toString("base64");
          fileList.push({ path: rel, size: buf.length });
        }
      }
    }
  };

  walk(root);

  const payload: BundlePayload = {
    manifest: {
      formatVersion: 1,
      created: Date.now(),
      files: fileList,
    },
    entries,
  };

  const jsonBuf = Buffer.from(JSON.stringify(payload), "utf8");
  const compressed = gzipSync(jsonBuf);
  mkdirSync(dirname(outFilePath), { recursive: true });
  writeFileSync(outFilePath, compressed);
  return Promise.resolve(outFilePath);
}

export function extractBundle(
  archivePath: string,
  targetDir: string,
): Promise<string> {
  const compressed = readFileSync(archivePath);
  const decompressed = gunzipSync(compressed);
  const payload = JSON.parse(decompressed.toString("utf8")) as BundlePayload;
  const resolvedTarget = resolve(targetDir);

  for (const [relPath, base64Data] of Object.entries(payload.entries)) {
    const normalizedRel = normalize(relPath.replace(/\\/g, "/"));
    // Zip slip / path traversal defense
    if (
      normalizedRel.startsWith("..") ||
      normalizedRel.startsWith("/") ||
      /^[a-zA-Z]:/.test(normalizedRel)
    ) {
      throw new Error(`Zip slip path traversal detected: ${relPath}`);
    }
    const dest = resolve(resolvedTarget, normalizedRel);
    const relFromTarget = relative(resolvedTarget, dest);
    if (relFromTarget.startsWith("..") || relFromTarget.startsWith(sep)) {
      throw new Error(`Zip slip path traversal detected: ${relPath}`);
    }

    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, Buffer.from(base64Data, "base64"));
  }

  return Promise.resolve(resolvedTarget);
}
