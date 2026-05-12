import fs from "node:fs/promises";
import path from "node:path";

function enforceLarkBrand(text) {
  if (!text) return text;
  return String(text).replace(/(?<![a-zA-Z])lark(?![a-zA-Z])/gi, "Lark");
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function extractTextAndBold(elements = []) {
  const parts = [];
  let hasBold = false;
  for (const el of elements) {
    if (el?.text_run?.content) {
      parts.push(enforceLarkBrand(el.text_run.content));
      if (el.text_run?.text_element_style?.bold) hasBold = true;
      continue;
    }
    if (el?.mention_user?.name) {
      parts.push(`@${enforceLarkBrand(el.mention_user.name)}`);
      continue;
    }
    if (el?.mention_doc?.title) {
      parts.push(enforceLarkBrand(el.mention_doc.title));
      continue;
    }
    if (el?.equation?.content) {
      parts.push(el.equation.content);
      continue;
    }
    if (el?.reminder?.text) {
      parts.push(enforceLarkBrand(el.reminder.text));
    }
  }
  return {
    text: parts.join("").replace(/\s+/g, " ").trim(),
    hasBold,
  };
}

function renderInlineElementsHtml(elements = []) {
  const parts = [];
  let hasBold = false;
  for (const el of elements) {
    if (el?.text_run?.content) {
      const content = escapeHtml(enforceLarkBrand(el.text_run.content)).replaceAll("\n", "<br />");
      if (el.text_run?.text_element_style?.bold) {
        parts.push(`<strong>${content}</strong>`);
        hasBold = true;
      } else {
        parts.push(content);
      }
      continue;
    }
    if (el?.mention_user?.name) {
      parts.push(escapeHtml(`@${enforceLarkBrand(el.mention_user.name)}`));
      continue;
    }
    if (el?.mention_doc?.title) {
      parts.push(escapeHtml(enforceLarkBrand(el.mention_doc.title)));
      continue;
    }
    if (el?.equation?.content) {
      parts.push(escapeHtml(el.equation.content));
      continue;
    }
    if (el?.reminder?.text) {
      parts.push(escapeHtml(enforceLarkBrand(el.reminder.text)));
    }
  }
  return {
    html: parts.join(""),
    hasBold,
  };
}

function normalizeBlocks(docBlocks = []) {
  const out = [];
  for (const block of docBlocks) {
    const children = Array.isArray(block?.childrenBlocks) ? normalizeBlocks(block.childrenBlocks) : [];

    if (block?.block_type === 3 && block?.heading1?.elements) {
      const { text } = extractTextAndBold(block.heading1.elements);
      const { html } = renderInlineElementsHtml(block.heading1.elements);
      if (text) out.push({ type: "h1", text, html });
      continue;
    }
    if (block?.block_type === 4 && block?.heading2?.elements) {
      const { text } = extractTextAndBold(block.heading2.elements);
      const { html } = renderInlineElementsHtml(block.heading2.elements);
      if (text) out.push({ type: "h2", text, html });
      continue;
    }
    if (block?.block_type === 5 && block?.heading3?.elements) {
      const { text } = extractTextAndBold(block.heading3.elements);
      const { html } = renderInlineElementsHtml(block.heading3.elements);
      if (text) out.push({ type: "h3", text, html });
      continue;
    }
    if (block?.block_type === 2 && block?.text?.elements) {
      const { text, hasBold } = extractTextAndBold(block.text.elements);
      const rendered = renderInlineElementsHtml(block.text.elements);
      if (text) out.push({ type: "p", text, html: rendered.html, hasBold: hasBold || rendered.hasBold });
      continue;
    }
    if (block?.block_type === 12 && block?.bullet?.elements) {
      const { text, hasBold } = extractTextAndBold(block.bullet.elements);
      const rendered = renderInlineElementsHtml(block.bullet.elements);
      if (text) {
        const nestedBullets = children.filter((item) => item.type === "li" && !item.ordered);
        if (nestedBullets.length > 0) {
          out.push({
            type: "category-item",
            title: text,
            titleHtml: rendered.html,
            descriptions: nestedBullets.map((item) => ({
              text: item.text,
              html: item.html || escapeHtml(item.text),
            })),
          });
          continue;
        }
        out.push({
          type: "li",
          text,
          html: rendered.html,
          hasBold: hasBold || rendered.hasBold,
          ordered: false,
        });
      }
      continue;
    }
    if (block?.block_type === 13 && block?.ordered?.elements) {
      const { text, hasBold } = extractTextAndBold(block.ordered.elements);
      const rendered = renderInlineElementsHtml(block.ordered.elements);
      if (text) {
        out.push({
          type: "li",
          text,
          html: rendered.html,
          hasBold: hasBold || rendered.hasBold,
          ordered: true,
        });
      }
      continue;
    }
    if (block?.block_type === 19) {
      const textChildren = children.filter((item) => ["p", "h3", "li"].includes(item.type));
      const text = textChildren.map((item) => item.text).join(" ").trim();
      if (text) {
        out.push({
          type: "highlight",
          text,
          hasBold: textChildren.some((item) => item.hasBold),
        });
      }
      continue;
    }
    if (block?.block_type === 27 && block?.image?.token) {
      out.push({
        type: "image",
        token: block.image.token,
        width: block.image.width || 554,
        height: block.image.height || 320,
      });
      continue;
    }
    if (children.length) out.push(...children);
  }
  return out;
}

function splitToParagraphs(raw) {
  return String(raw ?? "")
    .replaceAll("\r\n", "\n")
    .split(/\n{2,}/)
    .map((p) => p.replaceAll("\n", " ").trim())
    .filter(Boolean);
}

function splitLongTextBlock(block, maxChars = 650) {
  if (!["p", "li", "highlight"].includes(block.type) || block.text.length <= maxChars) {
    return [block];
  }
  const sentences = block.text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (sentences.length <= 1) return [block];

  const chunks = [];
  let current = "";
  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence}` : sentence;
    if (current && next.length > maxChars) {
      chunks.push({ ...block, text: current, html: escapeHtml(current) });
      current = sentence;
    } else {
      current = next;
    }
  }
  if (current) chunks.push({ ...block, text: current, html: escapeHtml(current) });
  return chunks;
}

function groupCategoryBlocks(blocks) {
  const out = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.type !== "category-item") {
      out.push(block);
      continue;
    }

    const items = [block];
    let j = i + 1;
    while (j < blocks.length && blocks[j].type === "category-item") {
      items.push(blocks[j]);
      j += 1;
    }

    let intro = null;
    const prev = out[out.length - 1];
    if (prev?.type === "p") {
      intro = prev;
      out.pop();
    }

    out.push({
      type: "category",
      intro,
      items,
    });
    i = j - 1;
  }
  return out;
}

function coalesceLists(blocks) {
  const out = [];
  let current = null;
  for (const block of blocks) {
    if (block.type === "li") {
      if (!current || current.ordered !== block.ordered) {
        current = { type: "list", ordered: block.ordered, items: [] };
        out.push(current);
      }
      current.items.push(block);
      continue;
    }
    current = null;
    out.push(block);
  }
  return out;
}

function estimateTextCost(charsPerLine, lineHeight, text = "") {
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  return lines * lineHeight;
}

function estimateBlockCost(block) {
  if (block.type === "h1") return 42 + 16;
  if (block.type === "h2") return 32 + 16;
  if (block.type === "h3") return 18 + 12;
  if (block.type === "p") return estimateTextCost(76, 18, block.text) + 12;
  if (block.type === "category") {
    const introCost = block.intro ? estimateTextCost(76, 18, block.intro.text) + 16 : 0;
    const itemsCost = block.items.reduce((sum, item) => {
      const descText = item.descriptions.map((d) => d.text).join(" ");
      return sum + 26 + estimateTextCost(66, 18, descText) + 24;
    }, 0);
    return introCost + itemsCost + 16;
  }
  if (block.type === "list") {
    const text = block.items.map((item) => item.text).join(" ");
    return estimateTextCost(66, 18, text) + Math.max(18, block.items.length * 6) + 12;
  }
  if (block.type === "highlight") return 138 + 16;
  if (block.type === "image") {
    const scaledHeight = Math.round((block.height / Math.max(block.width, 1)) * 554);
    return Math.min(Math.max(scaledHeight, 180), 320) + 16;
  }
  return 0;
}

function isComponentBlock(block) {
  return ["category", "highlight", "image"].includes(block?.type);
}

function isCarryWithComponentCandidate(block) {
  return ["p", "h3", "list"].includes(block?.type);
}

function estimateSpacingCost(prev, next) {
  if (!prev || !next) return 0;
  let spacing = 16;
  if (isComponentBlock(prev)) spacing += 16;
  if (isComponentBlock(next)) spacing += 16;
  return spacing;
}

function estimateSequenceCost(blocks) {
  let total = 0;
  let prev = null;
  for (const block of blocks) {
    total += estimateSpacingCost(prev, block);
    total += estimateBlockCost(block);
    prev = block;
  }
  return total;
}

function pickTrailingBlocksForComponent(page, componentBlock, pageBudgetPx) {
  const candidates = [];
  for (let i = page.length - 1; i >= 0; i -= 1) {
    const block = page[i];
    if (!isCarryWithComponentCandidate(block)) break;
    candidates.unshift(block);
    if (candidates.length >= 2) break;
  }

  for (let count = candidates.length; count >= 1; count -= 1) {
    const carry = candidates.slice(candidates.length - count);
    const remaining = page.slice(0, page.length - count);
    if (remaining.length === 0) continue;
    if (estimateSequenceCost([...carry, componentBlock]) <= pageBudgetPx) {
      return { carry, remaining };
    }
  }

  return null;
}

function paginateFlow(blocks, { pageBudgetPx = 698 } = {}) {
  const pages = [];
  let page = [];
  let budget = pageBudgetPx;

  for (const block of blocks) {
    const cost = estimateBlockCost(block);
    const prev = page[page.length - 1];
    const spacing = estimateSpacingCost(prev, block);

    if (block.type === "h1" && page.length > 0) {
      pages.push(page);
      page = [];
      budget = pageBudgetPx;
    }

    if (page.length > 0 && cost + spacing > budget) {
      if (isComponentBlock(block)) {
        const moved = pickTrailingBlocksForComponent(page, block, pageBudgetPx);
        if (moved) {
          pages.push(moved.remaining);
          page = [...moved.carry];
          budget = pageBudgetPx - estimateSequenceCost(page);
          const reboundSpacing = estimateSpacingCost(page[page.length - 1], block);
          if (cost + reboundSpacing <= budget) {
            budget -= reboundSpacing;
            page.push(block);
            budget -= Math.min(cost, pageBudgetPx);
            continue;
          }
        }
      }
      pages.push(page);
      page = [];
      budget = pageBudgetPx;
    }

    if (page.length > 0) budget -= spacing;
    page.push(block);
    budget -= Math.min(cost, pageBudgetPx);
  }

  if (page.length) pages.push(page);
  return pages;
}

function splitHighlightCopy(text) {
  const clean = String(text || "").trim();
  if (!clean) return { title: "Highlight", body: "" };

  const sentenceSplit = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentenceSplit.length >= 2 && sentenceSplit[0].length <= 96) {
    return {
      title: sentenceSplit[0].trim(),
      body: sentenceSplit.slice(1).join(" ").trim(),
    };
  }
  if (clean.length <= 96) {
    return { title: clean, body: "" };
  }
  return { title: "Highlight", body: clean };
}

function toSentenceCase(text) {
  const clean = String(text || "").trim();
  if (!clean) return "";
  const lower = clean.toLowerCase();
  const cased = lower.charAt(0).toUpperCase() + lower.slice(1);
  return enforceLarkBrand(cased);
}

function getFooterMetaFromHeading(text, chapterIndex) {
  const clean = String(text || "").trim();
  const matched = clean.match(/^chapter\s+(\d+)\s*[:\-]?\s*(.*)$/i);
  if (matched) {
    return {
      chapterLabel: `Chapter ${matched[1]}`,
      chapterTitle: matched[2] ? toSentenceCase(matched[2]) : "",
      chapterIndex: Number(matched[1]) || chapterIndex,
    };
  }
  return {
    chapterLabel: `Chapter ${chapterIndex}`,
    chapterTitle: toSentenceCase(clean),
    chapterIndex,
  };
}

function inferImageExtension(contentType, url) {
  const type = String(contentType || "").toLowerCase();
  if (type.includes("png")) return ".png";
  if (type.includes("jpeg") || type.includes("jpg")) return ".jpg";
  if (type.includes("webp")) return ".webp";
  if (type.includes("gif")) return ".gif";
  if (type.includes("svg")) return ".svg";
  try {
    const ext = path.extname(new URL(url).pathname);
    if (ext) return ext;
  } catch {
    // Fall through to default extension.
  }
  return ".png";
}

async function ensureImageAsset({ token, exportDir, mediaResolver, mediaAssetCache }) {
  if (!mediaResolver) return null;
  if (mediaAssetCache.has(token)) return mediaAssetCache.get(token);

  try {
    const tmpUrl = await mediaResolver(token);
    if (!tmpUrl) return null;
    const res = await fetch(tmpUrl);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const ext = inferImageExtension(res.headers.get("content-type"), tmpUrl);
    const relPath = `media/${token}${ext}`;
    const outPath = path.join(exportDir, relPath);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, buf);
    mediaAssetCache.set(token, relPath);
    return relPath;
  } catch {
    return null;
  }
}

function renderBlockHtml(block) {
  if (block.type === "h1") return `<div class="c-page34__module c-page34__module--text"><h1 class="c-page34__h1">${block.html || escapeHtml(block.text)}</h1></div>`;
  if (block.type === "h2") return `<div class="c-page34__module c-page34__module--text"><h2 class="c-page34__h2">${block.html || escapeHtml(block.text)}</h2></div>`;
  if (block.type === "h3") return `<div class="c-page34__module c-page34__module--text"><h3 class="c-page34__h3">${block.html || escapeHtml(block.text)}</h3></div>`;
  if (block.type === "p") return `<div class="c-page34__module c-page34__module--text"><p class="c-page34__p">${block.html || escapeHtml(block.text)}</p></div>`;
  if (block.type === "category") {
    const introHtml = block.intro
      ? `<p class="c-category__intro">${block.intro.html || escapeHtml(block.intro.text)}</p>`
      : "";
    const itemsHtml = block.items
      .map((item, index) => {
        const descriptionHtml = item.descriptions
          .map((desc) => desc.html || escapeHtml(desc.text))
          .join("<br />");
        return `<article class="c-category__item${
          index < block.items.length - 1 ? " c-category__item--with-divider" : ""
        }"><header class="c-category__item-header"><p class="c-category__index">${String(
          index + 1,
        ).padStart(2, "0")}</p><p class="c-category__title">${
          item.titleHtml || escapeHtml(item.title)
        }</p></header><p class="c-category__body">${descriptionHtml}</p></article>`;
      })
      .join("");
    return `<div class="c-page34__module c-page34__module--component"><section class="c-category c-category--3-colomn">${introHtml}${itemsHtml}</section></div>`;
  }
  if (block.type === "list") {
    const tag = block.ordered ? "ol" : "ul";
    const items = block.items
      .map((item) => `<li class="c-page34__list-item">${item.html || escapeHtml(item.text)}</li>`)
      .join("");
    return `<div class="c-page34__module c-page34__module--text"><${tag} class="c-page34__list c-page34__list--${block.ordered ? "ordered" : "unordered"}">${items}</${tag}></div>`;
  }
  if (block.type === "highlight") {
    const { title, body } = splitHighlightCopy(block.text);
    return `<div class="c-page34__module c-page34__module--component"><div class="c-page34__highlight"><section class="c-highlights__card c-highlights__card--text"><div class="c-highlights__header"><p class="c-highlights__title c-highlights__title--lg">${escapeHtml(title)}</p><div class="c-highlights__avatars" aria-hidden="true"><img class="c-highlights__avatar c-highlights__avatar--1" src="Highlights/assets/mp0vb7ii-zkfw26w.png" alt="" /><img class="c-highlights__avatar c-highlights__avatar--2" src="Highlights/assets/mp0vb7ii-1p6j43z.png" alt="" /><img class="c-highlights__avatar c-highlights__avatar--3" src="Highlights/assets/mp0vb7ii-2b2wygh.png" alt="" /><img class="c-highlights__avatar c-highlights__avatar--4" src="Highlights/assets/mp0vb7ii-whm3614.png" alt="" /><img class="c-highlights__avatar c-highlights__avatar--5" src="Highlights/assets/mp0vb7ii-24frsta.png" alt="" /></div></div>${body ? `<div class="c-highlights__text c-highlights__text--wide"><p class="c-highlights__body">${escapeHtml(body)}</p></div>` : ""}</section></div></div>`;
  }
  if (block.type === "image") {
    if (block.src) {
      return `<div class="c-page34__module c-page34__module--component"><figure class="c-page34__image-block"><img class="c-page34__image" src="${escapeHtml(block.src)}" alt="" /></figure></div>`;
    }
    return `<div class="c-page34__module c-page34__module--component"><figure class="c-page34__image-block"><div class="c-page34__image-placeholder">Image</div></figure></div>`;
  }
  return "";
}

export async function renderTo34Pages({
  docBlocks,
  rawContent,
  title,
  outDir,
  pagePrefix = "34",
  mediaResolver,
}) {
  const normalized = Array.isArray(docBlocks) && docBlocks.length
    ? normalizeBlocks(docBlocks)
    : splitToParagraphs(rawContent).map((text) => ({ type: "p", text: enforceLarkBrand(text), html: escapeHtml(enforceLarkBrand(text)) }));
  const prepared = coalesceLists(groupCategoryBlocks(normalized.flatMap((block) => splitLongTextBlock(block))));
  const pages = paginateFlow(prepared);

  const root = process.cwd();
  const baseCssPath = path.join(root, "src", "styles", "base.css");
  const pageCssPath = path.join(root, "src", "components", "34", "page.css");
  const assetsSrcDir = path.join(root, "src", "components", "34", "assets");
  const highlightsCssPath = path.join(root, "src", "components", "Highlights", "highlights.css");
  const highlightsAssetsSrcDir = path.join(root, "src", "components", "Highlights", "assets");
  const categoryCssPath = path.join(root, "src", "components", "Category", "category.css");

  const exportDir = outDir;
  const assetsOutDir = path.join(exportDir, pagePrefix, "assets");
  const highlightsAssetsOutDir = path.join(exportDir, "Highlights", "assets");

  await fs.rm(exportDir, { recursive: true, force: true });
  await fs.mkdir(exportDir, { recursive: true });
  await fs.mkdir(assetsOutDir, { recursive: true });
  await fs.mkdir(highlightsAssetsOutDir, { recursive: true });

  const [baseCss, pageCss, highlightsCss, categoryCss] = await Promise.all([
    fs.readFile(baseCssPath, "utf8"),
    fs.readFile(pageCssPath, "utf8"),
    fs.readFile(highlightsCssPath, "utf8"),
    fs.readFile(categoryCssPath, "utf8"),
  ]);

  await fs.writeFile(
    path.join(exportDir, "styles.css"),
    [baseCss, pageCss, highlightsCss, categoryCss].join("\n\n"),
    "utf8",
  );

  const assetFiles = await fs.readdir(assetsSrcDir);
  await Promise.all(
    assetFiles.map(async (name) => {
      await fs.copyFile(path.join(assetsSrcDir, name), path.join(assetsOutDir, name));
    }),
  );
  const highlightAssetFiles = await fs.readdir(highlightsAssetsSrcDir);
  await Promise.all(
    highlightAssetFiles.map(async (name) => {
      await fs.copyFile(
        path.join(highlightsAssetsSrcDir, name),
        path.join(highlightsAssetsOutDir, name),
      );
    }),
  );

  const mediaAssetCache = new Map();
  const files = [];
  let currentChapterIndex = 1;
  let currentChapterLabel = "Chapter 1";
  let currentChapterTitle = "";
  for (let i = 0; i < pages.length; i++) {
    const nn = String(i + 1).padStart(2, "0");
    const blocksForPage = await Promise.all(
      pages[i].map(async (block) => {
        if (block.type !== "image") return block;
        const src = await ensureImageAsset({
          token: block.token,
          exportDir,
          mediaResolver,
          mediaAssetCache,
        });
        return { ...block, src };
      }),
    );
    const headingForFooter = blocksForPage.find((block) => block.type === "h1");
    if (headingForFooter) {
      const meta = getFooterMetaFromHeading(headingForFooter.text, currentChapterIndex);
      currentChapterIndex = meta.chapterIndex + 1;
      currentChapterLabel = meta.chapterLabel;
      currentChapterTitle = meta.chapterTitle;
    }
    const modulesHtml = blocksForPage.map((block) => renderBlockHtml(block)).join("");
    const footerHtml = `<footer class="c-page34__footer"><div class="c-page34__footer-copy"><p class="c-page34__footer-chapter">${escapeHtml(
      currentChapterLabel,
    )}</p><p class="c-page34__footer-title">${escapeHtml(
      currentChapterTitle,
    )}</p></div><p class="c-page34__page-number">${nn}</p></footer>`;

    const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} - ${nn}</title>
    <link rel="stylesheet" href="styles.css" />
    <style>
      @page { size: 650px 842px; margin: 0; }
      html, body { width: 650px; height: 842px; margin: 0; padding: 0; }
    </style>
  </head>
  <body>
    <article class="c-page34">
      <div class="c-page34__content">
        ${modulesHtml}
      </div>
      ${footerHtml}
    </article>
  </body>
</html>
`;
    const outName = `${pagePrefix}-${nn}.html`;
    await fs.writeFile(path.join(exportDir, outName), html, "utf8");
    files.push(outName);
  }

  const index = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Feishu Export</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; padding: 24px; }
      a { color: #2563eb; text-decoration: none; }
      a:hover { text-decoration: underline; }
    </style>
  </head>
  <body>
    <div style="font-size: 20px; font-weight: 700; margin: 0 0 12px;">Feishu Export</div>
    <p>Each link is a single-page HTML (one <code>article</code>).</p>
    <ol>
      ${files.map((f) => `<li><a href="${f}">${f}</a></li>`).join("")}
    </ol>
  </body>
</html>
`;
  await fs.writeFile(path.join(exportDir, "index.html"), index, "utf8");

  return { pageCount: files.length, files };
}
