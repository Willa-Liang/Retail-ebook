---
name: "ebook-html-layout"
description: "Generates an HTML/CSS ebook from Markdown and replaces [[Component]] tags with registered component HTML. Invoke when user wants ebook templating, Figma component sync, or md-to-ebook rendering."
---

# Ebook HTML Layout

## Goal

Render a Markdown document into a single HTML file + CSS, using a component registry.

- Author writes tags like `[[Callout:Info]]` or `[[Callout/Info]]` in md.
- Renderer replaces these tags with component HTML snippets from `src/components`.
- CSS is composed from `src/styles/base.css` + component CSS files referenced by `src/components/registry.json`.

## Project Conventions

- Component key: normalized to `Component/Variant` (same as typical Figma "Component/Variant" naming)
- Registry file: `src/components/registry.json`
- Component files:
  - HTML snippet: `src/components/<Component>/<Variant>.html`
  - CSS: `src/components/<Component>/*.css` (registry references exact files)

## Typography Rules

Use these typography rules as the default output standard for ebook layout unless the user explicitly overrides them:

- H1
  - font-size: `36px`
  - line-height: `42px`
  - letter-spacing: `-2%`
  - font-weight: `700`
- H2
  - font-size: `24px`
  - line-height: `32px`
  - letter-spacing: `-1%`
  - font-weight: `700`
- H3
  - font-size: `12px`
  - line-height: `18px`
  - letter-spacing: `-1%`
  - font-weight: `700`
- Body
  - font-size: `12px`
  - line-height: `18px`
  - letter-spacing: `-1%`
  - font-weight: `400`

When mapping content from Markdown, Figma, or Feishu docs:

- Treat top-level page titles as H1 only when the page template requires a visible page title.
- Treat document section headings as H2 by default.
- Use H3 for short emphasized subheads inside a section.
- Use Body for regular paragraphs, list items, and descriptive copy.

## Page Layout Rules

Use these page-level layout constraints as the default ebook page specification unless the user explicitly overrides them:

- Page size: `650 x 842px`
- Effective content area: `554 x 698px`
- Overflow rule: when content exceeds the effective content area, automatically continue on the next page
- Width rule: all modules inside the effective area should stretch to full available width
- Text module horizontal padding:
  - H1 module: `padding-left/right: 24px`
  - H2 module: `padding-left/right: 24px`
  - H3 module: `padding-left/right: 24px`
  - Body module: `padding-left/right: 24px`
- Other component modules:
  - no horizontal padding by default
  - use full effective width unless the component itself defines an internal layout

## Footer Rules

Use this footer structure as the default ebook page footer unless the user explicitly overrides it:

- Footer width: `554px`
- Footer placement: aligned to the page content width
- Footer layout: left content block + right page number
- Left content block:
  - first line: chapter label, e.g. `Chapter 1`
  - second line: chapter title, e.g. `Executive summary`
- Right content block:
  - page number, e.g. `03`

Footer typography:

- Chapter label
  - font-size: `10px`
  - line-height: `14px`
  - letter-spacing: `-0.08px`
  - color: placeholder gray
- Chapter title
  - font-size: `10px`
  - line-height: `14px`
  - letter-spacing: `-0.08px`
  - color: primary text
- Page number
  - font-size: `10px`
  - line-height: `14px`
  - letter-spacing: `-0.08px`
  - color: placeholder gray

## Spacing Rules

Use these spacing rules as the default vertical rhythm for ebook layout unless the user explicitly overrides them:

- Text-to-text spacing: `16px`
- When a component module appears in the content flow:
  - add `16px` extra space above the component
  - add `16px` extra space below the component

Interpretation notes:

- H1, H2, H3, and Body are text modules
- Highlights, Category, images, callouts, badges, and other registered components are component modules
- A component placed between text blocks should therefore create a larger visual separation than plain text-to-text flow
- Apply spacing in the vertical content flow only; do not change component internal spacing unless the component spec says so

When paginating:

- Measure content against the effective content area only (`554 x 698px`)
- Keep footer elements (such as logo and page number) outside the effective content flow
- Split pages based on module boundaries whenever possible
- If a section is too long, continue remaining modules on the next page instead of compressing typography
- Avoid starting a new page with a standalone component when possible
- If a component would otherwise appear alone at the top of the next page, move `1-2` preceding text modules to the next page with it
- Preserve content order while rebalancing pages; do not move later content ahead of earlier content

## Feishu Mapping Rules

When ingesting content from Feishu Docs, use the following mapping rules by default:

- Feishu `H1` -> Ebook `H1`
- Feishu `H2` -> Ebook `H2`
- Feishu `H3` -> Ebook `H3`
- Feishu paragraph text -> Ebook `Body`
- Feishu bold text -> `font-weight: 700`
- Feishu `Callout` -> `Highlights` component
- Feishu unordered list -> `category` component
  - status: not implemented yet
  - temporary fallback: render as Body or list text until the `category` component is available
- Feishu image block -> image module

Current implementation notes:

- H2 and paragraph/body mapping are already connected in the current Feishu rendering flow
- Bold paragraph emphasis can be used as a signal for highlight selection
- Callout-to-Highlights should be treated as the target default mapping standard
- Unordered-list-to-category is reserved for the next component implementation stage

## Render Command

```bash
npm i
npm run render -- --in <input.md> --out dist/book.html --title "My Ebook"
```

Output:

- `dist/book.html`
- `dist/styles.css` (linked by `book.html`)

## Adding A Component Manually

1. Add the HTML snippet file under `src/components/...`.
2. Add optional CSS file(s).
3. Register it in `src/components/registry.json` under the key `Component/Variant`.

## Syncing From Figma (Agent Workflow)

Prereq: user runs the local relay + opens the Figma plugin and joins the same channel.

Suggested flow:

1. Connect to Figma via MCP tools (`mcp_Vibma_connection`).
2. Identify target component set names and variant names.
3. Export each variant as `SVG_STRING` (or build HTML skeleton + CSS tokens).
4. Write:
   - `src/components/<Component>/<Variant>.html`
   - `src/components/<Component>/<component>.css`
   - update `src/components/registry.json`

Note: Exact export strategy depends on design system constraints (SVG vs semantic HTML).
