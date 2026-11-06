// The panel on a Provider, Function or Configuration: the package's card --
// state, source, runtime, revisions -- and, for a provider, the managed
// resource kinds it brings and which of them failed this hour; for a
// function, the Compositions whose pipelines run it.

import { failing } from '../model/activity.js';
import type { Model } from '../model/crossplane.js';
import type { PackageView } from '../model/packages.js';
import { plural } from '../model/tone.js';
import { PACKAGE_KIND, type PackageType } from '../model/types.js';
import { compact, donut, STATUS } from '../ui/charts.js';
import { el, replace } from '../ui/dom.js';
import { fail, read } from '../ui/page.js';
import { clickable, dot, linkButton, nothing, open, pill, tip } from '../ui/parts.js';
import { card } from '../ui/packagecard.js';

const TYPE_OF: Record<string, PackageType> = Object.fromEntries(Object.entries(PACKAGE_KIND).map(([t, k]) => [k, t as PackageType]));

/** A titled block, drawn the app's way where it can (0.1.36 and newer). */
function section(host: HTMLElement, id: string, title: string, ...children: (Node | null)[]): void {
    const content = children.filter((c): c is Node => !!c);
    if (k8sdockside.ui?.section) {
        const s = k8sdockside.ui.section({ id, title, parent: host });
        s.body.append(...content);
        return;
    }
    host.append(el('section', { class: 'panel-section' }, el('h3', {}, title), ...content));
}

async function main(): Promise<void> {
    const host = document.getElementById('panel');
    if (!host) return;
    try {
        const ctx = await k8sdockside.ready();
        const obj = ctx.object;
        const type = obj ? TYPE_OF[obj.kind] : undefined;
        if (!obj || !type) {
            replace(host, nothing('This panel is for Crossplane packages.'));
            return;
        }
        const { m } = await read();
        const pkg = m.packages.find((p) => p.type === type && p.name === obj.name);
        replace(host);
        if (!pkg) {
            host.append(nothing('Crossplane has not reconciled this package yet.'));
            return;
        }
        host.append(card(pkg, m.perProvider.find((r) => r.provider === pkg.name)));
        if (type === 'Provider') providerKinds(host, m, pkg);
        if (type === 'Function') functionUse(host, m, pkg);
        await k8sdockside.resize?.(document.body.scrollHeight);
    } catch (err) {
        fail(host, err);
    }
}

function providerKinds(host: HTMLElement, m: Model, pkg: PackageView): void {
    const kinds = m.kinds.filter((k) => k.provider === pkg.name);
    const fails = failing(m.events, (e) => e.area === 'managed' && e.provider === pkg.name);
    if (!kinds.length) {
        section(host, 'crossplane-kinds', 'Managed resource kinds', nothing('This provider has not installed any managed resource kinds yet.'));
        return;
    }
    const active = kinds.filter((k) => k.state === 'Active');
    const chips = el('div', { class: 'kind-chips' });
    const bad = new Set(fails.map((f) => `${f.object.group}/${f.object.kind}`));
    for (const k of active) {
        const failingKind = bad.has(`${k.group}/${k.kind}`);
        const chip = el('span', { class: `kind-chip${failingKind ? ' failing' : ''}` }, failingKind ? dot('error') : null, k.kind);
        tip(chip, [k.kind, k.key]);
        if (k.served) clickable(chip, () => open({ kind: k.appKind, name: '' }));
        chips.append(chip);
    }
    section(
        host,
        'crossplane-kinds',
        'Managed resource kinds',
        el(
            'div',
            { class: 'panel-split' },
            donut(
                [
                    { label: 'Active', value: active.length, colour: 'var(--chart-1)' },
                    { label: 'Inactive', value: kinds.length - active.length, colour: STATUS.idle },
                ],
                { value: compact(kinds.length), label: 'kinds' },
                { size: 112, thickness: 12, title: 'Kinds this provider defines' },
            ),
            el('div', {}, el('p', { class: 'note small' }, `${plural(fails.length, 'resource')} of this provider reported a warning in the last hour.`), chips),
        ),
        linkButton('All managed resources →', () => void k8sdockside.openView('managed')),
    );
}

function functionUse(host: HTMLElement, m: Model, pkg: PackageView): void {
    const uses = m.apis.compositions.filter((c) => c.steps.some((s) => s.functionName === pkg.name));
    const list = el('ul', { class: 'issues' });
    for (const c of uses) {
        const steps = c.steps.filter((s) => s.functionName === pkg.name).map((s) => s.step);
        list.append(clickable(el('li', { class: 'issue issue-4' }, dot(c.tone), el('span', { class: 'issue-title' }, c.name), el('span', { class: 'issue-detail' }, `${c.kind} · step ${steps.join(', ')}`), pill(`${c.steps.length} steps`)), () => open(c.ref)));
    }
    section(host, 'crossplane-uses', `Used by ${plural(uses.length, 'Composition')}`, uses.length ? list : nothing('No Composition runs this function.'), linkButton('Every pipeline →', () => void k8sdockside.openView('compositions')));
}

void main();
