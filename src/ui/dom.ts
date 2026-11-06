// DOM helpers. The SDK's, plus one for SVG.
//
// The rule they exist to enforce: cluster data goes on the page as text,
// never as HTML. Nothing in this plugin sets innerHTML -- the charts and
// diagrams are built element by element, and every name, reason and message
// from the cluster lands in a text node.

export { button, byId, el, replace } from '@k8sdockside/plugin-sdk/dom';

type SvgAttrs = Record<string, string | number | undefined>;

/** An SVG element, with attributes. SVG needs its own namespace. */
export function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: SvgAttrs = {}, ...children: (Node | string | null | undefined | false)[]): SVGElementTagNameMap[K] {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [name, value] of Object.entries(attrs)) if (value !== undefined) node.setAttribute(name, String(value));
    for (const child of children) {
        if (child === null || child === undefined || child === false) continue;
        node.append(child);
    }
    return node;
}
