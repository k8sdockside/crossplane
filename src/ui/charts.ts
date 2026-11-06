// The charts: a ring, bars, a column histogram, a heatmap, a treemap, a
// meter, a segmented bar and a sparkline. Plain HTML and SVG, no library --
// the page cannot load one from the network anyway.
//
// The rules they keep (the same in every one):
//   - colours are the app's tokens: --chart-1..8 for identity, in a fixed
//     order assigned by entity (see `palette`), and --ok, --warn, --error for
//     state only; nothing here names a colour of its own;
//   - text never wears a data colour: a swatch beside it carries identity;
//   - every mark has a tooltip with its numbers, and every chart with more
//     than one series has a legend that also lists them -- the numbers are
//     never only readable off an axis or by colour;
//   - thin marks, a 2px gap between touching ones, rounded data-ends,
//     square at the baseline, recessive hairline gridlines.

import { el, svgEl } from './dom.js';
import { clickable, tip } from './parts.js';

export interface Part {
    label: string;
    value: number;
    /** A CSS colour: a token, `var(--chart-2)`. */
    colour: string;
    /** Extra tooltip lines. */
    note?: string[];
    onPick?: () => void;
}

/** The categorical colour of the i-th series. A ninth folds into the eighth. */
export function series(i: number): string {
    return `var(--chart-${Math.min(8, Math.max(1, i + 1))})`;
}

/**
 * Colours for a set of entities, assigned by the entity rather than its rank:
 * names sorted once, so a filter that drops one does not repaint the rest.
 * Past seven, the rest share the eighth, as "other".
 */
export function palette(names: string[]): (name: string) => string {
    const sorted = [...new Set(names)].sort();
    const index = new Map(sorted.map((n, i) => [n, i]));
    return (name) => series(Math.min(7, index.get(name) ?? 7));
}

export const STATUS = {
    ok: 'var(--ok)',
    warn: 'var(--warn)',
    error: 'var(--error)',
    none: 'var(--text-faint)',
    idle: 'var(--border)',
};

export function share(part: number, total: number): string {
    if (!total) return '0%';
    const p = (part / total) * 100;
    return p >= 10 || p === 0 || Number.isInteger(p) ? `${Math.round(p)}%` : `${p.toFixed(1)}%`;
}

