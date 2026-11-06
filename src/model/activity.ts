// What Crossplane did, from the cluster's Events.
//
// Events are the one place the health of every managed resource and composite
// resource shows up without the plugin having to name its kind: a provider
// that cannot create a bucket records `CannotCreateExternalResource` on it,
// a composite that cannot compose records `ComposeResources`. So the activity
// model keeps every Event about a Crossplane object -- a package, an API, a
// composite, a managed resource, an operation, or a package's runtime pod --
// and sorts it into one of those areas.
//
// The API server keeps Events for about an hour by default, so "the last
// hour" is what there is to draw, and the page says so.

import { CORE_GROUPS, groupOf, type KubeEvent, type Pod } from './types.js';
import type { MRKind } from './apis.js';

export type Area = 'package' | 'api' | 'composite' | 'managed' | 'operation' | 'runtime';

export const AREAS: Area[] = ['managed', 'composite', 'api', 'package', 'runtime', 'operation'];

export const AREA_WORD: Record<Area, string> = {
    managed: 'Managed resources',
    composite: 'Composite resources',
    api: 'APIs & compositions',
    package: 'Packages',
    runtime: 'Provider & function pods',
    operation: 'Operations',
};

export interface EventView {
    key: string;
    warning: boolean;
    reason: string;
    message: string;
    count: number;
    /** Milliseconds since the epoch. */
    first: number;
    last: number;
    area: Area;
    object: { apiVersion: string; group: string; kind: string; name: string; namespace: string };
    /** The provider a managed resource belongs to, when known. */
    provider: string;
    /** The app kind to open the object with, when it is one the app can open. */
    appKind: string;
}

function ms(...values: (string | null | undefined)[]): number {
    for (const v of values) {
        if (!v) continue;
        const t = Date.parse(v);
        if (Number.isFinite(t)) return t;
    }
    return NaN;
}

export interface Classifier {
    managed: Map<string, MRKind>;
    composites: Map<string, string>;
    pods: Set<string>;
}

export function classifier(kinds: MRKind[], composites: Map<string, string>, pods: Pod[]): Classifier {
    const managed = new Map<string, MRKind>();
    for (const k of kinds) managed.set(`${k.group}/${k.kind}`, k);
    return { managed, composites, pods: new Set(pods.map((p) => `${p.metadata.namespace ?? ''}/${p.metadata.name}`)) };
}

const PKG_PLURAL: Record<string, string> = {
    Provider: 'providers',
    Function: 'functions',
    Configuration: 'configurations',
    ProviderRevision: 'providerrevisions',
    FunctionRevision: 'functionrevisions',
    ConfigurationRevision: 'configurationrevisions',
    DeploymentRuntimeConfig: 'deploymentruntimeconfigs',
    ImageConfig: 'imageconfigs',
    CompositeResourceDefinition: 'compositeresourcedefinitions',
    Composition: 'compositions',
    CompositionRevision: 'compositionrevisions',
    ManagedResourceDefinition: 'managedresourcedefinitions',
    ManagedResourceActivationPolicy: 'managedresourceactivationpolicies',
    EnvironmentConfig: 'environmentconfigs',
    Operation: 'operations',
    CronOperation: 'cronoperations',
    WatchOperation: 'watchoperations',
    Usage: 'usages',
    ClusterUsage: 'clusterusages',
};

/** One Event, if it is about Crossplane; `null` otherwise. */
export function eventView(e: KubeEvent, c: Classifier): EventView | null {
    const o = e.involvedObject ?? {};
    const group = groupOf(o.apiVersion);
    const kind = o.kind ?? '';
    let area: Area | null = null;
    let provider = '';
    let appKind = '';
    if (group === 'pkg.crossplane.io') area = 'package';
    else if (group === 'ops.crossplane.io') area = 'operation';
    else if (CORE_GROUPS.includes(group)) area = 'api';
    else if (c.managed.has(`${group}/${kind}`)) {
        const k = c.managed.get(`${group}/${kind}`);
        area = 'managed';
        provider = k?.provider ?? '';
        appKind = k?.served ? k.appKind : '';
    } else if (c.composites.has(`${group}/${kind}`)) {
        area = 'composite';
        appKind = c.composites.get(`${group}/${kind}`) ?? '';
    }
    else if (kind === 'Pod' && c.pods.has(`${o.namespace ?? e.metadata.namespace ?? ''}/${o.name ?? ''}`)) {
        area = 'runtime';
        appKind = 'pods';
    }
    if (!area) return null;
    if (!appKind && CORE_GROUPS.includes(group) && PKG_PLURAL[kind]) appKind = `crd:${PKG_PLURAL[kind]}.${group}`;
    const last = ms(e.lastTimestamp, e.series?.lastObservedTime, e.eventTime, e.firstTimestamp, e.metadata.creationTimestamp);
    const first = ms(e.firstTimestamp, e.eventTime, e.lastTimestamp, e.metadata.creationTimestamp);
    return {
        key: e.metadata.uid ?? `${e.metadata.namespace}/${e.metadata.name}`,
        warning: e.type === 'Warning',
        reason: e.reason ?? '',
        message: (e.message ?? '').trim(),
        count: Math.max(1, e.series?.count ?? e.count ?? 1),
        first: Number.isFinite(first) ? first : last,
        last,
        area,
        object: { apiVersion: o.apiVersion ?? '', group, kind, name: o.name ?? '', namespace: o.namespace ?? '' },
        provider,
        appKind,
    };
}

