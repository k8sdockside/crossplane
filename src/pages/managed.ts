// Managed resources: every kind the providers bring, and which are failing.
//
// The plugin cannot list managed resources themselves -- a manifest names its
// kinds ahead, and providers bring hundreds -- so it maps them from their
// definitions (MRDs and CRDs) and sees their health through the Events the
// providers record on them. Each active kind opens as a table in the app.
//
//   Tiles          kinds, active, inactive, failing objects this hour
//   The map        a treemap of every provider's managed API surface
//   Two charts     activation, and warnings by kind
//   Failing        each managed resource that reported a warning this hour
//   The kinds      every kind, searchable, grouped by provider

import { byReason, failing, occurrences } from '../model/activity.js';
import type { MRKind } from '../model/apis.js';
import type { Model } from '../model/crossplane.js';
import { fixFor, verbFor } from '../model/problems.js';
import { plural } from '../model/tone.js';
import { bars, compact, donut, palette, STATUS, treemap } from '../ui/charts.js';
import { byId, el, replace } from '../ui/dom.js';
import { every, fingerprint, notInstalled, read, start } from '../ui/page.js';
import { age, block, blockWith, clickable, code, dot, heading, nothing, open, pill, tip } from '../ui/parts.js';
import { chartCard, tile } from '../ui/widgets.js';

const REFRESH = 20_000;
const HOUR = 60 * 60_000;

start('page', async (ctx) => {
    const head = byId('head');
    const body = byId('body');
    const failure = el('p', { class: 'refresh-failure' });
    replace(head, heading('managed', 'Managed resources', `Every managed resource kind the providers in ${ctx.contextName} bring, and which resources are failing.`));
    let last = '';
    let search = '';
    let current: Model | null = null;
    const kindsHost = el('div');
    const drawKinds = () => {
        if (current) replace(kindsHost, kinds(current, search, (s) => {
            search = s;
            drawKinds();
        }));
    };
    const stop = every(
        REFRESH,
        async () => {
            const { installed, m } = await read();
            failure.textContent = '';
            document.getElementById('first')?.remove();
            const now = Date.now();
            const print = fingerprint([installed, m.kinds, m.events.filter((e) => e.area === 'managed'), Math.floor(now / 60_000)]);
            if (print === last) return;
            last = print;
            current = m;
            if (!installed) {
                replace(body, failure, notInstalled(ctx));
                return;
            }
            drawKinds();
            replace(body, failure, tiles(m, now), map(m), charts(m), failingTable(m), kindsHost);
        },
        (err) => {
            failure.textContent = err instanceof Error ? err.message : String(err);
        },
    );
    addEventListener('pagehide', stop);
});

const managed = (e: { area: string }) => e.area === 'managed';

function tiles(m: Model, now: number): HTMLElement {
    const active = m.kinds.filter((k) => k.state === 'Active').length;
    const fails = failing(m.events, managed);
    const occ = occurrences(m.events, now, HOUR, managed);
    const providers = m.perProvider.filter((r) => r.active + r.inactive > 0).length;
    return el(
        'div',
        { class: 'tiles' },
        tile({ label: 'Managed kinds', value: m.kinds.length, note: `from ${plural(providers, 'provider')}` }),
        tile({
            label: 'Active',
            value: active,
            tone: 'ok',
            parts: [
                { label: 'Active', value: active, colour: 'var(--chart-1)' },
                { label: 'Inactive', value: m.kinds.length - active, colour: STATUS.idle },
            ],
            note: 'Their CRDs exist; objects can be created.',
        }),
        tile({ label: 'Inactive', value: m.kinds.length - active, note: m.snap.served['mrds'] ? 'Defined by an MRD, not activated.' : 'This Crossplane has no MRDs (v1).' }),
        tile({ label: 'Failing resources', value: fails.length, tone: fails.length ? 'error' : 'ok', note: 'with a warning in the last hour' }),
        tile({ label: 'Provider events', value: occ.normal + occ.warning, tone: occ.warning ? 'warn' : '', parts: [{ label: 'Normal', value: occ.normal, colour: 'var(--chart-1)' }, { label: 'Warning', value: occ.warning, colour: STATUS.warn }], note: 'on managed resources, last hour' }),
    );
}

