// The dashboard: is the control plane healthy, and if not, where not.
//
//   A verdict      one sentence and a health gauge, coloured by the worst thing
//   Seven tiles    providers, functions, configurations, APIs, compositions,
//                  managed kinds and the last hour's warnings
//   Three rings    package health, managed kinds by provider, API readiness
//   The last hour  every Crossplane event, as a histogram
//   Two bar charts managed APIs per provider, warnings by reason
//   Attention      the worst problems, each opening its object
//   Crossplane     its own pods and version, and the supporting objects
//
// Before any of that: whether the cluster serves Crossplane at all.

import { byReason, occurrences, bins } from '../model/activity.js';
import type { Model } from '../model/crossplane.js';
import { problems, tally, type Problem } from '../model/problems.js';
import { plural, worst, type Tone } from '../model/tone.js';
import { KIND } from '../model/types.js';
import { bars, compact, donut, gauge, palette, sparkColumns, STATUS } from '../ui/charts.js';
import { byId, el, replace } from '../ui/dom.js';
import { every, fingerprint, notInstalled, read, start } from '../ui/page.js';
import { action, block, clickable, dot, heading, linkButton, nothing, open, pill, tip } from '../ui/parts.js';
import { eventColumns } from '../ui/timeline.js';
import { chartCard, stateParts, tile } from '../ui/widgets.js';

const REFRESH = 20_000;
const HOUR = 60 * 60_000;

start('page', async (ctx) => {
    const head = byId('head');
    const body = byId('body');
    const failure = el('p', { class: 'refresh-failure' });
    let last = '';
    const note = `Packages, APIs, compositions and managed resources in ${ctx.contextName}.`;
    replace(head, heading('overview', 'Crossplane', note));

    const stop = every(
        REFRESH,
        async () => {
            const { installed, m } = await read();
            failure.textContent = '';
            document.getElementById('first')?.remove();
            const now = Date.now();
            const print = fingerprint([installed, m.snap, Math.floor(now / 60_000)]);
            if (print === last) return;
            last = print;
            const list = problems(m);
            replace(head, heading('overview', 'Crossplane', note, list.filter((p) => p.tone !== 'info').length));
            if (!installed) {
                replace(body, failure, notInstalled(ctx));
                return;
            }
            replace(body, failure, verdict(m, list), tiles(m, now), rings(m), lastHour(m, now), el('div', { class: 'columns' }, perProvider(m), reasons(m)), el('div', { class: 'columns' }, attention(list), crossplane(m)));
        },
        (err) => {
            failure.textContent = err instanceof Error ? err.message : String(err);
        },
    );
    addEventListener('pagehide', stop);
});

/** The share of things that are as they should be: packages, APIs and compositions. */
function health(m: Model): { score: number; good: number; total: number } {
    const items: Tone[] = [...m.packages.map((p) => p.tone), ...m.apis.apis.map((a) => a.tone), ...m.apis.compositions.map((c) => c.tone), ...m.core.pods.map((p) => (p.ready ? 'ok' : 'error') as Tone)];
    const good = items.filter((t) => t === 'ok' || t === 'info' || t === '').length;
    return { score: items.length ? good / items.length : 1, good, total: items.length };
}

