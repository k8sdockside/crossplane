// A package drawn as a card: its state, source, runtime, what it brings and
// who needs it, and its revisions as a timeline. Used by the Packages view and
// by the panel on a Provider, Function or Configuration.

import { STATE_WORD, type PackageView, type RevisionView } from '../model/packages.js';
import { plural } from '../model/tone.js';
import { KIND } from '../model/types.js';
import { compact } from './charts.js';
import { TYPE_COLOUR } from './diagrams.js';
import { el } from './dom.js';
import { age, clickable, code, dot, facts, open, openName, pill, tip } from './parts.js';

/** The revisions as a row of dots on a line, oldest left; the active one filled. */
export function timeline(revs: RevisionView[]): HTMLElement {
    const row = el('div', { class: 'revs', role: 'list', 'aria-label': 'Revisions' });
    for (const r of revs) {
        const node = el('span', { class: `rev${r.active ? ' active' : ''} rev-${r.tone || 'none'}`, role: 'listitem', tabindex: '0' }, el('span', { class: 'rev-dot' }), el('span', { class: 'rev-label' }, r.version || `#${r.revision}`));
        tip(node, [`Revision ${r.revision}${r.active ? ' (active)' : ''}`, r.name, r.version ? `version ${r.version}` : '', r.created ? `created ${age(r.created)} ago` : '', r.objects ? `${plural(r.objects, 'object')} installed` : ''].filter(Boolean));
        clickable(node, () => open(r.ref));
        row.append(node);
    }
    return row;
}

export function card(p: PackageView, kinds?: { active: number; inactive: number }): HTMLElement {
    const badge = el('span', { class: 'type-badge' }, p.type[0] ?? '?');
    badge.style.background = TYPE_COLOUR[p.type] ?? '';
    const rt = p.runtime;
    const pairs: [string, Node | string][] = [
        ['Source', code(p.src.source || '—', 'wrap')],
        ['Version', p.active?.version || p.src.version || '—'],
        ['Activation', p.activationPolicy],
    ];
    if (p.type !== 'Configuration') pairs.push(['Runtime config', p.runtimeConfig ? openName(p.runtimeConfig, { kind: KIND.runtimeConfigs, name: p.runtimeConfig }) : '—']);
    if (rt) {
        const pod = rt.pod;
        pairs.push([
            'Pods',
            el('span', {}, dot(rt.pods === 0 ? 'warn' : rt.ready === rt.pods ? 'ok' : rt.waiting ? 'error' : 'warn'), rt.pods ? ` ${rt.ready}/${rt.pods} ready` : ' none', rt.restarts ? el('span', { class: 'faint' }, ` · ${plural(rt.restarts, 'restart')}`) : null, rt.waiting ? el('span', { class: 'faint' }, ` · ${rt.waiting}`) : null, pod ? ' ' : null, pod ? openName('open', { kind: 'pods', namespace: pod.namespace, name: pod.name }) : null),
        ]);
    }
    if (kinds) pairs.push(['Managed kinds', `${compact(kinds.active)} active${kinds.inactive ? `, ${compact(kinds.inactive)} inactive` : ''}`]);
    if (p.dependsOn.length) pairs.push(['Needs', p.dependsOn.join(', ')]);
    if (p.usedBy.length) pairs.push(['Needed by', p.usedBy.join(', ')]);
    pairs.push(['Installed', p.created ? `${age(p.created)} ago` : '—']);
    return el(
        'article',
        { class: `card tone-edge-${p.tone || 'none'}` },
        el('div', { class: 'card-head' }, badge, openName(p.name, p.ref, 'card-name'), el('span', { class: 'spacer' }), pill(STATE_WORD[p.state], p.tone)),
        p.trouble && p.state !== 'healthy' ? el('p', { class: 'trouble' }, el('strong', {}, `${p.trouble.type} ${p.trouble.status}: `), p.trouble.reason ?? '', p.trouble.message ? el('span', { class: 'trouble-msg' }, ` — ${p.trouble.message}`) : null) : null,
        facts(pairs),
        p.revisions.length ? el('div', { class: 'card-section' }, el('div', { class: 'card-section-label' }, `${plural(p.revisions.length, 'revision')}`), timeline(p.revisions)) : null,
    );
}
