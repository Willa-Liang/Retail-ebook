import fs from "node:fs/promises";
import path from "node:path";

function normalizeComponentKey(raw) {
  // Allow both [[A:B]] and [[A/B]]; normalize to "A/B" for registry lookup.
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (s.includes(":")) {
    const [a, b] = s.split(":");
    return `${a.trim()}/${(b ?? "").trim()}`.replace(/\/$/, "");
  }
  return s;
}

export async function loadRegistry({ componentsDir }) {
  const registryPath = path.join(componentsDir, "registry.json");
  const json = await fs.readFile(registryPath, "utf8");
  const raw = JSON.parse(json);

  /**
   * @type {Map<string, {htmlPath: string, cssPaths: string[], assets: {srcPath: string, outRelPath: string}[]}>}
   */
  const map = new Map();
  for (const [key, def] of Object.entries(raw)) {
    const k = normalizeComponentKey(key);
    if (!k) continue;
    map.set(k, {
      htmlPath: path.join(componentsDir, def.html),
      cssPaths: (def.css ?? []).map((p) => path.join(componentsDir, p)),
      assets: (def.assets ?? []).map((rel) => ({
        srcPath: path.join(componentsDir, rel),
        outRelPath: rel,
      })),
    });
  }
  return map;
}

export function normalizeTagInnerToKey(tagInner) {
  const s = String(tagInner ?? "").trim();
  if (!s) return "";
  // Prefer ":" if present; otherwise if it looks like "A/B" keep as-is.
  if (s.includes(":")) return normalizeComponentKey(s);
  return s;
}

export async function materializeComponent({ registry, key }) {
  const def = registry.get(key);
  if (!def) return null;

  const html = await fs.readFile(def.htmlPath, "utf8");
  const cssChunks = [];
  for (const cssPath of def.cssPaths) {
    cssChunks.push(await fs.readFile(cssPath, "utf8"));
  }
  return {
    html,
    css: cssChunks.join("\n"),
    assets: def.assets ?? [],
  };
}
