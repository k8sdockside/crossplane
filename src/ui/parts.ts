// The pieces every Crossplane page is drawn from: the heading with the views
// as tabs, tiles, pills, blocks, and the hover tooltip every chart shares.
//
// They are built from CSS classes rather than colour values, so the app's
// theme tokens colour them and a switch from light to dark needs no
// JavaScript at all.

import type { Ref } from '../model/packages.js';
import type { Tone } from '../model/tone.js';
import { el, replace } from './dom.js';

/** The plugin's views, in the order the heading offers them. */
export const VIEWS: [string, string][] = [
    ['overview', 'Dashboard'],
    ['packages', 'Packages'],
    ['compositions', 'Compositions'],
    ['managed', 'Managed resources'],
    ['activity', 'Activity'],
    ['problems', 'Problems'],
];

/**
 * A page's own heading: the mark, the title, a line under it, and the other
 * views as tabs -- so every view is one click from every other, without the
 * sidebar.
 */
export function heading(current: string, title: string, note: string, problems: number | null = null): HTMLElement {
    const nav = el('nav', { class: 'tabs', 'aria-label': 'Crossplane views' });
    for (const [id, label] of VIEWS) {
        const here = id === current;
        const tab = el(
            'button',
            { type: 'button', class: here ? 'tab here' : 'tab', 'aria-current': here ? 'page' : undefined },
            label,
            id === 'problems' && problems ? el('span', { class: 'tab-count' }, String(problems)) : null,
        );
        if (!here) tab.addEventListener('click', () => void k8sdockside.openView(id));
        nav.append(tab);
    }
    return el(
        'header',
        { class: 'page-head' },
        el('div', { class: 'page-title' }, el('img', { class: 'mark', src: 'logo.svg', alt: '', width: 30, height: 30 }), el('div', {}, el('h1', {}, title), note ? el('p', { class: 'note' }, note) : null)),
        nav,
    );
}

/** A coloured dot for a tone. */
export function dot(tone: Tone): HTMLElement {
    return el('span', { class: `dot dot-${tone || 'none'}`, 'aria-hidden': 'true' });
}

/** A small coloured label: a status word, a version, a count. */
export function pill(text: string, tone: Tone = '', title = ''): HTMLElement {
    return el('span', { class: `pill pill-${tone || 'none'}`, title: title || undefined }, text);
}

/** A section with a heading, an optional sentence, and whatever follows. */
export function block(title: string, note: string, ...children: (Node | null | false | undefined)[]): HTMLElement {
    return el('section', { class: 'block' }, el('div', { class: 'block-head' }, el('h2', {}, title)), note ? el('p', { class: 'note' }, note) : null, ...children);
}

/** A block with something on the right of its heading: a filter, a range control. */
export function blockWith(title: string, note: string, aside: Node, ...children: (Node | null | false | undefined)[]): HTMLElement {
    return el('section', { class: 'block' }, el('div', { class: 'block-head' }, el('h2', {}, title), el('span', { class: 'spacer' }), aside), note ? el('p', { class: 'note' }, note) : null, ...children);
}

/** An empty state that says what would have been here. */
export function nothing(message: string): HTMLElement {
    return el('p', { class: 'empty' }, message);
}

export function loading(host: HTMLElement, message: string): void {
    replace(host, el('p', { class: 'loading' }, message));
}

/**
 * Makes a row behave like a button: clickable, focusable, and answering the
 * keys a button answers.
 */
export function clickable<T extends Element>(node: T, onPick: () => void): T {
    node.classList.add('pick');
    node.setAttribute('role', 'button');
    node.setAttribute('tabindex', '0');
    node.addEventListener('click', onPick);
    node.addEventListener('keydown', (event) => {
        const key = (event as KeyboardEvent).key;
        if (key === 'Enter' || key === ' ') {
            event.preventDefault();
            onPick();
        }
    });
    return node;
}

/** Opens an object in the app. A kind the app will not open is simply nothing to click. */
export function open(ref: Ref | null): void {
    if (!ref) return;
    void k8sdockside.open({ kind: ref.kind, namespace: ref.namespace || undefined, name: ref.name || undefined }).catch(() => undefined);
}

