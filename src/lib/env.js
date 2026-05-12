import fs from "node:fs/promises";
import path from "node:path";

// Minimal .env loader (KEY=VALUE, no fancy interpolation).
// We keep it small to avoid adding dependencies for now.
export async function loadDotEnv({ rootDir = process.cwd(), filename = ".env" } = {}) {
  const p = path.join(rootDir, filename);
  let content;
  try {
    content = await fs.readFile(p, "utf8");
  } catch {
    return;
  }

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if (!key) continue;
    // Strip simple quotes
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

