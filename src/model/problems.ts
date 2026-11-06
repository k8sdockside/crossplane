// What is wrong, in plain words, and what to change.
//
// Every problem names its subject, says what it means for the platform, says
// what to do, and keeps the controller's own reason and message verbatim --
// the words to search the docs and the issue tracker for.

import { failing, type Area } from './activity.js';
import type { Model } from './crossplane.js';
import type { PackageView, Ref } from './packages.js';
import { plural, toneRank, type Tone } from './tone.js';
import { KIND } from './types.js';

export type ProblemArea = 'package' | 'api' | 'composition' | 'managed' | 'composite' | 'core' | 'operation';

export const PROBLEM_AREA_WORD: Record<ProblemArea, string> = {
    core: 'Crossplane itself',
    package: 'Packages',
    api: 'APIs',
    composition: 'Compositions',
    composite: 'Composite resources',
    managed: 'Managed resources',
    operation: 'Operations',
};

export interface Problem {
    tone: Tone;
    area: ProblemArea;
    title: string;
    subject: string;
    explain: string;
    fix: string;
    reason: string;
    message: string;
    ref: Ref | null;
}

const LOWER: Record<string, string> = { Provider: 'provider', Function: 'function', Configuration: 'configuration' };

function packageProblems(p: PackageView, out: Problem[]): void {
    const what = LOWER[p.type] ?? 'package';
    const c = p.trouble;
    const verbatim = { reason: c?.reason ?? '', message: c?.message ?? '' };
    const source = p.src.source ? `${p.src.source}${p.src.version ? `:${p.src.version}` : ''}` : 'its package';
    if (p.state === 'unhealthy') {
        const pull = /pull|manifest|unauthorized|not found|denied|ErrImage/i.test(c?.message ?? '');
        out.push({
            tone: 'error',
            area: 'package',
            title: `The ${what} ${p.name} is not healthy`,
            subject: source,
            explain: pull
                ? `Crossplane could not fetch ${source}. Until it can, nothing this ${what} provides is installed.`
                : p.type === 'Provider'
                  ? `The provider's controller is not running as it should, so none of its managed resources are being reconciled.`
                  : p.type === 'Function'
                    ? 'Every Composition with a pipeline step on this function fails to compose until it is healthy.'
                    : 'Its APIs and Compositions, or one of the packages it depends on, did not install.',
            fix: pull
                ? 'Check the package reference and tag, that the registry is reachable from the cluster, and the packagePullSecrets for a private registry.'
                : `Read the condition's message below, then the ${what}'s revision and its pod's logs.`,
            ...verbatim,
            ref: p.ref,
        });
    } else if (p.state === 'waiting') {
        out.push({
            tone: 'warn',
            area: 'package',
            title: `Nothing has reconciled the ${what} ${p.name} yet`,
            subject: source,
            explain: 'It has no status at all. Crossplane writes Installed and Healthy within seconds of a package being created.',
            fix: "Check that Crossplane's own pod is running; its logs say why it has not got to this package.",
            reason: '',
            message: '',
            ref: p.ref,
        });
    } else if (p.state === 'installing') {
        out.push({
            tone: 'warn',
            area: 'package',
            title: `The ${what} ${p.name} is still installing`,
            subject: source,
            explain: 'Crossplane is unpacking it or waiting for its revision to become healthy.',
            fix: 'Give it a minute. If it stays here, the condition below says what it is waiting for.',
            ...verbatim,
            ref: p.ref,
        });
    }
    const rt = p.runtime;
    if (rt && rt.pods > 0 && rt.ready < rt.pods && p.state !== 'installing') {
        out.push({
            tone: rt.waiting ? 'error' : 'warn',
            area: 'package',
            title: rt.waiting ? `The ${what} ${p.name}'s pod is in ${rt.waiting}` : `${rt.pods - rt.ready} of ${plural(rt.pods, 'pod')} of the ${what} ${p.name} not ready`,
            subject: rt.restarts ? `${plural(rt.restarts, 'restart')}` : 'runtime',
            explain: p.type === 'Provider' ? 'While its pod is not ready nothing reconciles the managed resources it owns.' : 'While its pod is not ready, every pipeline step on it fails.',
            fix: 'Open the pod and read its logs. A DeploymentRuntimeConfig is where its resources, arguments and service account are set.',
            reason: rt.waiting,
            message: '',
            ref: rt.pod ? { kind: 'pods', namespace: rt.pod.namespace, name: rt.pod.name } : p.ref,
        });
    }
    if (p.active && p.active.invalidDependencies > 0) {
        out.push({
            tone: 'error',
            area: 'package',
            title: `${p.name} has ${plural(p.active.invalidDependencies, 'dependency', 'dependencies')} it cannot satisfy`,
            subject: p.active.name,
            explain: 'A package it depends on is installed at a version outside the constraint its metadata declares.',
            fix: 'Upgrade or pin the dependency to a version that fits, or set skipDependencyResolution on the package if you manage dependencies yourself.',
            reason: '',
            message: '',
            ref: { kind: p.ref.kind.replace(/s\.pkg/, 'revisions.pkg'), name: p.active.name },
        });
    }
    const latest = p.revisions[p.revisions.length - 1];
    if (p.activationPolicy === 'Manual' && latest && !latest.active && p.active && latest.revision > p.active.revision) {
        out.push({
            tone: 'info',
            area: 'package',
            title: `A newer revision of ${p.name} is waiting to be activated`,
            subject: `${latest.version || latest.name} (revision ${latest.revision})`,
            explain: `The ${what} uses a Manual activation policy, so ${latest.name} stays inactive until you activate it.`,
            fix: `Set spec.desiredState: Active on ${latest.name} when you are ready.`,
            reason: '',
            message: '',
            ref: { kind: p.ref.kind.replace(/s\.pkg/, 'revisions.pkg'), name: latest.name },
        });
    }
}