export function events(list: KubeEvent[], c: Classifier): EventView[] {
    return list
        .map((e) => eventView(e, c))
        .filter((e): e is EventView => !!e && Number.isFinite(e.last))
        .sort((a, b) => b.last - a.last);
}

// ----- time bins -------------------------------------------------------------------

export interface Bin {
    start: number;
    end: number;
    normal: number;
    warning: number;
}

/**
 * Occurrences per bin over the `window` before `now`. An Event that happened
 * `count` times between `first` and `last` is spread evenly over that span --
 * the API server keeps one object per repeating event, not one per time --
 * so a provider retrying every thirty seconds reads as a steady band rather
 * than one spike at its latest retry.
 */
export function bins(list: EventView[], now: number, window: number, n: number, filter: (e: EventView) => boolean = () => true): Bin[] {
    const size = window / n;
    const start = now - window;
    const out: Bin[] = Array.from({ length: n }, (_, i) => ({ start: start + i * size, end: start + (i + 1) * size, normal: 0, warning: 0 }));
    for (const e of list) {
        if (!filter(e)) continue;
        const span = Math.max(0, e.last - e.first);
        // A retry loop can be tens of thousands strong; 240 samples of it draw the same.
        const steps = span === 0 ? 1 : Math.min(e.count, 240);
        const weight = e.count / steps;
        for (let i = 0; i < steps; i++) {
            const t = steps === 1 ? e.last : e.first + (span * i) / (steps - 1);
            if (t < start || t > now) continue;
            const idx = Math.min(n - 1, Math.floor((t - start) / size));
            const bin = out[idx];
            if (!bin) continue;
            if (e.warning) bin.warning += weight;
            else bin.normal += weight;
        }
    }
    for (const b of out) {
        b.normal = Math.round(b.normal);
        b.warning = Math.round(b.warning);
    }
    return out;
}

/** Occurrences inside the window: what a tile should count. */
export function occurrences(list: EventView[], now: number, window: number, filter: (e: EventView) => boolean = () => true): { normal: number; warning: number } {
    const b = bins(list, now, window, 1, filter)[0];
    return { normal: b?.normal ?? 0, warning: b?.warning ?? 0 };
}

/** Rows of areas by columns of time: the activity heatmap. */
export function heatmap(list: EventView[], now: number, window: number, n: number): { area: Area; cells: Bin[] }[] {
    return AREAS.map((area) => ({ area, cells: bins(list, now, window, n, (e) => e.area === area) })).filter((r) => r.cells.some((c) => c.normal + c.warning > 0));
}

/** Warnings counted by reason, most first. */
export function byReason(list: EventView[], filter: (e: EventView) => boolean = (e) => e.warning): { reason: string; count: number; objects: number }[] {
    const map = new Map<string, { reason: string; count: number; objects: Set<string> }>();
    for (const e of list) {
        if (!filter(e)) continue;
        const row = map.get(e.reason) ?? { reason: e.reason || 'no reason', count: 0, objects: new Set<string>() };
        row.count += e.count;
        row.objects.add(`${e.object.kind}/${e.object.namespace}/${e.object.name}`);
        map.set(e.reason, row);
    }
    return [...map.values()].map((r) => ({ reason: r.reason, count: r.count, objects: r.objects.size })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

export interface Failing {
    key: string;
    object: EventView['object'];
    area: Area;
    provider: string;
    appKind: string;
    reason: string;
    message: string;
    count: number;
    last: number;
}

/** Each object with a Warning, its latest one, most recent first. */
export function failing(list: EventView[], filter: (e: EventView) => boolean = () => true): Failing[] {
    const map = new Map<string, Failing>();
    for (const e of list) {
        if (!e.warning || !filter(e)) continue;
        const key = `${e.object.group}/${e.object.kind}/${e.object.namespace}/${e.object.name}`;
        const row = map.get(key);
        if (!row) map.set(key, { key, object: e.object, area: e.area, provider: e.provider, appKind: e.appKind, reason: e.reason, message: e.message, count: e.count, last: e.last });
        else {
            row.count += e.count;
            if (e.last > row.last) Object.assign(row, { reason: e.reason, message: e.message, last: e.last });
        }
    }
    return [...map.values()].sort((a, b) => b.last - a.last);
}
