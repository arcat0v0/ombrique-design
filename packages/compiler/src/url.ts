export function urlToProjectPath(root: string, url: string): string | null {
  if (url.startsWith("/@fs/")) return null;
  if (url.startsWith("/@id/")) return null;
  if (url.startsWith("/@vite/")) return null;
  if (url.startsWith("/@react-refresh")) return null;
  if (url.startsWith("/node_modules/")) return null;
  const clean = url.split("?")[0]?.split("#")[0] ?? "";
  if (!clean.startsWith("/")) return null;
  const segments = clean.slice(1).split("/");
  const out: string[] = [];
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") return null;
    out.push(segment);
  }
  return out.join("/");
}

export function isVirtualModule(url: string): boolean {
  return url.startsWith("/@") || url.startsWith("/node_modules/");
}

const MIME: Record<string, string> = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".ts": "text/javascript",
  ".tsx": "text/javascript",
  ".jsx": "text/javascript",
  ".json": "application/json",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export function mimeFor(path: string): string {
  const dot = path.lastIndexOf(".");
  if (dot === -1) return "application/octet-stream";
  return MIME[path.slice(dot)] ?? "application/octet-stream";
}