const AREA_PROBLEM: Partial<Record<Area, ProblemArea>> = { managed: 'managed', composite: 'composite', operation: 'operation' };

export function problems(m: Model): Problem[] {
    const out: Problem[] = [];

    for (const p of m.core.pods) {
        if (p.ready) continue;
        out.push({
            tone: p.waiting ? 'error' : 'warn',
            area: 'core',
            title: p.component === 'crossplane' ? "Crossplane's own pod is not ready" : "Crossplane's RBAC manager is not ready",
            subject: `${p.namespace}/${p.name}`,
            explain: p.component === 'crossplane' ? 'Nothing is reconciled while it is down: no packages install, no composite resource composes.' : 'New providers and XRDs do not get the roles they need while it is down.',
            fix: 'Open the pod and read its logs and events.',
            reason: p.waiting,
            message: '',
            ref: { kind: 'pods', namespace: p.namespace, name: p.name },
        });
    }

    for (const p of m.packages) packageProblems(p, out);

    for (const e of m.graph.edges) {
        if (!e.missing) continue;
        const from = m.graph.nodes.find((n) => n.id === e.from);
        const to = m.graph.nodes.find((n) => n.id === e.to);
        out.push({
            tone: 'error',
            area: 'package',
            title: `${from?.label ?? 'A package'} depends on ${to?.label ?? 'a package'}, which is not installed`,
            subject: `${to?.source ?? ''}${e.constraints ? ` ${e.constraints}` : ''}`,
            explain: 'The package manager installs dependencies on its own unless it was told not to; until this one is there the package that needs it is not healthy.',
            fix: 'Install the dependency at a version inside the constraint, or check why Crossplane could not resolve it in its logs.',
            reason: '',
            message: '',
            ref: from?.pkg?.ref ?? null,
        });
    }

    for (const a of m.apis.apis) {
        const subject = `${a.kind}.${a.group}`;
        if (a.established === false || a.established === null) {
            out.push({
                tone: a.established === false ? 'error' : 'warn',
                area: 'api',
                title: `The API ${a.kind} is not established`,
                subject,
                explain: 'Crossplane has not created the CRD for this API, or is not watching it, so nobody can create one.',
                fix: "Read the XRD's Established condition; a schema the API server refuses is the usual cause.",
                reason: '',
                message: '',
                ref: a.ref,
            });
        }
        if (a.claimKind && a.offered === false) {
            out.push({ tone: 'error', area: 'api', title: `The claim ${a.claimKind} is not offered`, subject, explain: 'Namespaced claims of this API cannot be created.', fix: "Read the XRD's Offered condition.", reason: '', message: '', ref: a.ref });
        }
        if (a.compositions.length === 0) {
            out.push({
                tone: 'warn',
                area: 'api',
                title: `No Composition serves ${a.kind}`,
                subject,
                explain: `An ${a.kind} can be created, but nothing will compose it: it waits for a Composition forever.`,
                fix: `Add a Composition with compositeTypeRef ${a.group}/${a.referenceable || 'v1'} ${a.kind}.`,
                reason: '',
                message: '',
                ref: a.ref,
            });
        }
        if (a.defaultComposition && !a.compositions.some((c) => c.name === a.defaultComposition)) {
            out.push({
                tone: 'error',
                area: 'api',
                title: `${a.kind}'s default Composition ${a.defaultComposition} does not exist`,
                subject,
                explain: 'A composite resource that does not choose a Composition gets the default, and there is none to get.',
                fix: `Create ${a.defaultComposition}, or point defaultCompositionRef at one that exists.`,
                reason: '',
                message: '',
                ref: a.ref,
            });
        }
    }

    for (const c of m.apis.compositions) {
        if (!c.api) {
            out.push({
                tone: 'warn',
                area: 'composition',
                title: `The Composition ${c.name} is for an API that is not defined`,
                subject: `${c.kind} ${c.apiVersion}`,
                explain: 'No XRD defines this composite type, so the Composition is never used.',
                fix: 'Fix compositeTypeRef, or install the XRD (or the Configuration that brings it).',
                reason: '',
                message: '',
                ref: c.ref,
            });
        }
        if (c.legacy) {
            out.push({
                tone: 'warn',
                area: 'composition',
                title: `The Composition ${c.name} uses the legacy Resources mode`,
                subject: c.kind,
                explain: 'Crossplane v2 composes with function pipelines only. Native patch-and-transform is gone.',
                fix: 'Convert it with `crossplane beta convert pipeline-composition`, which moves its resources into a function-patch-and-transform step.',
                reason: '',
                message: '',
                ref: c.ref,
            });
        } else if (c.steps.length === 0) {
            out.push({ tone: 'error', area: 'composition', title: `The Composition ${c.name} has an empty pipeline`, subject: c.kind, explain: 'It composes nothing.', fix: 'Add at least one pipeline step.', reason: '', message: '', ref: c.ref });
        }
        for (const s of c.steps) {
            if (!s.fn) {
                out.push({
                    tone: 'error',
                    area: 'composition',
                    title: `Step ${s.step} of ${c.name} runs the function ${s.functionName}, which is not installed`,
                    subject: c.kind,
                    explain: `Every ${c.kind} using this Composition fails at that step.`,
                    fix: `Install the Function ${s.functionName} -- its name must match functionRef.name exactly.`,
                    reason: '',
                    message: '',
                    ref: c.ref,
                });
            } else if (s.fn.tone === 'error') {
                out.push({
                    tone: 'error',
                    area: 'composition',
                    title: `Step ${s.step} of ${c.name} runs ${s.functionName}, which is unhealthy`,
                    subject: c.kind,
                    explain: `Every ${c.kind} using this Composition fails at that step.`,
                    fix: `Fix the Function ${s.functionName} first.`,
                    reason: '',
                    message: '',
                    ref: s.fn.ref,
                });
            }
        }
    }

    // Warnings on objects the plugin cannot list, grouped so a hundred failing
    // buckets with the same cause read as one problem.
    const groups = new Map<string, { area: ProblemArea; kind: string; reason: string; message: string; provider: string; objects: number; count: number; ref: Ref | null }>();
    for (const f of failing(m.events, (e) => e.area === 'managed' || e.area === 'composite' || e.area === 'operation')) {
        const area = AREA_PROBLEM[f.area];
        if (!area) continue;
        const key = `${area}/${f.object.group}/${f.object.kind}/${f.reason}`;
        const g = groups.get(key);
        const ref = f.appKind ? { kind: f.appKind, namespace: f.object.namespace || undefined, name: f.object.name } : null;
        if (g) {
            g.objects++;
            g.count += f.count;
        } else groups.set(key, { area, kind: f.object.kind, reason: f.reason, message: f.message, provider: f.provider, objects: 1, count: f.count, ref });
    }
    for (const g of groups.values()) {
        const many = g.objects > 1;
        out.push({
            tone: /^Cannot|Failed|Error/i.test(g.reason) || g.area !== 'managed' ? 'error' : 'warn',
            area: g.area,
            title: `${many ? `${g.objects} ${g.kind} objects` : `${/^[AEIOU]/.test(g.kind) ? 'An' : 'A'} ${g.kind}`} ${verbFor(g.reason)}`,
            subject: g.provider ? `${g.kind} · ${g.provider}` : g.kind,
            explain:
                g.area === 'managed'
                    ? 'The provider recorded this in the last hour. The external resource may not match what was asked for.'
                    : g.area === 'composite'
                      ? 'Crossplane could not finish composing it in the last hour.'
                      : 'The operation failed in the last hour.',
            fix: fixFor(g.reason),
            reason: g.reason,
            message: g.message,
            ref: g.ref,
        });
    }

    for (const mrap of m.snap.mraps) {
        const bad = (mrap.status?.conditions ?? []).find((c) => c.status === 'False');
        if (bad) out.push({ tone: 'warn', area: 'managed', title: `The activation policy ${mrap.metadata.name} is not healthy`, subject: (mrap.spec?.activate ?? []).join(', '), explain: 'Managed resource kinds it names may not have been activated.', fix: 'Read its condition below.', reason: bad.reason ?? '', message: bad.message ?? '', ref: { kind: KIND.mraps, name: mrap.metadata.name } });
    }

    return out.sort((a, b) => toneRank(b.tone) - toneRank(a.tone) || areaOrder(a.area) - areaOrder(b.area) || a.title.localeCompare(b.title));
}