/** 1,284 / 12.9K -- the way a figure is written. */
export function compact(n: number): string {
    if (Math.abs(n) < 10_000) return Math.round(n).toLocaleString('en-US');
    if (Math.abs(n) < 1_000_000) return `${(n / 1000).toFixed(n < 100_000 ? 1 : 0).replace(/\.0$/, '')}K`;
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

/** Round numbers for an axis that reaches `max`: 0, 5, 10 rather than 0, 4.3, 8.6. */
export function niceMax(max: number): { top: number; step: number } {
    if (max <= 0) return { top: 1, step: 1 };
    const rough = max / 4;
    const mag = 10 ** Math.floor(Math.log10(rough));
    const norm = rough / mag;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
    const nice = Math.max(1, step < 1 ? 1 : step);
    return { top: Math.ceil(max / nice) * nice, step: nice };
}

// ----- the legend ---------------------------------------------------------------------

export function legend(items: { label: string; colour: string; value?: string }[], className = ''): HTMLElement {
    return el(
        'ul',
        { class: `legend ${className}`.trim() },
        ...items.map((i) => {
            const sw = el('span', { class: 'swatch', 'aria-hidden': 'true' });
            sw.style.background = i.colour;
            return el('li', {}, sw, el('span', { class: 'legend-label' }, i.label), i.value !== undefined ? el('span', { class: 'legend-value' }, i.value) : null);
        }),
    );
}

// ----- the ring -----------------------------------------------------------------------

/**
 * A ring of shares with the total (or any figure) in the middle, and a legend
 * beside it that lists every part with its count and share -- the ring is the
 * picture, the legend the table.
 */
export function donut(parts: Part[], centre: { value: string; label: string }, opts: { size?: number; thickness?: number; title?: string; legend?: boolean } = {}): HTMLElement {
    const size = opts.size ?? 148;
    const thick = opts.thickness ?? 16;
    const r = (size - thick) / 2;
    const c = 2 * Math.PI * r;
    const mid = size / 2;
    const total = parts.reduce((n, p) => n + Math.max(0, p.value), 0);
    const drawn = parts.filter((p) => p.value > 0);
    const gap = drawn.length > 1 ? 2 : 0;

    const ring = svgEl('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: 'donut-svg', role: 'img', 'aria-label': opts.title ?? centre.label });
    ring.append(svgEl('circle', { cx: mid, cy: mid, r, class: 'donut-track', 'stroke-width': thick }));
    let offset = 0;
    const arcs: { part: Part; node: SVGCircleElement }[] = [];
    for (const p of drawn) {
        const length = (p.value / total) * c;
        const arc = svgEl('circle', {
            cx: mid,
            cy: mid,
            r,
            class: 'donut-arc',
            'stroke-width': thick,
            'stroke-dasharray': `${Math.max(0.5, length - gap)} ${c}`,
            'stroke-dashoffset': String(-offset),
            transform: `rotate(-90 ${mid} ${mid})`,
        });
        arc.style.stroke = p.colour;
        tip(arc, () => [p.label, `${compact(p.value)} · ${share(p.value, total)}`, ...(p.note ?? [])]);
        if (p.onPick) clickable(arc, p.onPick);
        ring.append(arc);
        arcs.push({ part: p, node: arc });
        offset += length;
    }
    const centreNode = el('div', { class: 'donut-centre' }, el('div', { class: 'donut-value' }, centre.value), el('div', { class: 'donut-label' }, centre.label));
    const wrap = el('div', { class: 'donut-ring' }, ring, centreNode);
    wrap.style.width = wrap.style.height = `${size}px`;
    if (opts.legend === false) return el('div', { class: 'donut' }, wrap);

    const list = el('ul', { class: 'legend legend-table' });
    for (const p of parts) {
        const sw = el('span', { class: 'swatch', 'aria-hidden': 'true' });
        sw.style.background = p.colour;
        const row = el('li', { class: p.value === 0 ? 'zero' : undefined }, sw, el('span', { class: 'legend-label' }, p.label), el('span', { class: 'legend-value' }, compact(p.value)), el('span', { class: 'legend-share' }, share(p.value, total)));
        const arc = arcs.find((a) => a.part === p)?.node;
        if (arc) {
            row.addEventListener('mouseenter', () => arc.classList.add('lit'));
            row.addEventListener('mouseleave', () => arc.classList.remove('lit'));
        }
        if (p.onPick) clickable(row, p.onPick);
        list.append(row);
    }
    return el('div', { class: 'donut' }, wrap, list);
}

// ----- horizontal bars ----------------------------------------------------------------

export interface BarRow {
    label: string;
    sub?: string;
    parts: Part[];
    onPick?: () => void;
}

/**
 * One bar per row, growing from a shared baseline on the left, its parts
 * stacked with a 2px gap and the total written at the tip. The scale is the
 * largest row, so the longest bar fills the track.
 */
export function bars(rows: BarRow[], opts: { max?: number; unit?: (n: number) => string; legend?: { label: string; colour: string }[] } = {}): HTMLElement {
    const fmt = opts.unit ?? compact;
    const max = opts.max ?? Math.max(1, ...rows.map((r) => r.parts.reduce((n, p) => n + p.value, 0)));
    const list = el('div', { class: 'bars' });
    for (const r of rows) {
        const total = r.parts.reduce((n, p) => n + p.value, 0);
        const track = el('div', { class: 'bar-track' });
        const fill = el('div', { class: 'bar-fill' });
        fill.style.width = `${(total / max) * 100}%`;
        for (const p of r.parts) {
            if (p.value <= 0) continue;
            const seg = el('div', { class: 'bar-seg' });
            seg.style.flexGrow = String(p.value);
            seg.style.background = p.colour;
            tip(seg, () => [r.label, `${p.label}: ${fmt(p.value)}${r.parts.length > 1 ? ` of ${fmt(total)}` : ''}`, ...(p.note ?? [])]);
            fill.append(seg);
        }
        track.append(fill);
        const row = el('div', { class: 'bar-row' }, el('div', { class: 'bar-label', title: r.label }, el('span', { class: 'bar-name' }, r.label), r.sub ? el('span', { class: 'bar-sub' }, r.sub) : null), track, el('div', { class: 'bar-value' }, fmt(total)));
        if (r.onPick) clickable(row, r.onPick);
        list.append(row);
    }
    return el('div', { class: 'bars-chart' }, list, opts.legend && opts.legend.length > 1 ? legend(opts.legend) : null);
}

// ----- the column histogram -----------------------------------------------------------

export interface Column {
    parts: Part[];
    tip: string[];
}

/**
 * Columns over time (or any ordered bins) from a zero baseline, stacked, with
 * round y ticks on recessive gridlines and a handful of x labels. Hover a
 * column for its numbers; the column's hit target is the whole slot, not just
 * its ink.
 */
export function columns(cols: Column[], opts: { height?: number; xLabels?: { at: number; text: string }[]; legend?: { label: string; colour: string }[]; unit?: string } = {}): HTMLElement {
    const height = opts.height ?? 150;
    const max = Math.max(0, ...cols.map((c) => c.parts.reduce((n, p) => n + p.value, 0)));
    const { top, step } = niceMax(max);
    const plot = el('div', { class: 'cols-plot' });
    plot.style.height = `${height}px`;
    const grid = el('div', { class: 'cols-grid', 'aria-hidden': 'true' });
    for (let v = 0; v <= top + 1e-9; v += step) {
        const line = el('div', { class: v === 0 ? 'cols-line base' : 'cols-line' }, el('span', { class: 'cols-tick' }, compact(v)));
        line.style.bottom = `${(v / top) * 100}%`;
        grid.append(line);
    }
    const area = el('div', { class: 'cols-area' });
    cols.forEach((c) => {
        const slot = el('div', { class: 'col-slot', tabindex: '0' });
        const stack = el('div', { class: 'col-stack' });
        const total = c.parts.reduce((n, p) => n + p.value, 0);
        stack.style.height = `${(total / top) * 100}%`;
        // Bottom part first in the data, drawn last-on-top by column-reverse.
        for (const p of c.parts) {
            if (p.value <= 0) continue;
            const seg = el('div', { class: 'col-seg' });
            seg.style.flexGrow = String(p.value);
            seg.style.background = p.colour;
            stack.append(seg);
        }
        slot.append(stack);
        tip(slot, c.tip);
        area.append(slot);
    });
    plot.append(grid, area);
    const xs = el('div', { class: 'cols-x', 'aria-hidden': 'true' });
    for (const x of opts.xLabels ?? []) {
        const label = el('span', {}, x.text);
        label.style.left = `${(x.at / Math.max(1, cols.length)) * 100}%`;
        xs.append(label);
    }
    return el('div', { class: 'cols-chart' }, plot, xs, opts.legend && opts.legend.length > 1 ? legend(opts.legend) : null);
}

// ----- the heatmap --------------------------------------------------------------------

export interface HeatRow {
    label: string;
    cells: { value: number; flag: number; tip: string[] }[];
}

/**
 * Rows by columns, each cell shaded by its value on one hue, light to dark
 * (a sequential scale: magnitude, not identity). A cell that also holds
 * warnings carries a small mark in the warning colour, so the two readings --
 * how busy, and whether anything went wrong -- never share one channel.
 */
export function heatmap(rows: HeatRow[], opts: { xLabels?: { at: number; text: string }[] } = {}): HTMLElement {
    const max = Math.max(1, ...rows.flatMap((r) => r.cells.map((c) => c.value)));
    const n = Math.max(1, ...rows.map((r) => r.cells.length));
    const grid = el('div', { class: 'heat' });
    grid.style.gridTemplateColumns = `minmax(110px, max-content) repeat(${n}, minmax(6px, 1fr))`;
    for (const r of rows) {
        grid.append(el('div', { class: 'heat-label' }, r.label));
        for (const c of r.cells) {
            const cell = el('div', { class: c.value ? 'heat-cell' : 'heat-cell empty', tabindex: '0' });
            if (c.value) {
                // 18% to 100% of the hue, by the square root so a quiet row is still visible next to a loud one.
                const pct = Math.round(18 + 82 * Math.sqrt(c.value / max));
                cell.style.setProperty('--heat', `${pct}%`);
            }
            if (c.flag) cell.append(el('span', { class: 'heat-flag', 'aria-hidden': 'true' }));
            tip(cell, c.tip);
            grid.append(cell);
        }
    }
    const xs = el('div', { class: 'heat-x', 'aria-hidden': 'true' });
    for (const x of opts.xLabels ?? []) {
        const label = el('span', {}, x.text);
        label.style.left = `${(x.at / n) * 100}%`;
        xs.append(label);
    }
    const scale = el('div', { class: 'heat-scale' }, el('span', {}, 'fewer'), el('span', { class: 'heat-ramp', 'aria-hidden': 'true' }), el('span', {}, 'more'), el('span', { class: 'heat-flag inline', 'aria-hidden': 'true' }), el('span', {}, 'has warnings'));
    return el('div', { class: 'heat-chart' }, grid, el('div', { class: 'heat-x-row' }, el('div', {}), xs), scale);
}

// ----- the treemap --------------------------------------------------------------------

export interface TreeItem {
    label: string;
    value: number;
    colour: string;
    sub?: string;
    tip: string[];
    onPick?: () => void;
    /** Drawn faint: an inactive kind, say. */
    faint?: boolean;
    /** Items with the same group share one region, laid out together. */
    group?: string;
}

interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** Squarified treemap layout (Bruls, Huizing, van Wijk), in a box of `w` by `h`. */
export function squarify(values: number[], box: Rect): Rect[] {
    const out: Rect[] = new Array(values.length);
    const total = values.reduce((a, b) => a + b, 0);
    if (!total) return values.map(() => ({ x: box.x, y: box.y, w: 0, h: 0 }));
    const scale = (box.w * box.h) / total;
    const order = values.map((v, i) => ({ i, a: v * scale })).sort((a, b) => b.a - a.a);
    let rect = { ...box };
    let row: { i: number; a: number }[] = [];
    const worstRatio = (r: { a: number }[], side: number) => {
        const sum = r.reduce((n, x) => n + x.a, 0);
        const max = Math.max(...r.map((x) => x.a));
        const min = Math.min(...r.map((x) => x.a));
        return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
    };
    const layRow = (r: { i: number; a: number }[]) => {
        const sum = r.reduce((n, x) => n + x.a, 0);
        if (rect.w >= rect.h) {
            const w = sum / rect.h;
            let y = rect.y;
            for (const x of r) {
                const h = x.a / w;
                out[x.i] = { x: rect.x, y, w, h };
                y += h;
            }
            rect = { x: rect.x + w, y: rect.y, w: rect.w - w, h: rect.h };
        } else {
            const h = sum / rect.w;
            let x0 = rect.x;
            for (const x of r) {
                const w = x.a / h;
                out[x.i] = { x: x0, y: rect.y, w, h };
                x0 += w;
            }
            rect = { x: rect.x, y: rect.y + h, w: rect.w, h: rect.h - h };
        }
    };
    for (const item of order) {
        if (item.a <= 0) {
            out[item.i] = { x: rect.x, y: rect.y, w: 0, h: 0 };
            continue;
        }
        const side = Math.min(rect.w, rect.h);
        if (row.length === 0 || worstRatio([...row, item], side) <= worstRatio(row, side)) row.push(item);
        else {
            layRow(row);
            row = [item];
        }
    }
    if (row.length) layRow(row);
    return out;
}

/** Areas proportional to value, laid out to be as square as they can be. */
export function treemap(items: TreeItem[], opts: { height?: number } = {}): HTMLElement {
    const height = opts.height ?? 260;
    const box = el('div', { class: 'tree' });
    box.style.height = `${height}px`;
    // Laid out in a 1000 x (1000 * height/width-ish) space; percentages make it fluid.
    const W = 1000;
    const H = 1000 * (height / 720);
    // Two levels: one region per group, sized by its total, then the group's
    // own items inside it -- so a provider's active and inactive kinds sit
    // side by side rather than wherever their sizes happen to sort them.
    const groups = [...new Set(items.map((i) => i.group ?? i.label))];
    const outer = squarify(
        groups.map((g) => items.filter((i) => (i.group ?? i.label) === g).reduce((n, i) => n + i.value, 0)),
        { x: 0, y: 0, w: W, h: H },
    );
    const rects: (Rect | undefined)[] = new Array(items.length);
    groups.forEach((g, gi) => {
        const box = outer[gi];
        if (!box) return;
        const idx = items.map((it, i) => ((it.group ?? it.label) === g ? i : -1)).filter((i) => i >= 0);
        const inner = squarify(
            idx.map((i) => items[i]?.value ?? 0),
            box,
        );
        idx.forEach((i, k) => (rects[i] = inner[k]));
    });
    items.forEach((item, idx) => {
        const r = rects[idx];
        if (!r || r.w <= 0 || r.h <= 0) return;
        const cell = el('div', { class: item.faint ? 'tree-cell faint' : 'tree-cell', tabindex: '0' });
        cell.style.left = `${(r.x / W) * 100}%`;
        cell.style.top = `${(r.y / H) * 100}%`;
        cell.style.width = `${(r.w / W) * 100}%`;
        cell.style.height = `${(r.h / H) * 100}%`;
        // A tint of the series with its full colour as an edge: the label stays
        // in the theme's own ink, legible on every hue in both themes.
        const fill = el('div', { class: 'tree-fill' });
        fill.style.borderLeftColor = item.colour;
        fill.style.setProperty('--tint', item.colour);
        fill.append(el('span', { class: 'tree-label' }, item.label));
        if (item.sub) fill.append(el('span', { class: 'tree-sub' }, item.sub));
        cell.append(fill);
        tip(cell, item.tip);
        if (item.onPick) clickable(cell, item.onPick);
        box.append(cell);
    });
    return box;
}

// ----- figures --------------------------------------------------------------------------

/** One whole split into parts: a thin bar with rounded ends and no text. */
export function segbar(parts: Part[], className = ''): HTMLElement {
    const total = parts.reduce((n, p) => n + p.value, 0);
    const bar = el('div', { class: `segbar ${className}`.trim(), role: 'img', 'aria-label': parts.map((p) => `${p.label} ${p.value}`).join(', ') });
    if (!total) bar.classList.add('empty');
    for (const p of parts) {
        if (p.value <= 0) continue;
        const seg = el('span', { class: 'segbar-part' });
        seg.style.flexGrow = String(p.value);
        seg.style.background = p.colour;
        tip(seg, [p.label, `${p.value} · ${share(p.value, total)}`]);
        bar.append(seg);
    }
    return bar;
}

/** A small column sparkline: the shape of the last hour, for a tile. */
export function sparkColumns(values: { normal: number; warning: number }[]): HTMLElement {
    const max = Math.max(1, ...values.map((v) => v.normal + v.warning));
    const wrap = el('div', { class: 'spark', 'aria-hidden': 'true' });
    for (const v of values) {
        const col = el('span', { class: 'spark-col' });
        const total = v.normal + v.warning;
        col.style.height = `${Math.max(total ? 8 : 0, (total / max) * 100)}%`;
        if (v.warning) {
            const w = el('span', { class: 'spark-warn' });
            w.style.height = `${(v.warning / total) * 100}%`;
            col.append(w);
        }
        wrap.append(col);
    }
    return wrap;
}

/**
 * The dashboard's hero: a share as a large figure inside a ring that fills to
 * it, the fill coloured by severity.
 */
export function gauge(value: number, tone: 'ok' | 'warn' | 'error', label: string, size = 176): HTMLElement {
    const thick = 14;
    const r = (size - thick) / 2;
    const c = 2 * Math.PI * r;
    const mid = size / 2;
    const ring = svgEl('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: 'gauge-svg', role: 'img', 'aria-label': `${label}: ${Math.round(value * 100)}%` });
    ring.append(svgEl('circle', { cx: mid, cy: mid, r, class: `gauge-track gauge-track-${tone}`, 'stroke-width': thick }));
    const arc = svgEl('circle', { cx: mid, cy: mid, r, class: `gauge-arc gauge-${tone}`, 'stroke-width': thick, 'stroke-dasharray': `${Math.max(0.01, value) * c} ${c}`, transform: `rotate(-90 ${mid} ${mid})` });
    ring.append(arc);
    const wrap = el('div', { class: 'gauge' }, ring, el('div', { class: 'gauge-centre' }, el('div', { class: 'gauge-value' }, `${Math.round(value * 100)}%`), el('div', { class: 'gauge-label' }, label)));
    wrap.style.width = wrap.style.height = `${size}px`;
    return wrap;
}
