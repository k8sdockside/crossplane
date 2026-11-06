// Activity: what Crossplane did, over time and by area.
//
//   Filters        range, area, warnings only, a search -- one row, above
//                  every chart, and every chart follows them
//   The timeline   a stacked histogram of events, normal and warning
//   The heatmap    areas by time, shaded by how busy, marked where it warned
//   Breakdowns     events by area, reasons, the busiest objects
//   The events     newest first, each opening its object

import { AREA_WORD, AREAS, byReason, occurrences, type Area, type EventView } from '../model/activity.js';
import type { Model } from '../model/crossplane.js';
import { plural } from '../model/tone.js';
import { bars, compact, donut, series, STATUS } from '../ui/charts.js';
import { byId, el, replace } from '../ui/dom.js';
import { every, fingerprint, notInstalled, read, remember, start } from '../ui/page.js';
import { age, block, clickable, code, dot, heading, nothing, open, tip } from '../ui/parts.js';
import { eventColumns, eventHeatmap } from '../ui/timeline.js';
import { chartCard, RANGES, segmented } from '../ui/widgets.js';

const REFRESH = 15_000;

interface Filters {
    range: string;
    area: Area | 'all';
    warnings: boolean;
    search: string;
}

/** Areas keep one categorical colour each, in a fixed order. */
const AREA_COLOUR: Record<Area, string> = Object.fromEntries(AREAS.map((a, i) => [a, series(i)])) as Record<Area, string>;

start('page', async (ctx) => {
    const head = byId('head');
    const body = byId('body');
    const failure = el('p', { class: 'refresh-failure' });
    replace(head, heading('activity', 'Activity', `Every event Crossplane, its providers and functions recorded in ${ctx.contextName}.`));
    const f: Filters = { range: '1 hour', area: 'all', warnings: false, search: '', ...((await remember.get<Filters>('activity.filters')) ?? {}) };
    let current: Model | null = null;
    let last = '';
    const draw = () => {
        if (!current) return;
        replace(body, failure, ...page(current, f, () => {
            void remember.set('activity.filters', f);
            draw();
        }));
    };
    const stop = every(
        REFRESH,
        async () => {
            const { installed, m } = await read();
            failure.textContent = '';
            document.getElementById('first')?.remove();
            const print = fingerprint([installed, m.events, Math.floor(Date.now() / 30_000)]);
            if (print === last) return;
            last = print;
            current = m;
            if (!installed) {
                replace(body, failure, notInstalled(ctx));
                return;
            }
            // Do not redraw under someone typing in the search box.
            if (document.activeElement?.classList.contains('search')) return;
            draw();
        },
        (err) => {
            failure.textContent = err instanceof Error ? err.message : String(err);
        },
    );
    addEventListener('pagehide', stop);
});

