// Packages: what the package manager installed, how it hangs together, and
// the history of each.
//
//   Three charts   packages by type, by registry, and the revisions each keeps
//   The graph      the dependencies the Lock resolved, left to right
//   The cards      one per package: state, source, the revision timeline,
//                  its runtime pods, what it brings and who needs it

import type { Model } from '../model/crossplane.js';
import { bars, donut, palette, STATUS } from '../ui/charts.js';
import { dependencyGraph, TYPE_COLOUR } from '../ui/diagrams.js';
import { byId, el, replace } from '../ui/dom.js';
import { every, fingerprint, notInstalled, read, remember, start } from '../ui/page.js';
import { block, blockWith, heading, nothing, open } from '../ui/parts.js';
import { card } from '../ui/packagecard.js';
import { chartCard, segmented, STATE_COLOUR } from '../ui/widgets.js';

const REFRESH = 20_000;

type TypeFilter = 'all' | 'Provider' | 'Function' | 'Configuration';
interface Filters {
    type: TypeFilter;
    search: string;
    problemsOnly: boolean;
}

start('page', async (ctx) => {
    const head = byId('head');
    const body = byId('body');
    const failure = el('p', { class: 'refresh-failure' });
    const note = `Providers, Functions and Configurations in ${ctx.contextName}, and what depends on what.`;
    replace(head, heading('packages', 'Packages', note));
    const filters: Filters = { type: 'all', search: '', problemsOnly: false, ...((await remember.get<Filters>('packages.filters')) ?? {}) };
    let current: Model | null = null;
    let last = '';
    const cardsHost = el('div');

    const drawCards = () => {
        if (!current) return;
        replace(cardsHost, cards(current, filters, () => {
            void remember.set('packages.filters', filters);
            drawCards();
        }));
    };

    const stop = every(
        REFRESH,
        async () => {
            const { installed, m } = await read();
            failure.textContent = '';
            document.getElementById('first')?.remove();
            const print = fingerprint([installed, m.snap.providers, m.snap.functions, m.snap.configurations, m.snap.providerRevisions, m.snap.functionRevisions, m.snap.configurationRevisions, m.snap.locks, m.snap.pods, m.kinds.length]);
            if (print === last) return;
            last = print;
            current = m;
            if (!installed) {
                replace(body, failure, notInstalled(ctx));
                return;
            }
            drawCards();
            replace(body, failure, summary(m), graph(m), cardsHost);
        },
        (err) => {
            failure.textContent = err instanceof Error ? err.message : String(err);
        },
    );
    addEventListener('pagehide', stop);
});

function summary(m: Model): HTMLElement {
    const types = (['Configuration', 'Provider', 'Function'] as const).map((t) => ({ label: `${t}s`, value: m.packages.filter((p) => p.type === t).length, colour: TYPE_COLOUR[t] ?? '' }));
    const registries = new Map<string, number>();
    for (const p of m.packages) registries.set(p.src.registry || 'unknown', (registries.get(p.src.registry || 'unknown') ?? 0) + 1);
    const regColour = palette([...registries.keys()]);
    const regParts = [...registries.entries()].sort((a, b) => b[1] - a[1]).map(([r, n]) => ({ label: r, value: n, colour: regColour(r) }));
    const withHistory = m.packages.filter((p) => p.revisions.length > 0).sort((a, b) => b.revisions.length - a.revisions.length || a.name.localeCompare(b.name)).slice(0, 8);
    return el(
        'div',
        { class: 'cards-3' },
        chartCard('By type', 'What the package manager installed.', donut(types, { value: String(m.packages.length), label: 'packages' }, { title: 'Packages by type' })),
        chartCard('By registry', 'Where each package is pulled from.', regParts.length ? donut(regParts, { value: String(registries.size), label: registries.size === 1 ? 'registry' : 'registries' }, { title: 'Packages by registry' }) : nothing('No packages.')),
        chartCard(
            'Revisions kept',
            'One revision per version installed; the active one runs. Old ones are pruned past revisionHistoryLimit.',
            withHistory.length
                ? bars(
                      withHistory.map((p) => ({
                          label: p.name,
                          parts: [
                              { label: 'Active', value: p.active ? 1 : 0, colour: STATE_COLOUR[p.state] },
                              { label: 'Inactive', value: p.revisions.length - (p.active ? 1 : 0), colour: STATUS.idle },
                          ],
                          onPick: () => open(p.ref),
                      })),
                      { legend: [{ label: 'Active', colour: STATUS.ok }, { label: 'Inactive', colour: STATUS.idle }] },
                  )
                : nothing('No revisions yet.'),
        ),
    );
}

function graph(m: Model): HTMLElement {
    if (m.graph.nodes.length === 0) return block('Dependencies', '', nothing('No packages installed. `kubectl apply` a Provider or a Configuration to begin.'));
    return block('Dependencies', 'What each package needs, as the package manager resolved it in its Lock. Configurations on the left, what they pull in to the right. Hover a package to light up its dependencies; click to open it.', dependencyGraph(m.graph));
}

function cards(m: Model, f: Filters, changed: () => void): HTMLElement {
    const search = el('input', { type: 'search', class: 'search', placeholder: 'Search name, source or version', value: f.search, 'aria-label': 'Search packages', spellcheck: 'false' });
    search.addEventListener('input', () => {
        f.search = search.value;
        changed();
        // Drawing replaces the input; keep the cursor where the user is typing.
        requestAnimationFrame(() => {
            const again = document.querySelector<HTMLInputElement>('input.search');
            if (again) {
                again.focus();
                again.setSelectionRange(again.value.length, again.value.length);
            }
        });
    });
    const types = segmented<TypeFilter>(
        [
            { id: 'all', label: `All ${m.packages.length}` },
            { id: 'Provider', label: `Providers ${m.providers.length}` },
            { id: 'Function', label: `Functions ${m.functions.length}` },
            { id: 'Configuration', label: `Configurations ${m.configurations.length}` },
        ],
        f.type,
        (t) => {
            f.type = t;
            changed();
        },
        'Package type',
    );
    const only = el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: f.problemsOnly }), ' only problems');
    only.querySelector('input')?.addEventListener('change', (e) => {
        f.problemsOnly = (e.target as HTMLInputElement).checked;
        changed();
    });
    const q = f.search.trim().toLowerCase();
    const shown = m.packages.filter((p) => (f.type === 'all' || p.type === f.type) && (!f.problemsOnly || (p.tone !== 'ok' && p.tone !== '')) && (!q || `${p.name} ${p.src.source} ${p.src.version} ${p.active?.version ?? ''}`.toLowerCase().includes(q)));
    const kinds = new Map(m.perProvider.map((r) => [r.provider, r]));
    return blockWith(
        'Every package',
        '',
        el('div', { class: 'filters' }, types, search, only),
        shown.length ? el('div', { class: 'grid' }, ...shown.map((p) => card(p, kinds.get(p.name)))) : nothing(m.packages.length ? 'No package matches these filters.' : 'No packages installed yet.'),
    );
}
