import fs from 'fs/promises';
import path from 'path';

async function buildViewer() {
  const dir = 'dist/feishu/retail-ebook';
  const files = await fs.readdir(dir);
  const pageFiles = files.filter(f => f.match(/^34-\d+\.html$/)).sort();

  let allArticles = '';

  for (const file of pageFiles) {
    const content = await fs.readFile(path.join(dir, file), 'utf-8');
    // Extract everything between <body> and </body>
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
      /* Ensure the article takes up the full container */
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

  await fs.writeFile(path.join(dir, 'viewer.html'), viewerHtml, 'utf-8');
  console.log('Viewer created at', path.join(dir, 'viewer.html'));
}

buildViewer().catch(console.error);
