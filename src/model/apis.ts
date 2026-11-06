// The APIs a platform team defines, and what serves them.
//
//   XRD           defines a composite resource kind (and in v1 style, a claim)
//   Composition   says how to compose one kind of XR: a pipeline of functions
//   Function      a package that runs one pipeline step
//
// and the managed resource kinds the providers bring, which the plugin cannot
// list one by one -- they are hundreds of kinds no manifest can name ahead --
// but can map from their definitions: every MR CRD carries the `managed`
// category and is owned by the ProviderRevision that installed it, and in
// Crossplane v2 every one has a ManagedResourceDefinition that says whether
// it is active at all.

import { isTrue, positiveTone, worst, type Tone } from './tone.js';
import { groupOf, KIND, type Composition, type CRD, type MRD, type PackageRevision, type Snapshot, type XRD } from './types.js';
import type { PackageView, Ref } from './packages.js';

export interface StepView {
    step: string;
    functionName: string;
    fn: PackageView | null;
    /** `Resources.pt.fn.crossplane.io`, say: what the step is handed. */
    input: string;
    tone: Tone;
}

export interface CompositionView {
    name: string;
    ref: Ref;
    kind: string;
    apiVersion: string;
    group: string;
    mode: string;
    legacy: boolean;
    steps: StepView[];
    revisions: number;
    latestRevision: number;
    api: string | null;
    isDefault: boolean;
    tone: Tone;
    labels: Record<string, string>;
}

export type Scope = 'Namespaced' | 'Cluster' | 'LegacyCluster';

export interface APIView {
    key: string;
    name: string;
    ref: Ref;
    group: string;
    kind: string;
    plural: string;
    scope: Scope;
    claimKind: string;
    versions: { name: string; served: boolean; referenceable: boolean }[];
    referenceable: string;
    established: boolean | null;
    offered: boolean | null;
    tone: Tone;
    compositions: CompositionView[];
    defaultComposition: string;
    /** The app kind of the composite resources themselves, when the cluster serves it. */
    xrKind: string;
}

function scopeOf(x: XRD): Scope {
    const s = x.spec?.scope;
    if (s === 'Namespaced' || s === 'Cluster' || s === 'LegacyCluster') return s;
    // An XRD read as v1 has no scope field: it is a v1 XRD, which v2 runs as LegacyCluster.
    if ((x.apiVersion ?? '').endsWith('/v1') || x.spec?.claimNames) return 'LegacyCluster';
    return 'Namespaced';
}

function inputKind(input: { apiVersion?: string; kind?: string } | undefined): string {
    if (!input) return '';
    const group = groupOf(input.apiVersion);
    return input.kind ? (group ? `${input.kind}.${group}` : input.kind) : '';
}

export function compositionView(c: Composition, fns: Map<string, PackageView>, revisions: number[], api: string | null, isDefault: boolean): CompositionView {
    const ref = c.spec?.compositeTypeRef ?? {};
    const legacy = (c.spec?.mode ?? 'Pipeline') !== 'Pipeline' || (!c.spec?.pipeline?.length && !!c.spec?.resources?.length);
    const steps: StepView[] = (c.spec?.pipeline ?? []).map((s) => {
        const name = s.functionRef?.name ?? '';
        const fn = fns.get(name) ?? null;
        return { step: s.step, functionName: name, fn, input: inputKind(s.input), tone: fn ? (fn.tone === 'ok' ? 'ok' : fn.tone) : 'error' };
    });
    return {
        name: c.metadata.name,
        ref: { kind: KIND.compositions, name: c.metadata.name },
        kind: ref.kind ?? '',
        apiVersion: ref.apiVersion ?? '',
        group: groupOf(ref.apiVersion),
        mode: c.spec?.mode ?? 'Pipeline',
        legacy,
        steps,
        revisions: revisions.length,
        latestRevision: revisions.length ? Math.max(...revisions) : 0,
        api,
        isDefault,
        tone: worst([api ? 'ok' : 'error', legacy ? 'warn' : 'ok', steps.length === 0 && !legacy ? 'error' : 'ok', ...steps.map((s) => s.tone)]),
        labels: c.metadata.labels ?? {},
    };
}

