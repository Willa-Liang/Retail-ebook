const DEFAULT_OPEN_API_BASE = "https://open.feishu.cn";

function baseOf(apiBase) {
  return apiBase || process.env.FEISHU_OPEN_API_BASE || DEFAULT_OPEN_API_BASE;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function getTenantAccessToken({ apiBase, appId, appSecret }) {
  const url = `${baseOf(apiBase)}/open-apis/auth/v3/tenant_access_token/internal`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const data = await res.json();
  if (!res.ok || data?.code) {
    throw new Error(
      `Failed to get tenant_access_token: http=${res.status} code=${data?.code} msg=${data?.msg ?? ""}`,
    );
  }
  return data?.tenant_access_token;
}

export async function getWikiNode({ apiBase, tenantAccessToken, nodeToken }) {
  // Endpoint (documented by multiple SDKs/wrappers):
  // GET /open-apis/wiki/v2/spaces/get_node?token=<nodeToken>
  const url = `${baseOf(apiBase)}/open-apis/wiki/v2/spaces/get_node?token=${encodeURIComponent(
    nodeToken,
  )}`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${tenantAccessToken}` },
  });
  const data = await res.json();
  if (!res.ok || data?.code) {
    throw new Error(
      `Failed to get wiki node: http=${res.status} code=${data?.code} msg=${data?.msg ?? ""}`,
    );
  }
  return data?.data?.node;
}

export async function getDocxRawContent({ apiBase, tenantAccessToken, documentId }) {
  // Docs: docx/v1/document/raw_content
  const url = `${baseOf(apiBase)}/open-apis/docx/v1/documents/${encodeURIComponent(
    documentId,
  )}/raw_content`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${tenantAccessToken}` },
  });
  const data = await res.json();
  if (!res.ok || data?.code) {
    throw new Error(
      `Failed to get docx raw_content: http=${res.status} code=${data?.code} msg=${data?.msg ?? ""}`,
    );
  }
  return data?.data?.content ?? "";
}

export async function listDocxBlockChildren({
  apiBase,
  tenantAccessToken,
  documentId,
  blockId = documentId,
  pageSize = 500,
  pageToken,
}) {
  const url = new URL(
    `${baseOf(apiBase)}/open-apis/docx/v1/documents/${encodeURIComponent(
      documentId,
    )}/blocks/${encodeURIComponent(blockId)}/children`,
  );
  url.searchParams.set("page_size", String(pageSize));
  if (pageToken) url.searchParams.set("page_token", pageToken);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${tenantAccessToken}` },
    });
    const data = await res.json();
    if (res.ok && !data?.code) {
      return data?.data ?? { items: [], has_more: false };
    }
    if (data?.code === 99991400 && attempt < 2) {
      await sleep(500 * (attempt + 1));
      continue;
    }
    throw new Error(
      `Failed to list docx block children: http=${res.status} code=${data?.code} msg=${data?.msg ?? ""}`,
    );
  }
  return { items: [], has_more: false };
}

export async function getAllTopLevelDocxBlocks({ apiBase, tenantAccessToken, documentId }) {
  const items = [];
  let pageToken;
  while (true) {
    const data = await listDocxBlockChildren({
      apiBase,
      tenantAccessToken,
      documentId,
      blockId: documentId,
      pageToken,
    });
    items.push(...(data?.items ?? []));
    if (!data?.has_more) break;
    pageToken = data?.page_token;
    if (!pageToken) break;
  }
  return items;
}

export async function getMediaTmpDownloadUrl({
  apiBase,
  tenantAccessToken,
  fileToken,
}) {
  const url = new URL(`${baseOf(apiBase)}/open-apis/drive/v1/medias/batch_get_tmp_download_url`);
  url.searchParams.append("file_tokens", fileToken);

  const res = await fetch(url, {
    headers: { authorization: `Bearer ${tenantAccessToken}` },
  });
  const data = await res.json();
  if (!res.ok || data?.code) {
    throw new Error(
      `Failed to get media tmp download url: http=${res.status} code=${data?.code} msg=${data?.msg ?? ""}`,
    );
  }

  const item = data?.data?.tmp_download_urls?.[0];
  return item?.tmp_download_url || "";
}
