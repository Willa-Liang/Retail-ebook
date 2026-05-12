import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const root = process.cwd();
  const srcComponents = path.join(root, "src", "components");
  const distDir = path.join(root, "dist");
  const exportDir = path.join(distDir, "export");

  const baseCssPath = path.join(root, "src", "styles", "base.css");
  const pageCssPath = path.join(srcComponents, "34", "page.css");
  const assetsSrcDir = path.join(srcComponents, "34", "assets");
  const assetsOutDir = path.join(exportDir, "34", "assets");

  await fs.mkdir(exportDir, { recursive: true });
  await fs.mkdir(assetsOutDir, { recursive: true });

  const [baseCss, pageCss] = await Promise.all([
    fs.readFile(baseCssPath, "utf8"),
    fs.readFile(pageCssPath, "utf8"),
  ]);

  // One shared CSS file for all exported pages.
  await fs.writeFile(
    path.join(exportDir, "styles.css"),
    [baseCss, pageCss].join("\n\n"),
    "utf8",
  );

  // Copy assets referenced by page-34 components.
  const assetFiles = await fs.readdir(assetsSrcDir);
  await Promise.all(
    assetFiles.map(async (name) => {
      const src = path.join(assetsSrcDir, name);
      const dest = path.join(assetsOutDir, name);
      await fs.copyFile(src, dest);
    }),
  );

  const links = [];
  for (let i = 1; i <= 10; i++) {
    const nn = String(i).padStart(2, "0");
    const articlePath = path.join(srcComponents, "34", `${nn}.html`);
    const article = await fs.readFile(articlePath, "utf8");

    const html = wrapAsStandalonePage({
      title: `34/${nn}`,
      bodyHtml: article,
    });

    const outName = `34-${nn}.html`;
    const outPath = path.join(exportDir, outName);
    await fs.writeFile(outPath, html, "utf8");
    links.push(outName);
  }

  // Convenience index.
  await fs.writeFile(
    path.join(exportDir, "index.html"),
    renderIndexHtml(links),
    "utf8",
  );

  console.log(`Wrote ${path.join("dist", "export", "index.html")}`);
}

function wrapAsStandalonePage({ title, bodyHtml }) {
  // Force PDF/print to treat this as a single page with exact pixel size.
  // Browsers differ in how strictly they honor px-sized @page, but this helps.
  const printCss = `
@page { size: 650px 842px; margin: 0; }
html, body { width: 650px; height: 842px; margin: 0; padding: 0; }
`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="styles.css" />
    <style>${printCss}</style>
  </head>
  <body>${bodyHtml}</body>
</html>
`;
}

function renderIndexHtml(files) {
  const items = files
    .map((f) => `<li><a href="${f}">${f}</a></li>`)
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Export 34 Pages</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; padding: 24px; }
      a { color: #2563eb; text-decoration: none; }
      a:hover { text-decoration: underline; }
    </style>
  </head>
  <body>
    <h1>Export 34 Pages</h1>
    <p>Each link contains exactly one <code>article.c-page34</code> so <code>Cmd+P</code> exports a single page.</p>
    <ol>${items}</ol>
  </body>
</html>
`;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});

