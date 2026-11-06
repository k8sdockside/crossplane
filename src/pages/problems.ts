// Problems: everything wrong, in plain words, grouped by where it is, each
// with what it means, what to change, and the controller's own words.

import { problems, PROBLEM_AREA_WORD, tally, type Problem, type ProblemArea } from '../model/problems.js';
import { plural } from '../model/tone.js';
import { donut, STATUS } from '../ui/charts.js';
import { byId, el, replace } from '../ui/dom.js';
import { every, fingerprint, notInstalled, read, start } from '../ui/page.js';
import { block, clickable, code, dot, heading, nothing, open, pill } from '../ui/parts.js';
import { chartCard } from '../ui/widgets.js';

const REFRESH = 20_000;
const ORDER: ProblemArea[] = ['core', 'package', 'api', 'composition', 'composite', 'managed', 'operation'];

start('page', async (ctx) => {
    const head = byId('head');
    const body = byId('body');
    const failure = el('p', { class: 'refresh-failure' });
    const note = `What is wrong with Crossplane in ${ctx.contextName}, and what to change.`;
    replace(head, heading('problems', 'Problems', note));
    let last = '';
    const stop = every(
        REFRESH,
        async () => {
            const { installed, m } = await read();
            failure.textContent = '';
            document.getElementById('first')?.remove();
            const list = problems(m);
            const print = fingerprint([installed, list]);
            if (print === last) return;
            last = print;
            replace(head, heading('problems', 'Problems', note, list.filter((p) => p.tone !== 'info').length));
            if (!installed) {
                replace(body, failure, notInstalled(ctx));
                return;
            }
            replace(body, failure, summary(list), ...groups(list));
        },
        (err) => {
            failure.textContent = err instanceof Error ? err.message : String(err);
        },
    );
    addEventListener('pagehide', stop);
});

function summary(list: Problem[]): HTMLElement {
    const t = tally(list);
    const areas = ORDER.map((a, i) => ({ label: PROBLEM_AREA_WORD[a], value: list.filter((p) => p.area === a && p.tone !== 'info').length, colour: `var(--chart-${i + 1})`, onPick: () => document.getElementById(`area-${a}`)?.scrollIntoView({ behavior: 'smooth' }) })).filter((p) => p.value > 0);
    if (list.length === 0) return block('Nothing to fix', '', nothing('Every package is healthy, every API is served by a Composition whose functions are installed, and no managed or composite resource reported a warning in the last hour.'));
    return el(
        'div',
        { class: 'cards-3 cards-2' },
        chartCard(
            'By severity',
            '',
            donut(
                [
                    { label: 'Errors', value: t.error, colour: STATUS.error },
                    { label: 'Warnings', value: t.warn, colour: STATUS.warn },
                    { label: 'Notes', value: t.info, colour: 'var(--accent)' },
                ],
                { value: String(list.length), label: 'problems' },
                { title: 'Problems by severity' },
            ),
        ),
        chartCard('By area', 'Click a part to jump to it.', areas.length ? donut(areas, { value: String(t.error + t.warn), label: 'to fix' }, { title: 'Problems by area' }) : nothing('Only notes.')),
    );
}

function groups(list: Problem[]): HTMLElement[] {
    const out: HTMLElement[] = [];
    for (const area of ORDER) {
        const mine = list.filter((p) => p.area === area);
        if (!mine.length) continue;
        const section = block(PROBLEM_AREA_WORD[area], plural(mine.length, 'problem'), el('div', { class: 'problems' }, ...mine.map(problem)));
        section.id = `area-${area}`;
        out.push(section);
    }
    return out;
}

function problem(p: Problem): HTMLElement {
    const node = el(
        'article',
        { class: `problem tone-edge-${p.tone || 'none'}` },
        el('div', { class: 'problem-head' }, dot(p.tone), el('span', { class: 'problem-title' }, p.title), el('span', { class: 'spacer' }), pill(p.tone === 'error' ? 'error' : p.tone === 'warn' ? 'warning' : 'note', p.tone)),
        p.subject ? el('div', { class: 'problem-subject mono' }, p.subject) : null,
        el('p', { class: 'problem-explain' }, p.explain),
        el('p', { class: 'problem-fix' }, el('strong', {}, 'Fix: '), p.fix),
        p.reason || p.message ? el('div', { class: 'problem-verbatim' }, p.reason ? code(p.reason) : null, p.message ? el('span', { class: 'msg' }, p.message) : null) : null,
    );
    if (p.ref) clickable(node, () => open(p.ref));
    return node;
}