const ORDER: ProblemArea[] = ['core', 'package', 'api', 'composition', 'composite', 'managed', 'operation'];
function areaOrder(a: ProblemArea): number {
    return ORDER.indexOf(a);
}

/** "cannot be created", from CannotCreateExternalResource -- the reason in words. */
export function verbFor(reason: string): string {
    const r = reason.replace(/ExternalResource$/, '');
    const words: Record<string, string> = {
        CannotConnectToProvider: 'cannot reach their provider config',
        CannotObserve: 'cannot be observed',
        CannotCreate: 'cannot be created',
        CannotUpdate: 'cannot be updated',
        CannotDelete: 'cannot be deleted',
        CannotInitializeManagedResource: 'cannot be initialised',
        CannotResolveResourceReferences: 'cannot resolve their references',
        CannotPublishConnectionDetails: 'cannot publish connection details',
        ComposeResources: 'cannot compose their resources',
        SelectComposition: 'cannot select a Composition',
        RunFunctionPipeline: 'fail in the function pipeline',
        BindCompositeResource: 'cannot bind their composite',
        ConfigureCompositeResource: 'cannot be configured',
        ReconciliationPaused: 'are paused',
    };
    return words[r] ?? words[reason] ?? `report ${reason || 'a warning'}`;
}

export function fixFor(reason: string): string {
    if (/ConnectToProvider/.test(reason)) return 'Check the ProviderConfig the resource names exists, and that the credentials it points at are valid.';
    if (/Observe|Create|Update|Delete/.test(reason)) return 'The message is the cloud API\'s own answer. Most often it is a permission the provider\'s credentials lack, or a field the API refuses.';
    if (/ResolveResourceReferences/.test(reason)) return 'A resource it references (by Ref or Selector) does not exist yet or is not ready.';
    if (/Compose|Function/.test(reason)) return 'Read the message: it names the pipeline step that failed. `crossplane beta trace` shows the whole tree.';
    if (/SelectComposition/.test(reason)) return 'Make sure a Composition exists for its type, and that its compositionSelector matches one.';
    return 'Read the message below.';
}

export function tally(list: Problem[]): { error: number; warn: number; info: number } {
    return {
        error: list.filter((p) => p.tone === 'error').length,
        warn: list.filter((p) => p.tone === 'warn').length,
        info: list.filter((p) => p.tone === 'info').length,
    };
}