function verdict(m: Model, list: Problem[]): HTMLElement {
    const t = tally(list);
    const h = health(m);
    const tone: 'ok' | 'warn' | 'error' = t.error ? 'error' : t.warn ? 'warn' : 'ok';
    const empty = m.packages.length === 0 && m.apis.apis.length === 0;
    const headline = empty ? 'Crossplane is running, with nothing installed yet' : t.error ? `${plural(t.error, 'error')} to fix${t.warn ? `, and ${plural(t.warn, 'warning')}` : ''}` : t.warn ? `Healthy, with ${plural(t.warn, 'thing')} to look at` : 'Every package is healthy and every API is served';
    const line = empty
        ? 'Install a Provider to manage cloud resources, or a Configuration that brings a whole platform.'
        : `${plural(m.providers.length, 'provider')}, ${plural(m.functions.length, 'function')} and ${plural(m.configurations.length, 'configuration')}; ${plural(m.apis.apis.length, 'API')} served by ${plural(m.apis.compositions.length, 'composition')}; ${compact(m.kinds.filter((k) => k.state === 'Active').length)} managed resource kinds active.`;
    const g = gauge(h.score, h.score >= 0.9 && !t.error ? 'ok' : h.score >= 0.7 ? 'warn' : 'error', 'healthy');
    tip(g, ['Control plane health', `${h.good} of ${h.total} packages, APIs, compositions and Crossplane pods are as they should be`]);
    return el(
        'div',
        { class: `verdict tone-edge-${tone}` },
        g,
        el(
            'div',
            { class: 'verdict-text' },
            el('div', { class: `verdict-head tone-${tone}` }, headline),
            el('div', { class: 'verdict-line' }, line),
            el('div', { class: 'verdict-tags' }, m.core.version ? pill(`Crossplane ${m.core.version}`, 'info') : null, pill(`${m.core.pods.filter((p) => p.ready).length}/${m.core.pods.length} core pods ready`, m.core.tone || 'warn'), t.error ? pill(plural(t.error, 'error'), 'error') : null, t.warn ? pill(plural(t.warn, 'warning'), 'warn') : null),
            el('div', { class: 'verdict-actions' }, action('Packages', () => void k8sdockside.openView('packages'), true), action('Compositions', () => void k8sdockside.openView('compositions')), action('Problems', () => void k8sdockside.openView('problems'))),
        ),
    );
}

function tiles(m: Model, now: number): HTMLElement {
    const occ = occurrences(m.events, now, HOUR);
    const spark = bins(m.events, now, HOUR, 20);
    const apiReady = m.apis.apis.filter((a) => a.tone === 'ok').length;
    const compOk = m.apis.compositions.filter((c) => c.tone === 'ok').length;
    const active = m.kinds.filter((k) => k.state === 'Active').length;
    const pkgTone = (list: Model['packages']): Tone => (list.length ? worst(list.map((p) => (p.tone === 'info' ? 'ok' : p.tone))) : '');
    return el(
        'div',
        { class: 'tiles' },
        tile({ label: 'Providers', value: m.providers.length, tone: pkgTone(m.providers), parts: stateParts(m.providers), onPick: () => void k8sdockside.openView('packages') }),
        tile({ label: 'Functions', value: m.functions.length, tone: pkgTone(m.functions), parts: stateParts(m.functions), onPick: () => void k8sdockside.openView('packages') }),
        tile({ label: 'Configurations', value: m.configurations.length, tone: pkgTone(m.configurations), parts: stateParts(m.configurations), onPick: () => void k8sdockside.openView('packages') }),
        tile({
            label: 'APIs (XRDs)',
            value: m.apis.apis.length,
            tone: m.apis.apis.length ? worst(m.apis.apis.map((a) => a.tone)) : '',
            parts: [
                { label: 'Served', value: apiReady, colour: STATUS.ok },
                { label: 'Need attention', value: m.apis.apis.length - apiReady, colour: STATUS.warn },
            ],
            onPick: () => void k8sdockside.openView('compositions'),
        }),
        tile({
            label: 'Compositions',
            value: m.apis.compositions.length,
            tone: m.apis.compositions.length ? worst(m.apis.compositions.map((c) => c.tone)) : '',
            parts: [
                { label: 'Ready', value: compOk, colour: STATUS.ok },
                { label: 'Degraded', value: m.apis.compositions.filter((c) => c.tone === 'warn').length, colour: STATUS.warn },
                { label: 'Broken', value: m.apis.compositions.filter((c) => c.tone === 'error').length, colour: STATUS.error },
            ],
            onPick: () => void k8sdockside.openView('compositions'),
        }),
        tile({
            label: 'Managed kinds',
            value: m.kinds.length,
            parts: [
                { label: 'Active', value: active, colour: 'var(--chart-1)' },
                { label: 'Inactive', value: m.kinds.length - active, colour: STATUS.idle },
            ],
            onPick: () => void k8sdockside.openView('managed'),
        }),
        tile({
            label: 'Warnings, last hour',
            value: occ.warning,
            tone: occ.warning ? 'warn' : 'ok',
            extra: sparkColumns(spark),
            note: `${compact(occ.normal)} normal events`,
            onPick: () => void k8sdockside.openView('activity'),
        }),
    );
}

