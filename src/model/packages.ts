// The package manager: Providers, Functions and Configurations, their
// revisions, the runtime pods behind them, and the dependency graph the Lock
// records.
//
// A package is the object you create; a revision is one version of it, and
// exactly one revision is Active. The package's own conditions summarise the
// active revision (Installed, Healthy), so they are the truth, and the
// revisions are the history behind it. The Lock is the package manager's own
// record of what it resolved: one entry per installed revision, with the
// dependencies each package's metadata declared.

import { badConditions, isTrue, worst, type Tone } from './tone.js';
import { PACKAGE_KIND, type Condition, type Lock, type Package, type PackageRevision, type PackageType, type Pod, type Snapshot } from './types.js';

export interface Ref {
    kind: string;
    name: string;
    namespace?: string;
}

/** An OCI package reference, split the way people read it. */
export interface PackageSource {
    /** The whole reference without the tag: `xpkg.crossplane.io/crossplane-contrib/provider-nop`. */
    source: string;
    registry: string;
    /** Everything between the registry and the name: `crossplane-contrib`. */
    org: string;
    /** The last path element: `provider-nop`. */
    repo: string;
    /** A tag or a digest, `''` when neither is given. */
    version: string;
}

/** The registry Crossplane resolves a reference without one against (v2 and newer). */
export const DEFAULT_REGISTRY = 'xpkg.crossplane.io';

export function parseSource(ref: string | undefined): PackageSource {
    const raw = (ref ?? '').trim();
    if (!raw) return { source: '', registry: '', org: '', repo: '', version: '' };
    let rest = raw;
    let version = '';
    const at = rest.indexOf('@');
    if (at >= 0) {
        version = rest.slice(at + 1);
        rest = rest.slice(0, at);
    } else {
        const colon = rest.lastIndexOf(':');
        if (colon > rest.lastIndexOf('/')) {
            version = rest.slice(colon + 1);
            rest = rest.slice(0, colon);
        }
    }
    const parts = rest.split('/');
    const first = parts[0] ?? '';
    const hasRegistry = parts.length > 1 && (first.includes('.') || first.includes(':') || first === 'localhost');
    const registry = hasRegistry ? first : DEFAULT_REGISTRY;
    const path = hasRegistry ? parts.slice(1) : parts;
    const repo = path[path.length - 1] ?? '';
    const org = path.slice(0, -1).join('/');
    const source = hasRegistry ? rest : `${DEFAULT_REGISTRY}/${rest}`;
    return { source, registry, org, repo, version: version.startsWith('sha256:') ? version.slice(0, 19) : version };
}

export type PackageState = 'healthy' | 'unhealthy' | 'installing' | 'waiting';

export const STATE_WORD: Record<PackageState, string> = {
    healthy: 'Healthy',
    unhealthy: 'Unhealthy',
    installing: 'Installing',
    waiting: 'No status yet',
};

export const STATE_TONE: Record<PackageState, Tone> = {
    healthy: 'ok',
    unhealthy: 'error',
    installing: 'warn',
    waiting: 'warn',
};

export interface RevisionView {
    name: string;
    revision: number;
    active: boolean;
    healthy: boolean | null;
    tone: Tone;
    version: string;
    created: string;
    /** How many objects (CRDs, above all) the revision installed. */
    objects: number;
    invalidDependencies: number;
    conditions: Condition[];
    ref: Ref;
}

export interface Runtime {
    pods: number;
    ready: number;
    restarts: number;
    /** The worst waiting reason a container is in, `CrashLoopBackOff` say. */
    waiting: string;
    /** The pod to open: the first one not ready, or the first one. */
    pod: { namespace: string; name: string } | null;
}

export interface PackageView {
    key: string;
    type: PackageType;
    name: string;
    ref: Ref;
    src: PackageSource;
    state: PackageState;
    tone: Tone;
    installed: boolean | null;
    healthy: boolean | null;
    conditions: Condition[];
    /** The first condition that is not True, for a one-line reason. */
    trouble: Condition | null;
    revisions: RevisionView[];
    active: RevisionView | null;
    activationPolicy: string;
    runtimeConfig: string;
    runtime: Runtime | null;
    created: string;
    /** The packages this one depends on, as the Lock resolved them. */
    dependsOn: string[];
    /** The packages that depend on this one. */
    usedBy: string[];
}

function revisionsOf(pkg: Package, all: PackageRevision[]): PackageRevision[] {
    const name = pkg.metadata.name;
    return all.filter((r) => r.metadata.labels?.['pkg.crossplane.io/package'] === name || r.metadata.ownerReferences?.some((o) => o.kind === pkg.kind && o.name === name) || r.metadata.ownerReferences?.some((o) => o.name === name && o.controller));
}

