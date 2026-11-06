// Composite pieces several pages share: the stat tile, the chart card, the
// time range picker, and the colour rules for package state.

import type { PackageState, PackageView } from '../model/packages.js';
import { STATE_WORD } from '../model/packages.js';
import type { Tone } from '../model/tone.js';
import { compact, segbar, STATUS, type Part } from './charts.js';
import { el } from './dom.js';
import { clickable } from './parts.js';

export const STATE_COLOUR: Record<PackageState, string> = {
    healthy: STATUS.ok,
    installing: STATUS.warn,
    unhealthy: STATUS.error,
    waiting: STATUS.none,
};

const STATES: PackageState[] = ['healthy', 'installing', 'unhealthy', 'waiting'];

/** Package counts by state, as chart parts: always the same four, in the same order. */
export function stateParts(list: PackageView[], onPick?: (s: PackageState) => void): Part[] {
    return STATES.map((s) => ({ label: STATE_WORD[s], value: list.filter((p) => p.state === s).length, colour: STATE_COLOUR[s], onPick: onPick ? () => onPick(s) : undefined }));
}

/**
 * A stat tile: a label, the figure, a thin bar of its parts, and the parts in
 * words -- so the bar is never the only place the split is written.
 */
export function tile(opts: { label: string; value: number | string; tone?: Tone; parts?: Part[]; note?: string; extra?: Node | null; onPick?: () => void }): HTMLElement {
    const parts = (opts.parts ?? []).filter((p) => p.value > 0);
    const node = el(
        'div',
        { class: `tile tone-edge-${opts.tone || 'none'}` },
        el('div', { class: 'tile-label' }, opts.label),
        el('div', { class: 'tile-value' }, typeof opts.value === 'number' ? compact(opts.value) : opts.value),
        opts.extra ?? null,
        opts.parts ? segbar(opts.parts) : null,
        parts.length
            ? el(
                  'div',
                  { class: 'tile-parts' },
                  ...parts.map((p) => {
                      const sw = el('span', { class: 'swatch small', 'aria-hidden': 'true' });
                      sw.style.background = p.colour;
                      return el('span', { class: 'tile-part' }, sw, el('strong', {}, compact(p.value)), ` ${p.label.toLowerCase()}`);
                  }),
              )
            : null,
        opts.note ? el('div', { class: 'tile-note' }, opts.note) : null,
    );
    if (opts.onPick) clickable(node, opts.onPick);
    return node;
}

/** A card holding one chart: a title, a sentence, the chart, and a link onward. */
export function chartCard(title: string, note: string, chart: Node, foot: Node | null = null, className = ''): HTMLElement {
    return el('article', { class: `chart-card ${className}`.trim() }, el('h3', {}, title), note ? el('p', { class: 'note small' }, note) : null, chart, foot ? el('div', { class: 'card-foot' }, foot) : null);
}

export interface Range {
    label: string;
    minutes: number;
    bins: number;
}

export const RANGES: Range[] = [
    { label: '15 min', minutes: 15, bins: 30 },
    { label: '1 hour', minutes: 60, bins: 30 },
    { label: '6 hours', minutes: 360, bins: 36 },
    { label: '24 hours', minutes: 1440, bins: 48 },
];

/** A row of buttons, one pressed: the range of the activity charts. */
export function segmented<T extends string>(options: { id: T; label: string }[], current: T, onPick: (id: T) => void, label: string): HTMLElement {
    const group = el('div', { class: 'segmented', role: 'group', 'aria-label': label });
    for (const o of options) {
        const b = el('button', { type: 'button', class: o.id === current ? 'seg here' : 'seg', 'aria-pressed': o.id === current ? 'true' : 'false' }, o.label);
        b.addEventListener('click', () => onPick(o.id));
        group.append(b);
    }
    return group;
}
