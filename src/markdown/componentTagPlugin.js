import { normalizeTagInnerToKey } from "../lib/componentRegistry.js";
import Token from "markdown-it/lib/token.mjs";

/**
 * markdown-it plugin:
 * - Scans text tokens for [[...]] occurrences
 * - Replaces matches with html_inline tokens rendered from the component registry
 * - Leaves code fences / inline code untouched (they are separate token types)
 */
export function componentTagPlugin(md, { registry, cssCollector }) {
  const pattern = /\[\[([^\]]+)\]\]/g;

  md.core.ruler.after("inline", "component-tags", function replace(state) {
    const env = state.env ?? {};
    // Provide async materialization via env cache since markdown-it core is sync.
    // We pre-materialize in the render pipeline and store in env.
    const cache = env.__componentCache;
    if (!cache) return;

    for (const token of state.tokens) {
      if (token.type !== "inline") continue;
      const children = token.children ?? [];

      const out = [];
      for (const child of children) {
        // Skip code spans.
        if (child.type !== "text") {
          out.push(child);
          continue;
        }

        const text = child.content;
        let lastIndex = 0;
        let m;
        while ((m = pattern.exec(text)) !== null) {
          const start = m.index;
          const end = m.index + m[0].length;
          const inner = m[1];

          if (start > lastIndex) {
            const t = new Token("text", "", 0);
            t.content = text.slice(lastIndex, start);
            out.push(t);
          }

          const key = normalizeTagInnerToKey(inner);
          const cached = cache.get(key);
          if (!cached) {
            // If unknown, keep original text so author can spot it.
            const t = new Token("text", "", 0);
            t.content = m[0];
            out.push(t);
          } else {
            if (cached.css) cssCollector.add(cached.css);
            const h = new Token("html_inline", "", 0);
            h.content = cached.html;
            out.push(h);
          }

          lastIndex = end;
        }

        if (lastIndex < text.length) {
          const t = new Token("text", "", 0);
          t.content = text.slice(lastIndex);
          out.push(t);
        }
      }

      token.children = out;
    }
  });
}
