// The things every page in this plugin does the same way.
//
//  1. `start` wraps the page in one try/catch. Every bridge call rejects with
//     an Error carrying a sentence written for a person, so a failure is
//     shown as that sentence, not as a blank frame.
//  2. `load` reads everything the model needs in one go. Most of Crossplane's
//     kinds are optional -- MRDs and operations are v2 only, the protection
//     group is newer still -- and a kind the cluster does not serve is an
//     empty list, recorded as not served, never a failure.
//  3. Nothing subscribes to the theme: the SDK writes the app's tokens onto
//     :root and rewrites them when the user switches, so a stylesheet in
//     var(--text) follows along on its own.

import { model, type Model } from '../model/crossplane.js';
import { KIND, type Snapshot } from '../model/types.js';
import { el, replace } from './dom.js';

export function fail(host: HTMLElement, err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    replace(host, el('div', { class: 'failure' }, el('strong', {}, 'That did not work. '), el('span', {}, message)));
}

export function start(hostId: string, body: (ctx: K8sDockside.Context) => Promise<void>): void {
    const run = async () => {
        const host = document.getElementById(hostId);
        try {
            const ctx = await k8sdockside.ready();
            await body(ctx);
        } catch (err) {
            if (host) fail(host, err);
        }
    };
    void run();
}

/** Runs `body` now and every `ms` after, handing anything it throws to `onError`. */
export function every(ms: number, body: () => Promise<void>, onError: (err: unknown) => void): () => void {
    let stopped = false;
    let running = false;
    const tick = async () => {
        if (stopped || running) return;
        running = true;
        try {
            await body();
        } catch (err) {
            onError(err);
        } finally {
            running = false;
        }
    };
    void tick();
    const timer = setInterval(() => void tick(), ms);
    return () => {
        stopped = true;
        clearInterval(timer);
    };
}

async function maybe<T>(query: K8sDockside.ListQuery): Promise<T[] | null> {
    try {
        return (await k8sdockside.list(query)) as unknown as T[];
    } catch {
        return null;
    }
}

export interface Loaded {
    snap: Snapshot;
    /** Whether the cluster serves Crossplane at all. */
    installed: boolean;
}

/** Everything the model is built from, read at once. */
export async function load(): Promise<Loaded> {
    const keys = Object.keys(KIND).filter((k) => k !== 'pods' && k !== 'clusterUsages') as (keyof typeof KIND)[];
    const [lists, usages, clusterUsages, runtimePods, corePods] = await Promise.all([
        Promise.all(keys.map((k) => maybe<never>({ kind: KIND[k] }))),
        maybe<never>({ kind: KIND.usages }),
        maybe<never>({ kind: KIND.clusterUsages }),
        // Only the pods that are Crossplane's: a package's runtime, and its own.
        maybe<never>({ kind: KIND.pods, selector: 'pkg.crossplane.io/revision' }),
        maybe<never>({ kind: KIND.pods, selector: 'app in (crossplane,crossplane-rbac-manager)' }),
    ]);
    const got = new Map(keys.map((k, i) => [k, lists[i] ?? null]));
    const served: Record<string, boolean> = {};
    for (const [k, v] of got) served[k] = v !== null;
    const list = <T>(k: keyof typeof KIND): T[] => (got.get(k) ?? []) as T[];
    const pods = [...(runtimePods ?? []), ...(corePods ?? [])] as Snapshot['pods'];
    const seen = new Set<string>();
    const snap: Snapshot = {
        providers: list('providers'),
        functions: list('functions'),
        configurations: list('configurations'),
        providerRevisions: list('providerRevisions'),
        functionRevisions: list('functionRevisions'),
        configurationRevisions: list('configurationRevisions'),
        locks: list('locks'),
        runtimeConfigs: list('runtimeConfigs'),
        imageConfigs: list('imageConfigs'),
        xrds: list('xrds'),
        compositions: list('compositions'),
        compositionRevisions: list('compositionRevisions'),
        environmentConfigs: list('environmentConfigs'),
        mrds: list('mrds'),
        mraps: list('mraps'),
        operations: list('operations'),
        cronOperations: list('cronOperations'),
        watchOperations: list('watchOperations'),
        usages: [...(usages ?? []), ...(clusterUsages ?? [])],
        crds: list('crds'),
        events: list('events'),
        pods: pods.filter((p) => {
            const key = `${p.metadata.namespace}/${p.metadata.name}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }),
        served,
    };
    return { snap, installed: served['providers'] === true && served['xrds'] === true };
}

/** Load and model in one, for pages that want both. */
export async function read(): Promise<{ installed: boolean; m: Model }> {
    const { snap, installed } = await load();
    return { installed, m: model(snap) };
}

/** Remembered per plugin and cluster, where the app can; forgotten otherwise. */
export const remember = {
    async get<T>(key: string): Promise<T | null> {
        try {
            return ((await k8sdockside.storage?.get(key)) as T | null) ?? null;
        } catch {
            return null;
        }
    },
    async set(key: string, value: unknown): Promise<void> {
        try {
            await k8sdockside.storage?.set(key, value);
        } catch {
            // The page works the same without it.
        }
    },
};

/**
 * What a refresh compares to decide whether to redraw: the objects without
 * their churn. Events and pods change every few seconds; resourceVersion and
 * managedFields would make every read look new.
 */
export function fingerprint(value: unknown): string {
    return JSON.stringify(value, (key, v) => (key === 'resourceVersion' || key === 'managedFields' ? undefined : v));
}

/** The page's own "not installed" block: the API is not here, and how to get it. */
export function notInstalled(ctx: K8sDockside.Context): HTMLElement {
    const go = (label: string, url: string, primary = false) => {
        const b = el('button', { type: 'button', class: primary ? 'primary' : undefined }, label);
        b.addEventListener('click', () => void k8sdockside.openUrl(url));
        return b;
    };
    return el(
        'section',
        { class: 'block hero-empty' },
        el('img', { src: 'logo.svg', alt: '', width: 64, height: 64 }),
        el('h2', {}, 'Crossplane is not installed here'),
        el('p', { class: 'note' }, `${ctx.contextName} does not serve pkg.crossplane.io and apiextensions.crossplane.io, so there are no providers, APIs or compositions to draw. Crossplane installs with one Helm chart.`),
        el('pre', { class: 'mono snippet' }, 'helm repo add crossplane-stable https://charts.crossplane.io/stable\nhelm install crossplane --namespace crossplane-system --create-namespace crossplane-stable/crossplane'),
        el('div', { class: 'links' }, go('Get started with Crossplane', 'https://docs.crossplane.io/latest/get-started/', true), go('Install guide', 'https://docs.crossplane.io/latest/get-started/install/'), go('crossplane.io', 'https://www.crossplane.io/')),
    );
}
