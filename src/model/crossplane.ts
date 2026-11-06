// The whole control plane, joined up: one call the pages make on every
// refresh, so the dashboard, the views and the panels never disagree about
// what is in the cluster.

import { apis, compositeKinds, kindsPerProvider, managedKinds, type Apis, type MRKind } from './apis.js';
import { classifier, events, type EventView } from './activity.js';
import { dependencyGraph, packages, parseSource, type DependencyGraph, type PackageView } from './packages.js';
import { worst, type Tone } from './tone.js';
import type { Pod, Snapshot } from './types.js';

export interface CorePod {
    name: string;
    namespace: string;
    component: 'crossplane' | 'rbac-manager';
    ready: boolean;
    restarts: number;
    waiting: string;
    version: string;
}

export interface Core {
    pods: CorePod[];
    version: string;
    tone: Tone;
}

/** Crossplane's own pods, recognised by the Helm chart's labels. */
export function core(pods: Pod[]): Core {
    const out: CorePod[] = [];
    for (const p of pods) {
        const l = p.metadata.labels ?? {};
        const app = l['app'] ?? '';
        if (app !== 'crossplane' && app !== 'crossplane-rbac-manager') continue;
        const statuses = p.status?.containerStatuses ?? [];
        const image = p.spec?.containers?.[0]?.image ?? statuses[0]?.image ?? '';
        out.push({
            name: p.metadata.name,
            namespace: p.metadata.namespace ?? '',
            component: app === 'crossplane' ? 'crossplane' : 'rbac-manager',
            ready: statuses.length > 0 && statuses.every((c) => c.ready),
            restarts: statuses.reduce((n, c) => n + (c.restartCount ?? 0), 0),
            waiting: statuses.map((c) => c.state?.waiting?.reason ?? '').find((r) => r && r !== 'ContainerCreating') ?? '',
            version: l['app.kubernetes.io/version'] ?? parseSource(image).version,
        });
    }
    out.sort((a, b) => a.component.localeCompare(b.component) || a.name.localeCompare(b.name));
    const main = out.find((p) => p.component === 'crossplane');
    return {
        pods: out,
        version: main?.version ?? '',
        tone: out.length === 0 ? '' : worst(out.map((p) => (p.ready ? 'ok' : p.waiting ? 'error' : 'warn'))),
    };
}

export interface Model {
    packages: PackageView[];
    providers: PackageView[];
    functions: PackageView[];
    configurations: PackageView[];
    graph: DependencyGraph;
    apis: Apis;
    kinds: MRKind[];
    perProvider: { provider: string; active: number; inactive: number }[];
    events: EventView[];
    core: Core;
    snap: Snapshot;
}

export function model(snap: Snapshot): Model {
    const pkgs = packages(snap);
    const providers = pkgs.filter((p) => p.type === 'Provider');
    const functions = pkgs.filter((p) => p.type === 'Function');
    const configurations = pkgs.filter((p) => p.type === 'Configuration');
    const graph = dependencyGraph(pkgs, snap.locks);
    const kinds = managedKinds(snap);
    // Every installed provider gets a row, even one that brings no kinds yet.
    const perProvider = kindsPerProvider(kinds);
    for (const p of providers) if (!perProvider.some((r) => r.provider === p.name)) perProvider.push({ provider: p.name, active: 0, inactive: 0 });
    const runtimePods = snap.pods.filter((p) => p.metadata.labels?.['pkg.crossplane.io/revision']);
    const list = events(snap.events, classifier(kinds, compositeKinds(snap), [...runtimePods, ...snap.pods.filter((p) => /^crossplane/.test(p.metadata.labels?.['app'] ?? ''))]));
    return {
        packages: pkgs,
        providers,
        functions,
        configurations,
        graph,
        apis: apis(snap, functions),
        kinds,
        perProvider,
        events: list,
        core: core(snap.pods),
        snap,
    };
}
