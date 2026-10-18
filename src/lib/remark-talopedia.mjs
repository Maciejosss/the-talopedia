import { CUSTOM, custom } from './inline.mjs';


/**
 * Turns [[wikilinks]], :icon[slug], :flag[slug], :up and :down into HTML.
 * Only visits text nodes, so code blocks and inline code are left alone.
 */
export default function remarkTalopedia() {
  return (tree) => { numbering(tree); walk(tree); };
}

/**
 * A numbered list written under <!-- numbering: 1.1 --> is numbered by outline, 1.1 and
 * 1.2.1, rather than 1, a, i. Markdown has no way to say so, so the editor writes the
 * note and this turns it into a class on the list, dropping the note.
 */
const NOTE = /^<!--\s*numbering:\s*1\.1\s*-->$/;
function numbering(node) {
  if (!node.children) return;
  for (let i = node.children.length - 1; i >= 0; i--) {
    const n = node.children[i], next = node.children[i + 1];
    if (n.type === 'html' && NOTE.test(n.value.trim()) && next?.type === 'list' && next.ordered) {
      next.data = { ...next.data, hProperties: { ...next.data?.hProperties, className: ['num-outline'] } };
      node.children.splice(i, 1);
    } else numbering(n);
  }
}

function walk(node, parent, index) {
  if (node.type === 'text' && parent && CUSTOM.test(node.value)) {
    CUSTOM.lastIndex = 0;
    const parts = [];
    let last = 0, m;
    while ((m = CUSTOM.exec(node.value))) {
      if (m.index > last) parts.push({ type: 'text', value: node.value.slice(last, m.index) });
      parts.push({ type: 'html', value: custom(m, true) });
      last = m.index + m[0].length;
    }
    if (last < node.value.length) parts.push({ type: 'text', value: node.value.slice(last) });
    parent.children.splice(index, 1, ...parts);
    return;
  }
  if (!node.children) return;
  for (let i = node.children.length - 1; i >= 0; i--) walk(node.children[i], node, i);
}
