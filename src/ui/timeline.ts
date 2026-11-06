// The activity histogram and heatmap, drawn from the model's bins: shared by
// the dashboard and the Activity view so both read the same hour the same way.

import { AREA_WORD, bins, heatmap as heatRows, type EventView } from '../model/activity.js';
import { columns, compact, heatmap, STATUS } from './charts.js';
import { clock } from './parts.js';

const NORMAL = 'var(--chart-1)';

export const EVENT_LEGEND = [
    { label: 'Normal', colour: NORMAL },
    { label: 'Warning', colour: STATUS.warn },
];

function xLabels(start: number, size: number, n: number): { at: number; text: string }[] {
    const every = Math.max(1, Math.round(n / 6));
    const out: { at: number; text: string }[] = [];
    for (let i = 0; i < n; i += every) out.push({ at: i, text: clock(start + i * size) });
    return out;
}

export function eventColumns(list: EventView[], now: number, minutes: number, n: number, filter?: (e: EventView) => boolean, height = 150): HTMLElement {
    const window = minutes * 60_000;
    const b = bins(list, now, window, n, filter);
    return columns(
        b.map((x) => ({
            parts: [
                { label: 'Normal', value: x.normal, colour: NORMAL },
                { label: 'Warning', value: x.warning, colour: STATUS.warn },
            ],
            tip: [`${clock(x.start)} – ${clock(x.end)}`, `${compact(x.warning)} warning${x.warning === 1 ? '' : 's'}`, `${compact(x.normal)} normal`],
        })),
        { height, xLabels: xLabels(now - window, window / n, n), legend: EVENT_LEGEND },
    );
}

export function eventHeatmap(list: EventView[], now: number, minutes: number, n: number): HTMLElement {
    const window = minutes * 60_000;
    const rows = heatRows(list, now, window, n);
    return heatmap(
        rows.map((r) => ({
            label: AREA_WORD[r.area],
            cells: r.cells.map((c) => ({ value: c.normal + c.warning, flag: c.warning, tip: [AREA_WORD[r.area], `${clock(c.start)} – ${clock(c.end)}`, `${compact(c.normal + c.warning)} events, ${compact(c.warning)} warnings`] })),
        })),
        { xLabels: xLabels(now - window, window / n, n) },
    );
}