export interface Apis {
    apis: APIView[];
    compositions: CompositionView[];
    /** Compositions whose compositeTypeRef names no XRD in the cluster. */
    orphans: CompositionView[];
    /** How many pipeline steps each Function runs, across every Composition. */
    functionUse: { name: string; fn: PackageView | null; compositions: number; steps: number }[];
}

export function apis(snap: Snapshot, functions: PackageView[]): Apis {
    const fns = new Map(functions.map((f) => [f.name, f]));
    const revs = new Map<string, number[]>();
    for (const r of snap.compositionRevisions) {
        const owner = r.metadata.labels?.['crossplane.io/composition-name'] ?? r.metadata.ownerReferences?.[0]?.name ?? '';
        if (!owner) continue;
        const list = revs.get(owner) ?? [];
        list.push(r.spec?.revision ?? 0);
        revs.set(owner, list);
    }
    const byType = new Map<string, XRD>();
    for (const x of snap.xrds) {
        const group = x.spec?.group ?? '';
        const kind = x.spec?.names?.kind ?? '';
        byType.set(`${group}/${kind}`, x);
    }
    const compositions = snap.compositions.map((c) => {
        const ref = c.spec?.compositeTypeRef ?? {};
        const x = byType.get(`${groupOf(ref.apiVersion)}/${ref.kind ?? ''}`);
        const isDefault = !!x && x.spec?.defaultCompositionRef?.name === c.metadata.name;
        return compositionView(c, fns, revs.get(c.metadata.name) ?? [], x ? x.metadata.name : null, isDefault);
    });
    compositions.sort((a, b) => a.name.localeCompare(b.name));

    const servedCRDs = new Set(snap.crds.map((c) => c.metadata.name));
    const list: APIView[] = snap.xrds.map((x) => {
        const conditions = x.status?.conditions ?? [];
        const scope = scopeOf(x);
        const claimKind = x.spec?.claimNames?.kind ?? '';
        const versions = (x.spec?.versions ?? []).map((v) => ({ name: v.name, served: v.served !== false, referenceable: !!v.referenceable }));
        const mine = compositions.filter((c) => c.api === x.metadata.name);
        const established = isTrue(conditions, 'Established');
        const offered = claimKind ? isTrue(conditions, 'Offered') : null;
        const plural = x.spec?.names?.plural ?? '';
        const group = x.spec?.group ?? '';
        const crdName = `${plural}.${group}`;
        return {
            key: x.metadata.name,
            name: x.metadata.name,
            ref: { kind: KIND.xrds, name: x.metadata.name },
            group,
            kind: x.spec?.names?.kind ?? '',
            plural,
            scope,
            claimKind,
            versions,
            referenceable: versions.find((v) => v.referenceable)?.name ?? '',
            established,
            offered,
            tone: worst([positiveTone(conditions, 'Established'), claimKind ? positiveTone(conditions, 'Offered') : 'ok', mine.length === 0 ? 'warn' : 'ok', ...mine.map((c) => (c.tone === 'error' ? 'warn' : c.tone))]),
            compositions: mine,
            defaultComposition: x.spec?.defaultCompositionRef?.name ?? '',
            xrKind: servedCRDs.has(crdName) ? `crd:${crdName}` : '',
        };
    });
    list.sort((a, b) => a.kind.localeCompare(b.kind));

    const use = new Map<string, { name: string; fn: PackageView | null; compositions: Set<string>; steps: number }>();
    for (const f of functions) use.set(f.name, { name: f.name, fn: f, compositions: new Set(), steps: 0 });
    for (const c of compositions) {
        for (const s of c.steps) {
            const u = use.get(s.functionName) ?? { name: s.functionName, fn: null, compositions: new Set<string>(), steps: 0 };
            u.compositions.add(c.name);
            u.steps++;
            use.set(s.functionName, u);
        }
    }
    const functionUse = [...use.values()].map((u) => ({ name: u.name, fn: u.fn, compositions: u.compositions.size, steps: u.steps })).sort((a, b) => b.steps - a.steps || a.name.localeCompare(b.name));

    return { apis: list, compositions, orphans: compositions.filter((c) => !c.api), functionUse };
}

// ----- managed resource kinds --------------------------------------------------------

export interface MRKind {
    /** `buckets.s3.aws.upbound.io`, the CRD's and the MRD's name. */
    key: string;
    kind: string;
    plural: string;
    group: string;
    /** The Provider that installed it, by name; `''` when nothing says. */
    provider: string;
    state: 'Active' | 'Inactive';
    /** Whether the cluster serves the CRD, so its objects can be opened as a table. */
    served: boolean;
    scope: string;
    appKind: string;
}