function rings(m: Model): HTMLElement {
    const colourOf = palette(m.perProvider.map((r) => r.provider));
    const providerParts = m.perProvider.filter((r) => r.active > 0);
    const top = providerParts.slice(0, 7);
    const rest = providerParts.slice(7).reduce((n, r) => n + r.active, 0);
    const kindParts = top.map((r) => ({ label: r.provider, value: r.active, colour: colourOf(r.provider), note: [`${r.inactive} inactive`] }));
    if (rest) kindParts.push({ label: 'Other providers', value: rest, colour: 'var(--chart-8)', note: [] });
    const activeKinds = m.kinds.filter((k) => k.state === 'Active').length;

    const apiOk = m.apis.apis.filter((a) => a.established === true && a.compositions.length > 0).length;
    const noComp = m.apis.apis.filter((a) => a.established !== false && a.compositions.length === 0).length;
    const notEst = m.apis.apis.filter((a) => a.established === false).length;

    return el(
        'div',
        { class: 'cards-3' },
        chartCard('Package health', 'Every Provider, Function and Configuration, by what the package manager says.', donut(stateParts(m.packages), { value: String(m.packages.length), label: 'packages' }, { title: 'Package health' }), linkButton('Packages and dependencies →', () => void k8sdockside.openView('packages'))),
        chartCard(
            'Managed kinds by provider',
            'Active managed resource kinds -- what each provider lets you create.',
            providerParts.length ? donut(kindParts, { value: compact(activeKinds), label: 'active kinds' }, { title: 'Managed kinds by provider' }) : nothing('No managed resource kinds yet. They arrive with a Provider.'),
            linkButton('The managed resource map →', () => void k8sdockside.openView('managed')),
        ),
        chartCard(
            'API readiness',
            'Each API (XRD): established, and served by at least one Composition.',
            m.apis.apis.length
                ? donut(
                      [
                          { label: 'Ready', value: apiOk, colour: STATUS.ok },
                          { label: 'No Composition', value: noComp, colour: STATUS.warn },
                          { label: 'Not established', value: notEst, colour: STATUS.error },
                      ],
                      { value: String(m.apis.apis.length), label: 'APIs' },
                      { title: 'API readiness' },
                  )
                : nothing('No CompositeResourceDefinition yet. An XRD is how a platform team defines its own API.'),
            linkButton('APIs and their pipelines →', () => void k8sdockside.openView('compositions')),
        ),
    );
}

function lastHour(m: Model, now: number): HTMLElement {
    return block(
        'The last hour',
        'Every event Crossplane, its providers and functions recorded, in two-minute columns. Hover a column for its numbers.',
        m.events.length ? eventColumns(m.events, now, 60, 30) : nothing('No Crossplane events in the last hour. The API server keeps events for about an hour.'),
        linkButton('All activity, by area and over time →', () => void k8sdockside.openView('activity')),
    );
}

function perProvider(m: Model): HTMLElement {
    const rows = m.perProvider.slice(0, 10);
    const pkgs = new Map(m.providers.map((p) => [p.name, p]));
    return block(
        'Managed APIs per provider',
        'Kinds each provider defines; the faint part is inactive (MRDs not activated).',
        rows.length
            ? bars(
                  rows.map((r) => ({
                      label: r.provider,
                      sub: pkgs.get(r.provider)?.active?.version ?? '',
                      parts: [
                          { label: 'Active', value: r.active, colour: 'var(--chart-1)' },
                          { label: 'Inactive', value: r.inactive, colour: STATUS.idle },
                      ],
                      onPick: pkgs.get(r.provider) ? () => open(pkgs.get(r.provider)?.ref ?? null) : undefined,
                  })),
                  { legend: [{ label: 'Active', colour: 'var(--chart-1)' }, { label: 'Inactive', colour: STATUS.idle }] },
              )
            : nothing('No providers installed.'),
    );
}

