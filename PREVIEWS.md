# Previews

This file keeps handy preview locations for this ebook project.

## Start Local Server (Recommended)

Run in project root:

```bash
cd dist
python3 -m http.server 8000
```

Then open:

- http://127.0.0.1:8000/book.html
- http://127.0.0.1:8000/pages-34.html
- http://127.0.0.1:8000/export/index.html
- http://127.0.0.1:8000/feishu/<doc-slug>/index.html

## Output Files (No Server)

You can also open these directly from disk:

- `dist/book.html`
- `dist/pages-34.html`
- `dist/export/index.html`

## Feishu Wiki -> Pages (PoC)

```bash
cp .env.example .env
# fill FEISHU_APP_ID / FEISHU_APP_SECRET
npm run feishu:render -- --url "<wiki_url>"
```

Output:

- `dist/feishu/<doc-slug>/index.html`

Notes:

- This flow requires Wiki read scopes (e.g. `wiki:node:read` / `wiki:wiki:readonly`) and docx read scope.
- Besides scopes, the app must be added as a collaborator in the target Wiki/doc.
