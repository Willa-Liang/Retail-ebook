# retail-ebook

把 Markdown 渲染成 HTML/CSS Ebook，并在渲染过程中把 `[[组件标签]]` 替换成组件 HTML。

## Quick Start

```bash
npm i
npm run render -- --in example.md --out dist/book.html
```

## 组件标签（当前版本）

- 行内短标签：`[[Callout:info]]`
- 也兼容：`[[Callout/Info]]`（会当作 `Callout:Info`）
- 暂不支持带子内容的块级标签（后续可以加 `[[Callout]]...[[/Callout]]`）

## 组件注册表

组件注册表在 `src/components/registry.json`。

Key 建议使用和 Figma 一致的命名：

- `Callout/Info`
- `Button/Primary`