function revisionView(r: PackageRevision, kind: string): RevisionView {
    const healthy = isTrue(r.status?.conditions, 'Healthy');
    const runtime = isTrue(r.status?.conditions, 'RuntimeHealthy');
    const active = r.spec?.desiredState === 'Active';
    const bad = healthy === false || runtime === false || (r.status?.invalidDependencies ?? 0) > 0;
    return {
        name: r.metadata.name,
        revision: r.spec?.revision ?? 0,
        active,
        healthy: healthy === null ? null : healthy && runtime !== false,
        tone: !active ? '' : bad ? 'error' : healthy === true ? 'ok' : 'warn',
        version: parseSource(r.status?.resolvedImage || r.spec?.image).version,
        created: r.metadata.creationTimestamp ?? '',
        objects: r.status?.objectRefs?.length ?? 0,
        invalidDependencies: r.status?.invalidDependencies ?? 0,
        conditions: r.status?.conditions ?? [],
        ref: { kind: kind.replace(/s\.pkg/, 'revisions.pkg'), name: r.metadata.name },
    };
}

function runtimeOf(pkg: Package, type: PackageType, revisions: RevisionView[], pods: Pod[]): Runtime | null {
    if (type === 'Configuration') return null;
    const label = type === 'Provider' ? 'pkg.crossplane.io/provider' : 'pkg.crossplane.io/function';
    const names = new Set(revisions.map((r) => r.name));
    const mine = pods.filter((p) => p.metadata.labels?.[label] === pkg.metadata.name || names.has(p.metadata.labels?.['pkg.crossplane.io/revision'] ?? ''));
    let ready = 0;
    let restarts = 0;
    let waiting = '';
    let pick: Pod | undefined;
    for (const p of mine) {
        const statuses = p.status?.containerStatuses ?? [];
        if (statuses.length && statuses.every((c) => c.ready)) ready++;
        else pick ??= p;
        for (const c of statuses) {
            restarts += c.restartCount ?? 0;
            const reason = c.state?.waiting?.reason;
            if (reason && reason !== 'ContainerCreating') waiting = reason;
        }
    }
    pick ??= mine[0];
    return { pods: mine.length, ready, restarts, waiting, pod: pick ? { namespace: pick.metadata.namespace ?? '', name: pick.metadata.name } : null };
}

function stateOf(installed: boolean | null, healthy: boolean | null, conditions: Condition[]): PackageState {
    if (installed === false || healthy === false) {
        // Crossplane uses the reason UnpackPackage both while it unpacks and
        // when unpacking failed; only the message tells them apart. A first
        // revision not yet active (InactivePackageRevision) is installing.
        const installed_ = conditions.find((c) => c.type === 'Installed');
        const failed = /cannot|fail|error|unauthori[sz]ed|denied|not found|invalid|refused/i.test(installed_?.message ?? '');
        if (healthy !== false && !failed && /Unpack|Inactive/.test(installed_?.reason ?? '')) return 'installing';
        return 'unhealthy';
    }
    if (installed === true && healthy === true) return 'healthy';
    if (conditions.length === 0) return 'waiting';
    return 'installing';
}

export function packageView(pkg: Package, type: PackageType, revisions: PackageRevision[], pods: Pod[]): PackageView {
    const kind = PACKAGE_KIND[type];
    const conditions = pkg.status?.conditions ?? [];
    const installed = isTrue(conditions, 'Installed');
    const healthy = isTrue(conditions, 'Healthy');
    const revs = revisionsOf(pkg, revisions)
        .map((r) => revisionView(r, kind))
        .sort((a, b) => a.revision - b.revision || a.created.localeCompare(b.created));
    const active = revs.find((r) => r.active) ?? null;
    const state = stateOf(installed, healthy, conditions);
    const runtime = runtimeOf(pkg, type, revs, pods);
    const runtimeTone: Tone = runtime && runtime.pods > 0 && runtime.ready < runtime.pods ? (runtime.waiting ? 'error' : 'warn') : 'ok';
    return {
        key: `${type}/${pkg.metadata.name}`,
        type,
        name: pkg.metadata.name,
        ref: { kind, name: pkg.metadata.name },
        src: parseSource(pkg.spec?.package),
        state,
        tone: worst([STATE_TONE[state], runtimeTone, active?.tone ?? 'ok']),
        installed,
        healthy,
        conditions,
        trouble: badConditions(conditions)[0] ?? badConditions(active?.conditions)[0] ?? null,
        revisions: revs,
        active,
        activationPolicy: pkg.spec?.revisionActivationPolicy ?? 'Automatic',
        runtimeConfig: pkg.spec?.runtimeConfigRef?.name ?? (type === 'Configuration' ? '' : 'default'),
        runtime,
        created: pkg.metadata.creationTimestamp ?? '',
        dependsOn: [],
        usedBy: [],
    };
}