function map(m: Model): HTMLElement {
    if (m.kinds.length === 0) return block('The managed API surface', '', nothing('No managed resource kinds. They arrive with a Provider: each one defines the kinds of external resource it can manage.'));
    const colourOf = palette(m.perProvider.map((r) => r.provider));
    const warnByProvider = new Map<string, number>();
    for (const f of failing(m.events, managed)) warnByProvider.set(f.provider, (warnByProvider.get(f.provider) ?? 0) + 1);
    const items = m.perProvider.flatMap((r) => {
        const out = [];
        const w = warnByProvider.get(r.provider) ?? 0;
        if (r.active) out.push({ group: r.provider, label: r.provider, value: r.active, colour: colourOf(r.provider), sub: `${compact(r.active)} active${w ? ` · ${w} failing` : ''}`, tip: [r.provider, `${r.active} active kinds`, `${r.inactive} inactive`, ...(w ? [`${plural(w, 'resource')} failing this hour`] : [])], onPick: () => openKinds(r.provider) });
        if (r.inactive) out.push({ group: r.provider, label: r.provider, value: r.inactive, colour: colourOf(r.provider), sub: `${compact(r.inactive)} inactive`, faint: true, tip: [r.provider, `${r.inactive} inactive kinds`, 'Defined, but no CRD until a ManagedResourceActivationPolicy activates them'], onPick: () => openKinds(r.provider) });
        return out;
    });
    return block('The managed API surface', 'Every managed resource kind, in a box per provider, sized by how many kinds it defines. Pale boxes are the inactive ones. Click one to list its kinds below.', treemap(items, { height: 280 }));
}

