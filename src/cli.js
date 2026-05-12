import fs from "node:fs/promises";
import path from "node:path";
import minimist from "minimist";
import { renderEbook } from "./render.js";

async function main() {
  const argv = minimist(process.argv.slice(2));
  const cmd = argv._[0];

  if (cmd !== "render") {
    printHelp();
    process.exit(1);
  }

  const inputPath = argv.in || argv.i;
  const outHtmlPath = argv.out || argv.o || "dist/book.html";
  const title = argv.title || "Ebook";

  if (!inputPath) {
    console.error("Missing --in <file.md>");
    printHelp();
    process.exit(1);
  }

  // Co-locate CSS with the HTML output so relative link works.
  const outDir = path.dirname(outHtmlPath);
  const outCssPath = path.join(outDir, "styles.css");

  await assertFileExists(inputPath);

  await renderEbook({
    inputPath,
    outHtmlPath,
    outCssPath,
    title,
  });

  console.log(`Wrote ${outHtmlPath}`);
  console.log(`Wrote ${outCssPath}`);
}

function printHelp() {
  console.log(
    [
      "Usage:",
      "  npm run render -- --in <input.md> [--out dist/book.html] [--title 'My Book']",
      "",
      "Example:",
      "  npm run render -- --in example.md --out dist/book.html --title 'Retail Ebook'",
    ].join("\n"),
  );
}

async function assertFileExists(p) {
  try {
    await fs.stat(p);
  } catch {
    throw new Error(`File not found: ${p}`);
  }
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});