/** A button that opens an object in the app, drawn as the name of the thing. */
export function openName(label: string, ref: Ref | null, className = 'name-link'): HTMLElement {
    if (!ref) return el('span', { class: `${className} gone` }, label);
    const node = el('button', { type: 'button', class: className, title: `Open ${label}` }, label);
    node.addEventListener('click', (event) => {
        event.stopPropagation();
        open(ref);
    });
    return node;
}

/** A row of facts: a term and a value each, in two columns. */
export function facts(pairs: [string, Node | string][]): HTMLElement {
    const list = el('dl', { class: 'facts' });
    for (const [term, value] of pairs) list.append(el('dt', {}, term), el('dd', {}, typeof value === 'string' ? value || '—' : value));
    return list;
}

/** Monospace text: a package reference, a group, a reason. */
export function code(text: string, className = ''): HTMLElement {
    return el('code', { class: className ? `mono ${className}` : 'mono' }, text);
}

export function linkButton(label: string, onClick: () => void): HTMLButtonElement {
    const b = el('button', { type: 'button', class: 'link-button' }, label);
    b.addEventListener('click', onClick);
    return b;
}

export function action(label: string, onClick: () => void, primary = false): HTMLButtonElement {
    const b = el('button', { type: 'button', class: primary ? 'primary' : undefined }, label);
    b.addEventListener('click', onClick);
    return b;
}

/** How long ago, the way the app's tables write it, with a fallback for an older app. */
export function age(when: string | number): string {
    if (!when) return '';
    try {
        if (k8sdockside.format) return k8sdockside.format.age(typeof when === 'number' ? new Date(when) : when);
    } catch {
        // fall through
    }
    const t = typeof when === 'number' ? when : Date.parse(when);
    if (!Number.isFinite(t)) return '';
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 90) return `${Math.round(s)}s`;
    if (s < 5400) return `${Math.round(s / 60)}m`;
    if (s < 172800) return `${Math.round(s / 3600)}h`;
    return `${Math.round(s / 86400)}d`;
}

/** A clock time, the way the user chose to read them. */
export function clock(when: number): string {
    try {
        if (k8sdockside.format) return k8sdockside.format.time(new Date(when));
    } catch {
        // fall through
    }
    const d = new Date(when);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ----- the tooltip --------------------------------------------------------------

let tipNode: HTMLElement | null = null;

function tipHost(): HTMLElement {
    if (tipNode && tipNode.isConnected) return tipNode;
    tipNode = el('div', { class: 'tip', role: 'tooltip', hidden: true });
    document.body.append(tipNode);
    return tipNode;
}

function place(tip: HTMLElement, x: number, y: number): void {
    const w = tip.offsetWidth || 180;
    const h = tip.offsetHeight || 40;
    const vw = document.documentElement.clientWidth || 800;
    let left = x + 14;
    if (left + w > vw - 8) left = Math.max(8, x - w - 14);
    let top = y - h - 10;
    if (top < 4) top = y + 18;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
}

/**
 * Hover (and keyboard focus) shows `lines` beside the pointer: the first line
 * bold, the rest as they are. Every mark on every chart has one, so no number
 * is only readable off an axis.
 */
export function tip<T extends Element>(node: T, lines: string[] | (() => string[])): T {
    const read = () => (typeof lines === 'function' ? lines() : lines);
    const show = (x: number, y: number) => {
        const t = tipHost();
        const [first, ...rest] = read();
        replace(t, el('strong', {}, first ?? ''), ...rest.map((l) => el('div', {}, l)));
        t.hidden = false;
        place(t, x, y);
    };
    const hide = () => {
        if (tipNode) tipNode.hidden = true;
    };
    node.addEventListener('mouseenter', (e) => show((e as MouseEvent).clientX, (e as MouseEvent).clientY));
    node.addEventListener('mousemove', (e) => {
        if (tipNode && !tipNode.hidden) place(tipNode, (e as MouseEvent).clientX, (e as MouseEvent).clientY);
    });
    node.addEventListener('mouseleave', hide);
    node.addEventListener('focus', () => {
        const r = node.getBoundingClientRect();
        show(r.left + r.width / 2, r.top);
    });
    node.addEventListener('blur', hide);
    return node;
}

export { el, replace };