/** Scrolls to the kind list, filtered to one provider. */
function openKinds(provider: string): void {
    const input = document.querySelector<HTMLInputElement>('input.kind-search');
    if (!input) return;
    input.value = provider;
    input.dispatchEvent(new Event('input'));
    requestAnimationFrame(() => document.querySelector('.kind-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

function charts(m: Model): HTMLElement {
    const active = m.kinds.filter((k) => k.state === 'Active').length;
    const byKind = new Map<string, { label: string; provider: string; count: number; objects: Set<string> }>();
    for (const e of m.events) {
        if (!e.warning || e.area !== 'managed') continue;
        const key = `${e.object.group}/${e.object.kind}`;
        const row = byKind.get(key) ?? { label: e.object.kind, provider: e.provider, count: 0, objects: new Set<string>() };
        row.count += e.count;
        row.objects.add(`${e.object.namespace}/${e.object.name}`);
        byKind.set(key, row);
    }
    const colourOf = palette(m.perProvider.map((r) => r.provider));
    const kindRows = [...byKind.values()].sort((a, b) => b.count - a.count).slice(0, 8);
    const reasons = byReason(m.events, (e) => e.warning && e.area === 'managed');
    const reasonColour = palette(reasons.map((r) => r.reason));
    return el(
        'div',
        { class: 'cards-3' },
        chartCard(
            'Activation',
            'In Crossplane v2 a provider defines all its kinds, and only the activated ones get a CRD.',
            donut(
                [
                    { label: 'Active', value: active, colour: 'var(--chart-1)' },
                    { label: 'Inactive', value: m.kinds.length - active, colour: STATUS.idle },
                ],
                { value: m.kinds.length ? `${Math.round((active / m.kinds.length) * 100)}%` : '—', label: 'active' },
                { title: 'Managed kind activation' },
            ),
        ),
        chartCard('Warnings by kind', 'Which kinds of managed resource reported warnings this hour.', kindRows.length ? bars(kindRows.map((r) => ({ label: r.label, sub: `${plural(r.objects.size, 'object')} · ${r.provider}`, parts: [{ label: 'Warnings', value: r.count, colour: colourOf(r.provider) }] }))) : nothing('No managed resource reported a warning this hour.')),
        chartCard('Why they fail', 'The providers’ own reasons, by share of warnings.', reasons.length ? donut(reasons.slice(0, 7).map((r) => ({ label: r.reason, value: r.count, colour: reasonColour(r.reason), note: [verbFor(r.reason), plural(r.objects, 'object')] })), { value: compact(reasons.reduce((n, r) => n + r.count, 0)), label: 'warnings' }, { title: 'Warnings by reason' }) : nothing('Nothing failing.')),
    );
}

function failingTable(m: Model): HTMLElement {
    const list = failing(m.events, managed);
    if (list.length === 0) return block('Failing managed resources', '', nothing('None. No managed resource reported a warning in the last hour.'));
    const table = el('table', { class: 'table' }, el('thead', {}, el('tr', {}, el('th', {}, ''), el('th', {}, 'Resource'), el('th', {}, 'Kind'), el('th', {}, 'Provider'), el('th', {}, 'Reason'), el('th', { class: 'num' }, 'Times'), el('th', {}, 'Last'))));
    const tbody = el('tbody');
    for (const f of list) {
        const row = el(
            'tr',
            {},
            el('td', {}, dot('error')),
            el('td', {}, el('div', { class: 'cell-name' }, f.object.name), f.object.namespace ? el('div', { class: 'faint small' }, f.object.namespace) : null),
            el('td', {}, f.object.kind, el('div', { class: 'faint small mono' }, f.object.group)),
            el('td', {}, f.provider || '—'),
            el('td', {}, code(f.reason), el('div', { class: 'msg' }, f.message)),
            el('td', { class: 'num' }, compact(f.count)),
            el('td', {}, `${age(f.last)} ago`),
        );
        tip(row, [`${f.object.kind} ${f.object.name}`, `${f.reason}: ${verbFor(f.reason)}`, fixFor(f.reason)]);
        if (f.appKind) clickable(row, () => open({ kind: f.appKind, namespace: f.object.namespace || undefined, name: f.object.name }));
        tbody.append(row);
    }
    table.append(tbody);
    return block('Failing managed resources', 'Each managed resource that reported a warning in the last hour, with the provider’s own words. Click one to open it.', el('div', { class: 'scroll-x' }, table));
}

function kinds(m: Model, search: string, onSearch: (s: string) => void): HTMLElement {
    const input = el('input', { type: 'search', class: 'search kind-search', placeholder: 'Search kinds, groups, providers', value: search, 'aria-label': 'Search kinds', spellcheck: 'false' });
    input.addEventListener('input', () => {
        onSearch(input.value);
        requestAnimationFrame(() => {
            const again = document.querySelector<HTMLInputElement>('input.kind-search');
            again?.focus();
            again?.setSelectionRange(again.value.length, again.value.length);
        });
    });
    const q = search.trim().toLowerCase();
    const failingKinds = new Set(failing(m.events, managed).map((f) => `${f.object.group}/${f.object.kind}`));
    const shown = m.kinds.filter((k) => !q || `${k.kind} ${k.plural} ${k.group} ${k.provider}`.toLowerCase().includes(q));
    const groups = new Map<string, MRKind[]>();
    for (const k of shown) {
        const list = groups.get(k.provider || 'unknown provider') ?? [];
        list.push(k);
        groups.set(k.provider || 'unknown provider', list);
    }
    const out = el('div', { class: 'kind-list' });
    for (const [provider, list] of groups) {
        const chips = el('div', { class: 'kind-chips' });
        for (const k of list.sort((a, b) => Number(b.state === 'Active') - Number(a.state === 'Active') || a.kind.localeCompare(b.kind))) {
            const bad = failingKinds.has(`${k.group}/${k.kind}`);
            const chip = el('span', { class: `kind-chip${k.state === 'Inactive' ? ' inactive' : ''}${bad ? ' failing' : ''}` }, bad ? dot('error') : null, k.kind);
            tip(chip, [k.kind, k.key, k.state === 'Active' ? (k.served ? 'Active: click to list its objects' : 'Active') : 'Inactive: no CRD until activated', k.scope]);
            if (k.served) clickable(chip, () => open({ kind: k.appKind, name: '' }));
            chips.append(chip);
        }
        const act = list.filter((k) => k.state === 'Active').length;
        out.append(el('div', { class: 'kind-group' }, el('div', { class: 'kind-group-head' }, el('strong', {}, provider), el('span', { class: 'faint' }, `${act} active · ${list.length - act} inactive`), el('span', { class: 'spacer' }), ...[...new Set(list.map((k) => k.group))].slice(0, 3).map((g) => pill(g))), chips));
    }
    return blockWith('Every managed kind', 'Active kinds open as a table of their objects in the app. A red dot is a kind with a resource failing this hour.', input, shown.length ? out : nothing(m.kinds.length ? 'No kind matches.' : 'No managed resource kinds.'));
}
