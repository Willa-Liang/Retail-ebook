export function parseWikiNodeTokenFromUrl(inputUrl) {
  let u;
  try {
    u = new URL(inputUrl);
  } catch {
    throw new Error(`Invalid URL: ${inputUrl}`);
  }

  // Common patterns:
  // - https://{tenant}.feishu.cn/wiki/{node_token}
  // - https://{tenant}.feishu.cn/wiki/{node_token}?from=...
  // - Sometimes additional path segments exist after token.
  const m = u.pathname.match(/\/wiki\/([^\/?#]+)/i);
  if (!m) {
    throw new Error(`Not a wiki URL: ${inputUrl}`);
  }
  return m[1];
}

export function safeSlug(s) {
  const x = String(s ?? "").trim() || "doc";
  return x
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

