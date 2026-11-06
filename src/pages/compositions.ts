// Compositions: the APIs a platform defines and what serves them.
//
//   Three charts   APIs by scope, function use across pipelines, and how
//                  long the pipelines are (a histogram of steps)
//   The flows      each API, its Compositions, and each pipeline step by step
//   Strays         Compositions for an API nobody defined

import type { Model } from '../model/crossplane.js';
import { plural } from '../model/tone.js';
import { bars, columns, donut, palette, STATUS } from '../ui/charts.js';
import { apiFlow, pipelineRow } from '../ui/diagrams.js';
import { byId, el, replace } from '../ui/dom.js';
import { every, fingerprint, notInstalled, read, start } from '../ui/page.js';
import { block, blockWith, nothing, open } from '../ui/parts.js';
import { heading } from '../ui/parts.js';
import { chartCard } from '../ui/widgets.js';

const REFRESH = 20_000;

start('page', async (ctx) => {
    const head = byId('head');
    const body = byId('body');
    const failure = el('p', { class: 'refresh-failure' });
    const note = `The APIs defined in ${ctx.contextName}, the Compositions behind each, and the function pipeline each one runs.`;
    replace(head, heading('compositions', 'Compositions', note));
    let last = '';
    let search = '';
    let current: Model | null = null;
    const flowsHost = el('div');
    const drawFlows = () => {
        if (current) replace(flowsHost, flows(current, search, (s) => {
            search = s;
            drawFlows();
        }));
    };
    const stop = every(
        REFRESH,
        async () => {
            const { installed, m } = await read();
            failure.textContent = '';
            document.getElementById('first')?.remove();
            const print = fingerprint([installed, m.snap.xrds, m.snap.compositions, m.snap.compositionRevisions, m.functions.map((f) => [f.name, f.tone])]);
            if (print === last) return;
            last = print;
            current = m;
            if (!installed) {
                replace(body, failure, notInstalled(ctx));
                return;
            }
            drawFlows();
            replace(body, failure, summary(m), flowsHost, strays(m));
        },
        (err) => {
            failure.textContent = err instanceof Error ? err.message : String(err);
        },
    );
    addEventListener('pagehide', stop);
});

function summary(m: Model): HTMLElement {
    const scopes = [
        { label: 'Namespaced', value: m.apis.apis.filter((a) => a.scope === 'Namespaced').length, colour: 'var(--chart-1)' },
        { label: 'Cluster', value: m.apis.apis.filter((a) => a.scope === 'Cluster').length, colour: 'var(--chart-2)' },
        { label: 'Legacy cluster (v1)', value: m.apis.apis.filter((a) => a.scope === 'LegacyCluster').length, colour: 'var(--chart-4)' },
    ];
    const colourOf = palette(m.apis.functionUse.map((f) => f.name));
    const use = m.apis.functionUse.slice(0, 8);
    // How many steps each pipeline has: 0, 1, 2 ... the longest.
    const pipelines = m.apis.compositions.filter((c) => !c.legacy);
    const longest = Math.max(0, ...pipelines.map((c) => c.steps.length));
    const hist = Array.from({ length: Math.max(4, longest + 1) }, (_, n) => pipelines.filter((c) => c.steps.length === n));
    return el(
        'div',
        { class: 'cards-3' },
        chartCard('APIs by scope', 'Namespaced XRs are the v2 default; legacy cluster-scoped ones come from v1 XRDs and offer claims.', m.apis.apis.length ? donut(scopes, { value: String(m.apis.apis.length), label: 'APIs' }, { title: 'APIs by scope' }) : nothing('No XRDs yet.')),
        chartCard(
            'Function use',
            'Pipeline steps that run each Function, across every Composition.',
            use.length
                ? bars(
                      use.map((f) => ({
                          label: f.name,
                          sub: f.fn ? plural(f.compositions, 'composition') : 'not installed',
                          parts: [{ label: 'Steps', value: f.steps, colour: f.fn ? colourOf(f.name) : STATUS.error }],
                          onPick: f.fn ? () => open(f.fn?.ref ?? null) : undefined,
                      })),
                  )
                : nothing('No Functions installed.'),
        ),
        chartCard(
            'Pipeline length',
            'How many steps each Composition runs: a histogram of the pipelines.',
            pipelines.length
                ? columns(
                      hist.map((list, n) => ({
                          parts: [{ label: 'Compositions', value: list.length, colour: 'var(--chart-1)' }],
                          tip: [`${plural(n, 'step')}`, `${plural(list.length, 'Composition')}`, ...list.slice(0, 6).map((c) => c.name)],
                      })),
                      { height: 120, xLabels: hist.map((_, n) => ({ at: n + 0.5, text: String(n) })) },
                  )
                : nothing('No pipelines yet.'),
        ),
    );
}

function flows(m: Model, search: string, onSearch: (s: string) => void): HTMLElement {
    const input = el('input', { type: 'search', class: 'search', placeholder: 'Search APIs, compositions, functions', value: search, 'aria-label': 'Search', spellcheck: 'false' });
    input.addEventListener('input', () => {
        onSearch(input.value);
        requestAnimationFrame(() => {
            const again = document.querySelector<HTMLInputElement>('input.search');
            again?.focus();
            again?.setSelectionRange(again.value.length, again.value.length);
        });
    });
    const q = search.trim().toLowerCase();
    const shown = m.apis.apis.filter((a) => !q || [a.kind, a.group, a.name, ...a.compositions.flatMap((c) => [c.name, ...c.steps.flatMap((s) => [s.step, s.functionName])])].join(' ').toLowerCase().includes(q));
    if (m.apis.apis.length === 0) return block('APIs and their pipelines', '', nothing('No CompositeResourceDefinitions yet. An XRD defines the API; a Composition says how to build it from managed resources, as a pipeline of functions.'));
    return blockWith(
        'APIs and their pipelines',
        'Each API on the left; each Composition that serves it to the right, with its pipeline steps in order. A step whose function is missing or unhealthy is drawn in red. Click anything to open it.',
        input,
        shown.length ? el('div', { class: 'flows' }, ...shown.map(apiFlow)) : nothing('Nothing matches.'),
    );
}

function strays(m: Model): HTMLElement | null {
    if (m.apis.orphans.length === 0) return null;
    return block('Compositions for an API that is not defined', 'Their compositeTypeRef names a type no XRD defines, so nothing ever uses them.', el('div', { class: 'flows' }, ...m.apis.orphans.map((c) => el('div', { class: 'flow solo' }, el('div', { class: 'flow-api ghost' }, el('div', { class: 'flow-api-kind' }, c.kind), el('div', { class: 'flow-api-group mono' }, c.group || c.apiVersion), el('div', { class: 'flow-api-tags' }, el('span', { class: 'pill pill-error' }, 'no XRD'))), el('span', { class: 'flow-fork', 'aria-hidden': 'true' }), el('div', { class: 'flow-rows' }, pipelineRow(c))))));
}