function reasons(m: Model): HTMLElement {
    const list = byReason(m.events).slice(0, 8);
    return block(
        'Warnings by reason',
        'What went wrong in the last hour, counted by occurrence, with how many objects it hit.',
        list.length ? bars(list.map((r) => ({ label: r.reason, sub: plural(r.objects, 'object'), parts: [{ label: 'Occurrences', value: r.count, colour: STATUS.warn }], onPick: () => void k8sdockside.openView('activity') }))) : nothing('No warnings in the last hour.'),
    );
}

function attention(list: Problem[]): HTMLElement {
    const shown = list.filter((p) => p.tone !== 'info');
    if (shown.length === 0) return block('Needs attention', '', nothing('Nothing. Every package is healthy, every API served, and no managed resource reported a warning this hour.'));
    const rows = el('ul', { class: 'issues' });
    for (const p of shown.slice(0, 8)) {
        rows.append(clickable(el('li', { class: 'issue', title: `${p.explain}\n\nFix: ${p.fix}` }, dot(p.tone), el('span', { class: 'issue-title' }, p.title), el('span', { class: 'issue-detail' }, p.subject)), () => open(p.ref)));
    }
    return block('Needs attention', 'Worst first. Each row opens the object it is about.', rows, linkButton(shown.length > 8 ? `All ${shown.length} problems, with how to fix each →` : 'How to fix each of them →', () => void k8sdockside.openView('problems')));
}

function crossplane(m: Model): HTMLElement {
    const pods = el('ul', { class: 'pod-list' });
    for (const p of m.core.pods) {
        pods.append(clickable(el('li', { class: 'pod-row' }, dot(p.ready ? 'ok' : p.waiting ? 'error' : 'warn'), el('span', { class: 'pod-name' }, p.component === 'crossplane' ? 'crossplane' : 'rbac-manager'), el('span', { class: 'faint mono' }, p.name), el('span', { class: 'spacer' }), p.restarts ? pill(plural(p.restarts, 'restart'), 'warn') : null, pill(p.ready ? 'ready' : p.waiting || 'not ready', p.ready ? 'ok' : 'error')), () => open({ kind: 'pods', namespace: p.namespace, name: p.name })));
    }
    const s = m.snap;
    const count = (label: string, n: number, kind: string, served = true) => {
        const row = el('li', { class: served ? 'count-row' : 'count-row faint' }, el('span', {}, label), el('span', { class: 'spacer' }), el('strong', {}, served ? compact(n) : '—'));
        if (served) clickable(row, () => open({ kind, name: '' }));
        return row;
    };
    const runningOps = s.operations.filter((o) => !o.status?.conditions?.some((c) => c.type === 'Succeeded')).length;
    return block(
        'Crossplane',
        m.core.version ? `Version ${m.core.version}, running in ${m.core.pods[0]?.namespace ?? 'the cluster'}.` : 'The core pods were not found by their Helm labels (app=crossplane).',
        m.core.pods.length ? pods : null,
        el(
            'ul',
            { class: 'counts' },
            count('Runtime configs', s.runtimeConfigs.length, KIND.runtimeConfigs, s.served['runtimeConfigs']),
            count('Image configs', s.imageConfigs.length, KIND.imageConfigs, s.served['imageConfigs']),
            count('Environment configs', s.environmentConfigs.length, KIND.environmentConfigs, s.served['environmentConfigs']),
            count('Activation policies', s.mraps.length, KIND.mraps, s.served['mraps']),
            count('Usages', s.usages.length, KIND.usages, s.served['usages']),
            count(`Operations${runningOps ? ` (${runningOps} running)` : ''}`, s.operations.length, KIND.operations, s.served['operations']),
            count('Cron operations', s.cronOperations.length, KIND.cronOperations, s.served['cronOperations']),
            count('Watch operations', s.watchOperations.length, KIND.watchOperations, s.served['watchOperations']),
        ),
    );
}