/** The provider a definition belongs to, from its owner references: a ProviderRevision, or the Provider. */
function providerOwner(owners: { kind?: string; name?: string }[] | undefined, revisionToPackage: Map<string, string>): string {
    for (const o of owners ?? []) {
        if (o.kind === 'ProviderRevision' && o.name) return revisionToPackage.get(o.name) ?? o.name.replace(/-[0-9a-f]{12}$/, '');
        if (o.kind === 'Provider' && o.name) return o.name;
    }
    return '';
}

export function revisionPackages(revisions: PackageRevision[]): Map<string, string> {
    const out = new Map<string, string>();
    for (const r of revisions) {
        const pkg = r.metadata.labels?.['pkg.crossplane.io/package'] ?? r.metadata.ownerReferences?.find((o) => o.kind === 'Provider')?.name;
        if (pkg) out.set(r.metadata.name, pkg);
    }
    return out;
}

function isManaged(c: CRD): boolean {
    return !!c.spec?.names?.categories?.includes('managed');
}

/**
 * Every managed resource kind: the MRDs (v2, active or not) joined with the
 * CRDs in the `managed` category (every Crossplane version, active only).
 */
export function managedKinds(snap: Snapshot): MRKind[] {
    const owners = revisionPackages(snap.providerRevisions);
    const crds = new Map(snap.crds.filter(isManaged).map((c) => [c.metadata.name, c]));
    const out = new Map<string, MRKind>();
    const add = (key: string, def: MRD | CRD, state: 'Active' | 'Inactive') => {
        const spec = def.spec ?? {};
        const crd = crds.get(key);
        const provider = providerOwner(def.metadata.ownerReferences, owners) || providerOwner(crd?.metadata.ownerReferences, owners);
        out.set(key, {
            key,
            kind: spec.names?.kind ?? key,
            plural: spec.names?.plural ?? key.split('.')[0] ?? key,
            group: spec.group ?? key.split('.').slice(1).join('.'),
            provider,
            state,
            served: !!crd,
            scope: spec.scope ?? '',
            appKind: `crd:${key}`,
        });
    };
    for (const m of snap.mrds) add(m.metadata.name, m, m.spec?.state === 'Inactive' ? 'Inactive' : 'Active');
    for (const [key, c] of crds) if (!out.has(key)) add(key, c, 'Active');
    return [...out.values()].sort((a, b) => a.provider.localeCompare(b.provider) || a.group.localeCompare(b.group) || a.kind.localeCompare(b.kind));
}

/**
 * Composite resource (and claim) kinds, `group/Kind` -> the app kind to open
 * one with: `crd:<plural>.<group>` when the cluster serves its CRD, `''` when
 * only the XRD says it exists.
 */
export function compositeKinds(snap: Snapshot): Map<string, string> {
    const out = new Map<string, string>();
    for (const c of snap.crds) {
        const cats = c.spec?.names?.categories ?? [];
        if (cats.includes('composite') || cats.includes('claim') || c.metadata.ownerReferences?.some((o) => o.kind === 'CompositeResourceDefinition')) out.set(`${c.spec?.group ?? ''}/${c.spec?.names?.kind ?? ''}`, `crd:${c.metadata.name}`);
    }
    for (const x of snap.xrds) {
        const group = x.spec?.group ?? '';
        for (const kind of [x.spec?.names?.kind, x.spec?.claimNames?.kind]) if (kind && !out.has(`${group}/${kind}`)) out.set(`${group}/${kind}`, '');
    }
    return out;
}

/** Provider name -> how many managed kinds, split active and inactive, largest first. */
export function kindsPerProvider(kinds: MRKind[]): { provider: string; active: number; inactive: number }[] {
    const map = new Map<string, { provider: string; active: number; inactive: number }>();
    for (const k of kinds) {
        const name = k.provider || 'unknown provider';
        const row = map.get(name) ?? { provider: name, active: 0, inactive: 0 };
        if (k.state === 'Active') row.active++;
        else row.inactive++;
        map.set(name, row);
    }
    return [...map.values()].sort((a, b) => b.active + b.inactive - (a.active + a.inactive) || a.provider.localeCompare(b.provider));
}
