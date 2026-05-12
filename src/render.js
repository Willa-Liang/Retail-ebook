import fs from "node:fs/promises";
import path from "node:path";
import MarkdownIt from "markdown-it";

import {
  loadRegistry,
  materializeComponent,
  normalizeTagInnerToKey,
} from "./lib/componentRegistry.js";
import { componentTagPlugin } from "./markdown/componentTagPlugin.js";

function extractTagKeys(markdownSource) {
  const pattern = /\[\[([^\]]+)\]\]/g;
  const keys = new Set();
  let m;
  while ((m = pattern.exec(markdownSource)) !== null) {
    const inner = m[1];
    const key = normalizeTagInnerToKey(inner);
    if (key) keys.add(key);
  }
  return [...keys];
}

export async function renderEbook({
  inputPath,
  outHtmlPath,
  outCssPath,
  title = "Ebook",
  rootDir,
}) {
  const absRoot = rootDir ?? process.cwd();
  const componentsDir = path.join(absRoot, "src", "components");
  const templatePath = path.join(absRoot, "src", "templates", "book.html");
  const baseCssPath = path.join(absRoot, "src", "styles", "base.css");

  const [mdSource, template, baseCss] = await Promise.all([
    fs.readFile(inputPath, "utf8"),
    fs.readFile(templatePath, "utf8"),
    fs.readFile(baseCssPath, "utf8"),
  ]);

  const registry = await loadRegistry({ componentsDir });

  // Pre-materialize only the components used in this doc so markdown-it can stay sync.
  const usedKeys = extractTagKeys(mdSource);
  const cache = new Map();
  /** @type {{srcPath: string, outRelPath: string}[]} */
  const assetsToCopy = [];
  for (const key of usedKeys) {
    const mat = await materializeComponent({ registry, key });
    if (mat) {
      cache.set(key, mat);
      if (Array.isArray(mat.assets)) assetsToCopy.push(...mat.assets);
    }
  }

  const cssCollector = new Set();
  const md = new MarkdownIt({ html: true, breaks: false, linkify: true });
  md.use(componentTagPlugin, { registry, cssCollector });

  const contentHtml = md.render(mdSource, { __componentCache: cache });
  const allCss = [baseCss, ...cssCollector].filter(Boolean).join("\n\n");

  const finalHtml = template
    .replaceAll("{{TITLE}}", escapeHtmlText(title))
    .replaceAll("{{CONTENT}}", contentHtml);

  await fs.mkdir(path.dirname(outHtmlPath), { recursive: true });
  await fs.mkdir(path.dirname(outCssPath), { recursive: true });
  await Promise.all([
    fs.writeFile(outHtmlPath, finalHtml, "utf8"),
    fs.writeFile(outCssPath, allCss, "utf8"),
  ]);

  // Copy component assets (images, svg, etc.) next to the output HTML.
  // Paths are defined relative to src/components and preserved in dist.
  const outDir = path.dirname(outHtmlPath);
  await Promise.all(
    assetsToCopy.map(async (a) => {
      const dest = path.join(outDir, a.outRelPath);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(a.srcPath, dest);
    }),
  );
}

function escapeHtmlText(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
