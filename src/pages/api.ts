// The panel on an XRD or a Composition: the API and every Composition that
// serves it with its pipeline drawn step by step (on an XRD), or this one
// Composition's pipeline and the API it serves (on a Composition).

import type { EventView } from '../model/activity.js';
import { verbFor } from '../model/problems.js';
import { plural } from '../model/tone.js';
import { KIND } from '../model/types.js';
import { apiFlow, pipelineRow } from '../ui/diagrams.js';
import { el, replace } from '../ui/dom.js';
import { fail, read } from '../ui/page.js';
import { age, clickable, code, facts, linkButton, nothing, open, openName, pill } from '../ui/parts.js';

async function main(): Promise<void> {
    const host = document.getElementById('panel');
    if (!host) return;
    try {
        const ctx = await k8sdockside.ready();
        const obj = ctx.object;
        if (!obj) return;
        const { m } = await read();
        replace(host);
        if (obj.kind === KIND.xrds) {
            const api = m.apis.apis.find((a) => a.name === obj.name);
            if (!api) {
                host.append(nothing('Crossplane has not read this XRD yet.'));
                return;
            }
            host.append(
                facts([
                    ['Composite kind', `${api.kind} (${api.group})`],
                    ['Scope', api.scope],
                    ['Versions', api.versions.map((v) => `${v.name}${v.referenceable ? ' (referenceable)' : ''}${v.served ? '' : ' (not served)'}`).join(', ')],
                    ['Claim', api.claimKind || '—'],
                    ['Default composition', api.defaultComposition ? openName(api.defaultComposition, { kind: KIND.compositions, name: api.defaultComposition }) : '—'],
                    ['Objects', api.xrKind ? openName(`List every ${api.kind}`, { kind: api.xrKind, name: '' }) : 'the CRD is not served yet'],
                ]),
                el('div', { class: 'flows' }, apiFlow(api)),
            );
            const warn = composites(m.events.filter((e) => e.area === 'composite' && e.object.group === api.group && (e.object.kind === api.kind || e.object.kind === api.claimKind)));
            if (warn) host.append(warn);
        } else {
            const c = m.apis.compositions.find((x) => x.name === obj.name);
            if (!c) {
                host.append(nothing('Crossplane has not read this Composition yet.'));
                return;
            }
            const api = m.apis.apis.find((a) => a.name === c.api);
            host.append(
                facts([
                    ['For', api ? openName(`${api.kind} (${api.group})`, api.ref) : el('span', {}, `${c.kind} ${c.apiVersion} `, pill('no XRD defines it', 'error'))],
                    ['Mode', c.mode],
                    ['Revisions', c.revisions ? `${c.revisions}, latest ${c.latestRevision}` : '—'],
                    ['Default for its API', c.isDefault ? 'yes' : 'no'],
                ]),
                el('div', { class: 'flows' }, el('div', { class: 'flow solo' }, el('div', { class: 'flow-rows' }, pipelineRow(c)))),
                linkButton('Every API and pipeline →', () => void k8sdockside.openView('compositions')),
            );
        }
        await k8sdockside.resize?.(document.body.scrollHeight);
    } catch (err) {
        fail(host, err);
    }
}

function composites(list: EventView[]): HTMLElement | null {
    const warnings = list.filter((e) => e.warning);
    if (!warnings.length) return null;
    const rows = el('ul', { class: 'issues' });
    for (const e of warnings.slice(0, 8)) {
        rows.append(clickable(el('li', { class: 'issue issue-4', title: e.message }, el('span', { class: 'dot dot-error' }), el('span', { class: 'issue-title' }, `${e.object.namespace ? `${e.object.namespace}/` : ''}${e.object.name} ${verbFor(e.reason)}`), code(e.reason), el('span', { class: 'faint' }, `${age(e.last)} ago`)), () => open(e.appKind ? { kind: e.appKind, namespace: e.object.namespace || undefined, name: e.object.name } : null)));
    }
    return el('section', { class: 'panel-section' }, el('h3', {}, `${plural(warnings.length, 'warning')} on its composites this hour`), rows);
}

void main();