// ----- the dependency graph ------------------------------------------------------

export interface GraphNode {
    id: string;
    /** The package this node is, when it is installed. */
    pkg: PackageView | null;
    type: PackageType | string;
    label: string;
    source: string;
    version: string;
    tone: Tone;
    /** A dependency the Lock names that no installed package satisfies. */
    missing: boolean;
    depth: number;
}

export interface GraphEdge {
    from: string;
    to: string;
    constraints: string;
    missing: boolean;
}

export interface DependencyGraph {
    nodes: GraphNode[];
    edges: GraphEdge[];
}

function lockType(p: { type?: string; kind?: string }): string {
    return p.kind || p.type || 'Provider';
}

/** Strips a tag and a registry default, so `provider-nop` and `xpkg.crossplane.io/…/provider-nop` meet. */
function sourceKey(source: string): string {
    return parseSource(source).source.toLowerCase();
}

/**
 * The graph the Lock describes, joined to the installed packages. Packages
 * that are not in the Lock (skipDependencyResolution, or a Lock this
 * Crossplane does not keep) still appear, unconnected, so the drawing never
 * hides something installed.
 */
export function dependencyGraph(packages: PackageView[], locks: Lock[]): DependencyGraph {
    const bySource = new Map<string, PackageView>();
    const byRevision = new Map<string, PackageView>();
    for (const p of packages) {
        if (p.src.source) bySource.set(p.src.source.toLowerCase(), p);
        for (const r of p.revisions) byRevision.set(r.name, p);
    }
    const nodes = new Map<string, GraphNode>();
    const edges: GraphEdge[] = [];
    const nodeFor = (pkg: PackageView | null, source: string, version: string, type: string, missing: boolean): GraphNode => {
        const id = pkg ? pkg.key : `missing/${sourceKey(source)}`;
        let node = nodes.get(id);
        if (!node) {
            const src = parseSource(source);
            node = { id, pkg, type: pkg?.type ?? type, label: pkg?.name ?? src.repo ?? source, source: src.source, version: pkg?.active?.version || pkg?.src.version || version, tone: pkg ? pkg.tone : 'error', missing, depth: 0 };
            nodes.set(id, node);
        }
        return node;
    };
    const entries = locks.flatMap((l) => l.packages ?? []);
    for (const entry of entries) {
        const pkg = byRevision.get(entry.name) ?? bySource.get(sourceKey(entry.source)) ?? null;
        const from = nodeFor(pkg, entry.source, entry.version, lockType(entry), false);
        for (const dep of entry.dependencies ?? []) {
            const target = bySource.get(sourceKey(dep.package ?? '')) ?? null;
            const to = nodeFor(target, dep.package ?? '', '', lockType(dep), !target);
            if (!edges.some((e) => e.from === from.id && e.to === to.id)) edges.push({ from: from.id, to: to.id, constraints: dep.constraints ?? '', missing: !target });
        }
    }
    for (const p of packages) nodeFor(p, p.src.source, p.src.version, p.type, false);

    // Depth: a package nothing depends on sits on the left; each dependency one
    // column further right than the deepest package that needs it.
    const list = [...nodes.values()];
    for (let pass = 0; pass < list.length; pass++) {
        let moved = false;
        for (const e of edges) {
            const a = nodes.get(e.from);
            const b = nodes.get(e.to);
            if (a && b && b.depth < a.depth + 1 && a.depth + 1 < list.length) {
                b.depth = a.depth + 1;
                moved = true;
            }
        }
        if (!moved) break;
    }
    // Who depends on whom, written back on the packages for the cards.
    for (const e of edges) {
        const a = nodes.get(e.from);
        const b = nodes.get(e.to);
        if (a?.pkg && b) a.pkg.dependsOn.push(b.label);
        if (b?.pkg && a) b.pkg.usedBy.push(a.label);
    }
    return { nodes: list, edges };
}

/** Every package in the snapshot, Configurations first, then Providers, then Functions. */
export function packages(snap: Snapshot): PackageView[] {
    return [
        ...snap.configurations.map((p) => packageView(p, 'Configuration', snap.configurationRevisions, snap.pods)),
        ...snap.providers.map((p) => packageView(p, 'Provider', snap.providerRevisions, snap.pods)),
        ...snap.functions.map((p) => packageView(p, 'Function', snap.functionRevisions, snap.pods)),
    ];
}