function page(m: Model, f: Filters, changed: () => void): (Node | null)[] {
    const now = Date.now();
    const range = RANGES.find((r) => r.label === f.range) ?? RANGES[1] ?? { label: '1 hour', minutes: 60, bins: 30 };
    const window = range.minutes * 60_000;
    const q = f.search.trim().toLowerCase();
    const inArea = (e: EventView) => f.area === 'all' || e.area === f.area;
    const matches = (e: EventView) => inArea(e) && (!f.warnings || e.warning) && (!q || `${e.reason} ${e.message} ${e.object.kind} ${e.object.name} ${e.object.namespace} ${e.provider}`.toLowerCase().includes(q));
    const inWindow = (e: EventView) => e.last >= now - window;
    const shown = m.events.filter((e) => matches(e) && inWindow(e));

    const search = el('input', { type: 'search', class: 'search', placeholder: 'Search reason, message, object', value: f.search, 'aria-label': 'Search events', spellcheck: 'false' });
    search.addEventListener('input', () => {
        f.search = search.value;
        changed();
        requestAnimationFrame(() => {
            const again = document.querySelector<HTMLInputElement>('input.search');
            again?.focus();
            again?.setSelectionRange(again.value.length, again.value.length);
        });
    });
    const warnOnly = el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: f.warnings }), ' warnings only');
    warnOnly.querySelector('input')?.addEventListener('change', (e) => {
        f.warnings = (e.target as HTMLInputElement).checked;
        changed();
    });
    const present = AREAS.filter((a) => m.events.some((e) => e.area === a));
    const filters = el(
        'div',
        { class: 'filters sticky' },
        segmented(RANGES.map((r) => ({ id: r.label, label: r.label })), range.label, (id) => {
            f.range = id;
            changed();
        }, 'Time range'),
        segmented<Area | 'all'>([{ id: 'all', label: 'Everything' }, ...present.map((a) => ({ id: a, label: AREA_WORD[a] }))], f.area, (id) => {
            f.area = id;
            changed();
        }, 'Area'),
        warnOnly,
        search,
    );

    const occ = occurrences(m.events, now, window, matches);
    const note = el('p', { class: 'note' }, `${compact(occ.normal + occ.warning)} occurrences in the last ${range.label} — ${compact(occ.warning)} warnings — over ${plural(shown.length, 'event')}. A repeating event is spread over the time between its first and last occurrence. The API server keeps events for about an hour unless it was told otherwise.`);

    if (m.events.length === 0) return [filters, block('Nothing recorded', '', nothing('No Crossplane events in the cluster right now. The API server keeps events for about an hour, so a quiet control plane has none.'))];

    const areaParts = present.map((a) => ({ label: AREA_WORD[a], value: m.events.filter((e) => e.area === a && matches(e) && inWindow(e)).reduce((n, e) => n + e.count, 0), colour: AREA_COLOUR[a] }));
    const reasons = byReason(shown, () => true).slice(0, 8);
    const objects = new Map<string, { label: string; sub: string; warn: number; normal: number; e: EventView }>();
    for (const e of shown) {
        const key = `${e.object.kind}/${e.object.namespace}/${e.object.name}`;
        const row = objects.get(key) ?? { label: e.object.name, sub: e.object.kind, warn: 0, normal: 0, e };
        if (e.warning) row.warn += e.count;
        else row.normal += e.count;
        objects.set(key, row);
    }
    const busiest = [...objects.values()].sort((a, b) => b.warn + b.normal - (a.warn + a.normal)).slice(0, 8);

    return [
        filters,
        block('Over time', '', note, eventColumns(m.events, now, range.minutes, range.bins, matches, 210)),
        f.area === 'all' ? block('By area, over time', 'Each row an area of Crossplane, each column a slice of the range, darker where it was busier. A red mark is a slice with warnings.', eventHeatmap(m.events.filter(matches), now, range.minutes, range.bins)) : null,
        el(
            'div',
            { class: 'cards-3' },
            chartCard('By area', 'Occurrences in the range, by what they are about.', areaParts.some((p) => p.value) ? donut(areaParts, { value: compact(areaParts.reduce((n, p) => n + p.value, 0)), label: 'occurrences' }, { title: 'Events by area' }) : nothing('Nothing in this range.')),
            chartCard('Reasons', 'The reason each event gives, most first.', reasons.length ? bars(reasons.map((r) => ({ label: r.reason, sub: plural(r.objects, 'object'), parts: [{ label: 'Occurrences', value: r.count, colour: 'var(--chart-1)' }] }))) : nothing('Nothing in this range.')),
            chartCard(
                'Busiest objects',
                'The objects with the most events in the range.',
                busiest.length
                    ? bars(
                          busiest.map((o) => ({
                              label: o.label,
                              sub: o.sub,
                              parts: [
                                  { label: 'Normal', value: o.normal, colour: 'var(--chart-1)' },
                                  { label: 'Warning', value: o.warn, colour: STATUS.warn },
                              ],
                              onPick: o.e.appKind ? () => open({ kind: o.e.appKind, namespace: o.e.object.namespace || undefined, name: o.e.object.name }) : undefined,
                          })),
                          { legend: [{ label: 'Normal', colour: 'var(--chart-1)' }, { label: 'Warning', colour: STATUS.warn }] },
                      )
                    : nothing('Nothing in this range.'),
            ),
        ),
        list(shown),
    ];
}

function list(shown: EventView[]): HTMLElement {
    if (shown.length === 0) return block('Events', '', nothing('No event matches these filters.'));
    const rows = el('ul', { class: 'events' });
    for (const e of shown.slice(0, 200)) {
        const swatch = el('span', { class: 'swatch', 'aria-hidden': 'true' });
        swatch.style.background = AREA_COLOUR[e.area];
        const row = el(
            'li',
            { class: e.warning ? 'event warning' : 'event' },
            dot(e.warning ? 'warn' : 'ok'),
            el('div', { class: 'event-main' }, el('div', { class: 'event-head' }, code(e.reason || 'no reason'), el('span', { class: 'event-object' }, `${e.object.kind} ${e.object.namespace ? `${e.object.namespace}/` : ''}${e.object.name}`), e.count > 1 ? el('span', { class: 'pill pill-none' }, `×${compact(e.count)}`) : null), el('div', { class: 'event-msg' }, e.message)),
            el('div', { class: 'event-side' }, el('span', { class: 'event-area' }, swatch, AREA_WORD[e.area]), el('span', { class: 'faint' }, `${age(e.last)} ago`)),
        );
        tip(row, [`${e.warning ? 'Warning' : 'Normal'}: ${e.reason}`, `${e.object.apiVersion} ${e.object.kind}`, e.count > 1 ? `${e.count} times, first ${age(e.first)} ago` : `${age(e.last)} ago`]);
        if (e.appKind) clickable(row, () => open({ kind: e.appKind, namespace: e.object.namespace || undefined, name: e.object.name }));
        rows.append(row);
    }
    return block('Events', shown.length > 200 ? `The newest 200 of ${shown.length}.` : `${plural(shown.length, 'event')}, newest first.`, rows);
}
