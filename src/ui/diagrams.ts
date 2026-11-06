// The two diagrams: the package dependency graph, and the flow from an API
// through its Compositions to the function pipeline each one runs.

import type { APIView, CompositionView, StepView } from '../model/apis.js';
import type { DependencyGraph, GraphNode } from '../model/packages.js';
import type { Tone } from '../model/tone.js';
import { el, svgEl } from './dom.js';
import { clickable, dot, open, pill, tip } from './parts.js';

/** Package types keep one categorical colour each, everywhere. */
export const TYPE_COLOUR: Record<string, string> = {
    Configuration: 'var(--chart-1)',
    Provider: 'var(--chart-2)',
    Function: 'var(--chart-3)',
};

const TYPE_LETTER: Record<string, string> = { Configuration: 'C', Provider: 'P', Function: 'F' };

function clip(text: string, max: number): string {
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// ----- the dependency graph ------------------------------------------------------------

const NODE_W = 216;
const NODE_H = 50;
const COL_GAP = 84;
const ROW_GAP = 14;
const PAD = 8;

/**
 * Packages in columns by depth -- what nothing depends on at the left, each
 * dependency one column right of the deepest package that needs it -- with a
 * curve for every dependency the Lock records. A dependency nothing
 * satisfies is a dashed ghost on a dashed red edge. Hovering a package lights
 * up what it needs and what needs it; clicking opens it.
 */
export function dependencyGraph(graph: DependencyGraph): HTMLElement {
    const cols = new Map<number, GraphNode[]>();
    for (const n of graph.nodes) {
        const list = cols.get(n.depth) ?? [];
        list.push(n);
        cols.set(n.depth, list);
    }
    const order = ['Configuration', 'Provider', 'Function'];
    for (const list of cols.values()) list.sort((a, b) => order.indexOf(String(a.type)) - order.indexOf(String(b.type)) || a.label.localeCompare(b.label));
    const depths = [...cols.keys()].sort((a, b) => a - b);
    const pos = new Map<string, { x: number; y: number }>();
    let tallest = 0;
    depths.forEach((d, ci) => {
        const list = cols.get(d) ?? [];
        tallest = Math.max(tallest, list.length);
        list.forEach((n, ri) => pos.set(n.id, { x: PAD + ci * (NODE_W + COL_GAP), y: PAD + ri * (NODE_H + ROW_GAP) }));
    });
    const width = PAD * 2 + depths.length * NODE_W + Math.max(0, depths.length - 1) * COL_GAP;
    const height = PAD * 2 + tallest * NODE_H + Math.max(0, tallest - 1) * ROW_GAP;
    const drawing = svgEl('svg', { class: 'dep-graph', viewBox: `0 0 ${width} ${height}`, width, height, role: 'img', 'aria-label': 'Package dependency graph' });

    const edgeNodes: { from: string; to: string; node: SVGPathElement }[] = [];
    for (const e of graph.edges) {
        const a = pos.get(e.from);
        const b = pos.get(e.to);
        if (!a || !b) continue;
        const x1 = a.x + NODE_W;
        const y1 = a.y + NODE_H / 2;
        const x2 = b.x;
        const y2 = b.y + NODE_H / 2;
        const mx = (x1 + x2) / 2;
        const path = svgEl('path', { d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2 - 4},${y2}`, class: e.missing ? 'dep-edge missing' : 'dep-edge' });
        tip(path, [`${graph.nodes.find((n) => n.id === e.from)?.label ?? ''} → ${graph.nodes.find((n) => n.id === e.to)?.label ?? ''}`, e.constraints ? `needs ${e.constraints}` : 'any version', ...(e.missing ? ['not installed'] : [])]);
        drawing.append(path, svgEl('circle', { cx: x2 - 3, cy: y2, r: 3, class: e.missing ? 'dep-end missing' : 'dep-end' }));
        edgeNodes.push({ from: e.from, to: e.to, node: path });
    }

    const groups = new Map<string, SVGGElement>();
    for (const n of graph.nodes) {
        const p = pos.get(n.id);
        if (!p) continue;
        const g = svgEl('g', { class: `dep-node tone-${n.tone || 'none'}${n.missing ? ' missing' : ''}`, transform: `translate(${p.x},${p.y})` });
        g.append(svgEl('rect', { width: NODE_W, height: NODE_H, rx: 8, class: 'dep-box' }));
        const badge = svgEl('rect', { x: 8, y: 13, width: 24, height: 24, rx: 6, class: 'dep-badge' });
        badge.style.fill = TYPE_COLOUR[String(n.type)] ?? 'var(--text-faint)';
        g.append(badge, svgEl('text', { x: 20, y: 29.5, class: 'dep-letter', 'text-anchor': 'middle' }, TYPE_LETTER[String(n.type)] ?? '?'));
        g.append(svgEl('text', { x: 42, y: 22, class: 'dep-name' }, clip(n.label, 22)));
        g.append(svgEl('text', { x: 42, y: 38, class: 'dep-sub' }, clip(n.missing ? 'not installed' : [n.type, n.version].filter(Boolean).join(' · '), 30)));
        g.append(svgEl('circle', { cx: NODE_W - 12, cy: NODE_H / 2, r: 4, class: `dep-state fill-${n.tone || 'none'}` }));
        tip(g, [n.label, n.source || String(n.type), n.missing ? 'Not installed: a package depends on it' : `${n.type}${n.version ? ` ${n.version}` : ''}`, ...(n.pkg?.trouble?.message ? [clip(n.pkg.trouble.message, 140)] : [])]);
        const pkg = n.pkg;
        if (pkg) clickable(g, () => open(pkg.ref));
        groups.set(n.id, g);
        drawing.append(g);
    }

    // Hover: light the package, its edges and its neighbours; dim the rest.
    for (const [id, g] of groups) {
        g.addEventListener('mouseenter', () => {
            const near = new Set([id]);
            for (const e of edgeNodes) {
                if (e.from === id) near.add(e.to);
                if (e.to === id) near.add(e.from);
            }
            drawing.classList.add('focus');
            for (const [other, og] of groups) og.classList.toggle('near', near.has(other));
            for (const e of edgeNodes) e.node.classList.toggle('near', e.from === id || e.to === id);
        });
        g.addEventListener('mouseleave', () => drawing.classList.remove('focus'));
    }

    const legendRow = el(
        'div',
        { class: 'dep-legend' },
        ...['Configuration', 'Provider', 'Function'].map((t) => {
            const sw = el('span', { class: 'dep-legend-badge' }, TYPE_LETTER[t] ?? '');
            sw.style.background = TYPE_COLOUR[t] ?? '';
            return el('span', { class: 'dep-legend-item' }, sw, `${t}s`);
        }),
        el('span', { class: 'dep-legend-item' }, el('span', { class: 'dep-legend-edge' }), 'depends on'),
        el('span', { class: 'dep-legend-item' }, el('span', { class: 'dep-legend-edge missing' }), 'missing'),
    );
    return el('div', { class: 'dep-wrap' }, el('div', { class: 'scroll-x' }, drawing), legendRow);
}

// ----- the composition flow -------------------------------------------------------------

function arrow(): HTMLElement {
    return el('span', { class: 'flow-arrow', 'aria-hidden': 'true' });
}

function stepChip(s: StepView, index: number): HTMLElement {
    const chip = el(
        'div',
        { class: `flow-step tone-edge-${s.tone || 'none'}` },
        el('span', { class: 'flow-step-n' }, String(index + 1)),
        el('div', { class: 'flow-step-body' }, el('div', { class: 'flow-step-name' }, s.step), el('div', { class: 'flow-step-fn' }, dot(s.tone), s.functionName || 'no function')),
    );
    tip(chip, [`Step ${index + 1}: ${s.step}`, `Function ${s.functionName}${s.fn ? ` (${s.fn.active?.version || s.fn.src.version || 'installed'})` : ' — not installed'}`, ...(s.input ? [`Input ${s.input}`] : []), ...(s.fn?.trouble?.message ? [clip(s.fn.trouble.message, 140)] : [])]);
    const fn = s.fn;
    if (fn) clickable(chip, () => open(fn.ref));
    return chip;
}

/** One Composition and its pipeline, left to right: Composition → step → step → composed resources. */
export function pipelineRow(c: CompositionView): HTMLElement {
    const head = el(
        'div',
        { class: `flow-comp tone-edge-${c.tone || 'none'}` },
        el('div', { class: 'flow-comp-name' }, c.name),
        el('div', { class: 'flow-comp-sub' }, c.isDefault ? pill('default', 'info') : null, c.legacy ? pill('Resources mode', 'warn') : null, c.revisions ? el('span', { class: 'faint' }, `rev ${c.latestRevision}`) : null),
    );
    tip(head, [c.name, `for ${c.kind} (${c.apiVersion})`, c.legacy ? 'legacy Resources mode' : `${c.steps.length} pipeline step${c.steps.length === 1 ? '' : 's'}`, ...(c.revisions ? [`${c.revisions} revision${c.revisions === 1 ? '' : 's'}`] : [])]);
    clickable(head, () => open(c.ref));
    const row = el('div', { class: 'flow-pipe' }, head);
    if (c.legacy) row.append(arrow(), el('div', { class: 'flow-note' }, 'patch-and-transform resources (not run by Crossplane v2)'));
    c.steps.forEach((s, i) => row.append(arrow(), stepChip(s, i)));
    if (!c.legacy) row.append(arrow(), el('div', { class: 'flow-end' }, c.steps.length ? 'composed resources' : 'nothing'));
    return row;
}

/** An API on the left, each Composition serving it as one pipeline row to its right. */
export function apiFlow(a: APIView): HTMLElement {
    const scopeTone: Tone = a.scope === 'LegacyCluster' ? 'warn' : '';
    const card = el(
        'div',
        { class: `flow-api tone-edge-${a.tone || 'none'}` },
        el('div', { class: 'flow-api-kind' }, a.kind),
        el('div', { class: 'flow-api-group mono' }, a.group),
        el('div', { class: 'flow-api-tags' }, pill(a.scope, scopeTone), a.referenceable ? pill(a.referenceable) : null, a.claimKind ? pill(`claim ${a.claimKind}`, 'info') : null, a.established === false ? pill('not established', 'error') : null),
    );
    tip(card, [a.kind, a.name, `${a.scope} · ${a.versions.map((v) => v.name).join(', ')}`, `${a.compositions.length} Composition${a.compositions.length === 1 ? '' : 's'}`]);
    clickable(card, () => open(a.ref));
    const rows = el('div', { class: 'flow-rows' });
    if (a.compositions.length === 0) rows.append(el('div', { class: 'flow-pipe' }, el('div', { class: 'flow-missing' }, 'No Composition serves this API')));
    for (const c of a.compositions) rows.append(pipelineRow(c));
    return el('div', { class: 'flow' }, card, el('span', { class: 'flow-fork', 'aria-hidden': 'true' }), rows);
}
