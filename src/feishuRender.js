import minimist from "minimist";
import path from "node:path";
import fs from "node:fs/promises";

import { loadDotEnv } from "./lib/env.js";
import {
  getAllTopLevelDocxBlocks,
  getDocxRawContent,
  getMediaTmpDownloadUrl,
  getTenantAccessToken,
  getWikiNode,
  listDocxBlockChildren,
} from "./feishu/api.js";
import { parseWikiNodeTokenFromUrl, safeSlug } from "./feishu/url.js";
import { renderTo34Pages } from "./feishu/render34.js";

function inferOpenApiBaseFromDocUrl(docUrl) {
  let u;
  try {
    u = new URL(docUrl);
  } catch {
    return undefined;
  }

  const host = u.hostname.toLowerCase();
  // Lark global tenants often use larkoffice.com / larksuite.com.
  if (host.endsWith(".larkoffice.com") || host.endsWith(".larksuite.com")) {
    return "https://open.larksuite.com";
  }
  // Feishu CN tenants typically use feishu.cn.
  if (host.endsWith(".feishu.cn")) return "https://open.feishu.cn";
  return undefined;
}

async function hydrateBlockTree({
  apiBase,
  tenantAccessToken,
  documentId,
  blocks,
}) {
  const out = [];
  for (const block of blocks || []) {
    if (!Array.isArray(block?.children) || block.children.length === 0) {
      out.push(block);
      continue;
    }
    const data = await listDocxBlockChildren({
      apiBase,
      tenantAccessToken,
      documentId,
      blockId: block.block_id,
    });
    const childrenBlocks = await hydrateBlockTree({
      apiBase,
      tenantAccessToken,
      documentId,
      blocks: data?.items || [],
    });
    out.push({ ...block, childrenBlocks });
  }
  return out;
}

async function main() {
  await loadDotEnv();

  const argv = minimist(process.argv.slice(2));
  const url = argv.url || argv.u;
  const out = argv.out || "dist/feishu";

  if (!url) {
    console.error("Missing --url <wiki_url>");
    process.exit(1);
  }

  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  if (!appId || !appSecret) {
    console.error(
      "Missing FEISHU_APP_ID / FEISHU_APP_SECRET. Put them in .env (see .env.example).",
    );
    process.exit(1);
  }

  const apiBase = inferOpenApiBaseFromDocUrl(url) || process.env.FEISHU_OPEN_API_BASE;

  const nodeToken = parseWikiNodeTokenFromUrl(url);
  const tenantAccessToken = await getTenantAccessToken({ apiBase, appId, appSecret });
  const node = await getWikiNode({ apiBase, tenantAccessToken, nodeToken });

  const objType = node?.obj_type;
  const docId = node?.obj_token;
  const title = node?.title || "Feishu Doc";

  if (!docId || !objType) {
    throw new Error("Wiki node did not contain obj_type/obj_token. Check permissions.");
  }
  if (objType !== "docx") {
    throw new Error(`Unsupported wiki obj_type: ${objType} (only docx is supported in this PoC)`);
  }

  const [raw, docBlocks] = await Promise.all([
    getDocxRawContent({ apiBase, tenantAccessToken, documentId: docId }),
    getAllTopLevelDocxBlocks({ apiBase, tenantAccessToken, documentId: docId }),
  ]);

  const slug = safeSlug(title) || safeSlug(docId);
  const outDir = path.join(out, slug);
  const hydratedBlocks = await hydrateBlockTree({
    apiBase,
    tenantAccessToken,
    documentId: docId,
    blocks: docBlocks,
  });
  const mediaCache = new Map();

  const { pageCount } = await renderTo34Pages({
    docBlocks: hydratedBlocks,
    rawContent: raw,
    title,
    outDir,
    pagePrefix: "34",
    mediaResolver: async (fileToken) => {
      if (mediaCache.has(fileToken)) return mediaCache.get(fileToken);
      const tmpUrl = await getMediaTmpDownloadUrl({
        apiBase,
        tenantAccessToken,
        fileToken,
      });
      mediaCache.set(fileToken, tmpUrl);
      return tmpUrl;
    },
  });

  console.log(`Exported ${pageCount} pages to ${outDir}`);
  console.log(`Index: ${path.join(outDir, "index.html")}`);

  await buildViewer(outDir);
  console.log(`Viewer: ${path.join(outDir, "viewer.html")}`);
}

async function buildViewer(dir) {
  const files = await fs.readdir(dir);
  const pageFiles = files.filter((f) => f.match(/^\d+-\d+\.html$/)).sort();

  let allArticles = "";
  for (const file of pageFiles) {
    const content = await fs.readFile(path.join(dir, file), "utf-8");
    const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
      allArticles += `
        <div class="pdf-page-container">
          ${bodyMatch[1]}
        </div>
      `;
    }
  }

  const viewerHtml = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Retail Ebook - Full Viewer</title>
    <link rel="stylesheet" href="styles.css" />
    <style>
      body {
        background-color: #525659;
        margin: 0;
        padding: 40px 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 20px;
        font-family: sans-serif;
      }
      .pdf-page-container {
        width: 650px;
        height: 842px;
        background: white;
        box-shadow: 0 2px 10px rgba(0,0,0,0.5);
        position: relative;
        overflow: hidden;
      }
      .pdf-page-container > .c-page34 {
        width: 100%;
        height: 100%;
        margin: 0;
        padding: 0;
      }
      .viewer-header {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: #323639;
        color: white;
        padding: 10px 20px;
        z-index: 1000;
        box-shadow: 0 1px 3px rgba(0,0,0,0.5);
        display: flex;
        justify-content: center;
        font-size: 14px;
      }
    </style>
  </head>
  <body>
    <div class="viewer-header">
      Retail Ebook - ${pageFiles.length} Pages
    </div>
    ${allArticles}
  </body>
</html>`;

  await fs.writeFile(path.join(dir, "viewer.html"), viewerHtml, "utf-8");
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
