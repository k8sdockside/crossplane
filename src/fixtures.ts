// A cluster's worth of Crossplane: a small platform team's control plane on
// Crossplane 2.4, with the statuses the package manager and the providers
// write on it.
//
// Used by the tests and by scripts/preview.mjs, so what the tests assert on
// and what the preview draws are the same cluster and cannot drift apart.
//
// It is deliberately not a healthy cluster. Next to a working AWS platform --
// a Configuration that brings the provider family, three of its providers
// and three functions -- it has: a provider whose package cannot be pulled, a
// function still installing, a provider with a newer revision waiting for
// manual activation, a Composition whose pipeline names a function that is
// not installed, one in the legacy Resources mode, one for an API nobody
// defined, an API with no Composition at all, managed resources that cannot
// be created, and a composite that cannot compose. Times are relative to
// NOW, so the activity charts always show the last hour.
//
// It lives in src/ rather than src/pages/ because the build turns every
// non-test .ts under src/pages into a page of its own.

import type { Composition, CompositionRevision, Condition, CRD, KubeEvent, Lock, MRAP, MRD, Obj, Package, PackageRevision, Pod, Snapshot, XRD } from './model/types.js';
import { KIND } from './model/types.js';

export const NOW = Math.floor(Date.now() / 60_000) * 60_000;
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
const DAY = 24 * 60;

function cond(type: string, status: 'True' | 'False' | 'Unknown', reason: string, message = '', minutes = 3 * DAY): Condition {
    return { type, status, reason, message, lastTransitionTime: ago(minutes) };
}

/** A small deterministic random, so the preview looks the same every time. */
let seed = 7;
function rand(): number {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
}

const hash = (s: string) => {
    let h = 0;
    for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return h.toString(16).padStart(8, '0').slice(0, 8) + '7c1d';
};

// ----- packages ------------------------------------------------------------------------

interface PkgSpec {
    type: 'Provider' | 'Function' | 'Configuration';
    name: string;
    source: string;
    versions: string[];
    /** Index of the active revision; the rest are inactive. */
    active?: number;
    state?: 'healthy' | 'pull-failed' | 'installing';
    manual?: boolean;
    created: number;
    pod?: { restarts?: number; ready?: boolean; waiting?: string };
}

const PKGS: PkgSpec[] = [
    { type: 'Configuration', name: 'acme-platform', source: 'xpkg.crossplane.io/acme/configuration-platform', versions: ['v0.8.0', 'v0.9.2'], created: 40 * DAY },
    { type: 'Provider', name: 'upbound-provider-family-aws', source: 'xpkg.upbound.io/upbound/provider-family-aws', versions: ['v2.1.0'], created: 40 * DAY, pod: {} },
    { type: 'Provider', name: 'provider-aws-s3', source: 'xpkg.upbound.io/upbound/provider-aws-s3', versions: ['v1.23.0', 'v2.0.0', 'v2.1.0'], created: 40 * DAY, pod: {} },
    { type: 'Provider', name: 'provider-aws-ec2', source: 'xpkg.upbound.io/upbound/provider-aws-ec2', versions: ['v2.0.0', 'v2.1.0'], created: 40 * DAY, pod: { restarts: 7 } },
    { type: 'Provider', name: 'provider-aws-rds', source: 'xpkg.upbound.io/upbound/provider-aws-rds', versions: ['v2.1.0'], created: 12 * DAY, pod: {} },
    { type: 'Provider', name: 'provider-kubernetes', source: 'xpkg.crossplane.io/crossplane-contrib/provider-kubernetes', versions: ['v1.0.0'], created: 30 * DAY, pod: {} },
    { type: 'Provider', name: 'provider-helm', source: 'xpkg.crossplane.io/crossplane-contrib/provider-helm', versions: ['v0.21.0', 'v1.0.0'], active: 0, manual: true, created: 30 * DAY, pod: {} },
    { type: 'Provider', name: 'provider-azure-network', source: 'xpkg.upbound.io/acme-private/provider-azure-network', versions: ['v2.0.1'], state: 'pull-failed', created: 0.2 * DAY },
    { type: 'Function', name: 'function-patch-and-transform', source: 'xpkg.crossplane.io/crossplane-contrib/function-patch-and-transform', versions: ['v0.8.2', 'v0.9.0'], created: 40 * DAY, pod: {} },
    { type: 'Function', name: 'function-go-templating', source: 'xpkg.crossplane.io/crossplane-contrib/function-go-templating', versions: ['v0.10.0'], created: 40 * DAY, pod: {} },
    { type: 'Function', name: 'function-auto-ready', source: 'xpkg.crossplane.io/crossplane-contrib/function-auto-ready', versions: ['v0.5.1'], created: 40 * DAY, pod: {} },
    { type: 'Function', name: 'function-kcl', source: 'xpkg.crossplane.io/crossplane-contrib/function-kcl', versions: ['v0.11.4'], state: 'installing', created: 6, pod: { ready: false, waiting: 'ContainerCreating' } },
];

const API = { Provider: 'pkg.crossplane.io/v1', Function: 'pkg.crossplane.io/v1', Configuration: 'pkg.crossplane.io/v1' };

export const providers: Package[] = [];
export const functions: Package[] = [];
export const configurations: Package[] = [];
export const providerRevisions: PackageRevision[] = [];
export const functionRevisions: PackageRevision[] = [];
export const configurationRevisions: PackageRevision[] = [];
export const pods: Pod[] = [];
/** Revision name of each package's active revision. */
const ACTIVE = new Map<string, string>();

for (const p of PKGS) {
    const activeIdx = p.active ?? p.versions.length - 1;
    const revs: PackageRevision[] = p.versions.map((v, i) => {
        const name = `${p.name}-${hash(p.name + v)}`;
        const active = i === activeIdx;
        if (active) ACTIVE.set(p.name, name);
        const failing = active && p.state === 'pull-failed';
        const installing = active && p.state === 'installing';
        return {
            apiVersion: API[p.type],
            kind: `${p.type}Revision`,
            metadata: {
                name,
                uid: `rev-${name}`,
                creationTimestamp: ago(p.created - i * 3 * DAY > 0 ? p.created - i * 3 * DAY : p.created),
                labels: { 'pkg.crossplane.io/package': p.name },
                ownerReferences: [{ apiVersion: API[p.type], kind: p.type, name: p.name, controller: true }],
            },
            spec: { desiredState: active ? 'Active' : 'Inactive', image: `${p.source}:${v}`, revision: i + 1 },
            status: {
                conditions: failing ? [] : installing ? [cond('Healthy', 'Unknown', 'UnknownPackageRevisionHealth', 'Waiting for the runtime deployment to become available', 5)] : [cond('Healthy', 'True', 'HealthyPackageRevision'), ...(p.type !== 'Configuration' ? [cond('RuntimeHealthy', 'True', 'RuntimeHealthy')] : [])],
                objectRefs: [],
                foundDependencies: p.type === 'Configuration' ? 6 : p.name.startsWith('provider-aws') ? 1 : 0,
                installedDependencies: p.type === 'Configuration' ? 6 : p.name.startsWith('provider-aws') ? 1 : 0,
                invalidDependencies: 0,
                resolvedImage: `${p.source}:${v}`,
            },
        };
    });
    const activeRev = revs[activeIdx];
    const conditions: Condition[] =
        p.state === 'pull-failed'
            ? [
                  cond('Installed', 'False', 'UnpackPackage', `cannot unpack package: failed to fetch package digest from remote: GET https://xpkg.upbound.io/v2/acme-private/provider-azure-network/manifests/v2.0.1: UNAUTHORIZED: authentication required`, 14),
                  cond('Healthy', 'Unknown', 'UnknownPackageRevisionHealth', '', 14),
              ]
            : p.state === 'installing'
              ? [cond('Installed', 'True', 'ActivePackageRevision', '', 6), cond('Healthy', 'Unknown', 'UnknownPackageRevisionHealth', 'Package revision health is "Unknown": Waiting for the runtime deployment to become available', 6)]
              : [cond('Installed', 'True', 'ActivePackageRevision'), cond('Healthy', 'True', 'HealthyPackageRevision')];
    const pkg: Package = {
        apiVersion: API[p.type],
        kind: p.type,
        metadata: { name: p.name, uid: `pkg-${p.name}`, creationTimestamp: ago(p.created) },
        spec: { package: `${p.source}:${p.versions[p.versions.length - 1]}`, revisionActivationPolicy: p.manual ? 'Manual' : 'Automatic', revisionHistoryLimit: 1, ...(p.type !== 'Configuration' ? { runtimeConfigRef: { name: 'default' } } : {}) },
        status: { conditions, currentRevision: revs[revs.length - 1]?.metadata.name, currentIdentifier: `${p.source}:${p.versions[p.versions.length - 1]}` },
    };
    if (p.type === 'Provider') {
        providers.push(pkg);
        providerRevisions.push(...revs);
    } else if (p.type === 'Function') {
        functions.push(pkg);
        functionRevisions.push(...revs);
    } else {
        configurations.push(pkg);
        configurationRevisions.push(...revs);
    }
    if (p.pod && activeRev) {
        const label = p.type === 'Provider' ? 'pkg.crossplane.io/provider' : 'pkg.crossplane.io/function';
        const ready = p.pod.ready ?? true;
        pods.push({
            apiVersion: 'v1',
            kind: 'Pod',
            metadata: { name: `${activeRev.metadata.name}-6d8f9b7c5-${hash(p.name).slice(0, 5)}`, namespace: 'crossplane-system', uid: `pod-${p.name}`, creationTimestamp: ago(p.created), labels: { 'pkg.crossplane.io/revision': activeRev.metadata.name, [label]: p.name } },
            spec: { nodeName: 'worker-1', containers: [{ name: 'package-runtime', image: `${p.source}:${p.versions[activeIdx]}` }] },
            status: {
                phase: ready ? 'Running' : 'Pending',
                containerStatuses: [{ name: 'package-runtime', ready, restartCount: p.pod.restarts ?? 0, state: ready ? { running: {} } : { waiting: { reason: p.pod.waiting ?? 'ContainerCreating' } } }],
            },
        });
    }
}

for (const [app, name] of [
    ['crossplane', 'crossplane-68b4d67ddf-g6j82'],
    ['crossplane-rbac-manager', 'crossplane-rbac-manager-7b64b6fbcb-4djnf'],
] as const) {
    pods.push({
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: { name, namespace: 'crossplane-system', uid: `pod-${name}`, creationTimestamp: ago(40 * DAY), labels: { app, 'app.kubernetes.io/version': '2.4.3', 'app.kubernetes.io/name': 'crossplane', release: 'crossplane' } },
        spec: { containers: [{ name: app, image: 'xpkg.crossplane.io/crossplane/crossplane:v2.4.3' }] },
        status: { phase: 'Running', containerStatuses: [{ name: app, ready: true, restartCount: 0, state: { running: {} } }] },
    });
}

const rev = (name: string) => ACTIVE.get(name) ?? name;

export const locks: Lock[] = [
    {
        apiVersion: 'pkg.crossplane.io/v1beta1',
        kind: 'Lock',
        metadata: { name: 'lock', uid: 'lock' },
        packages: [
            {
                name: rev('acme-platform'),
                source: 'xpkg.crossplane.io/acme/configuration-platform',
                version: 'v0.9.2',
                apiVersion: 'pkg.crossplane.io/v1',
                kind: 'Configuration',
                dependencies: [
                    { package: 'xpkg.upbound.io/upbound/provider-aws-s3', constraints: '>=v2.0.0', apiVersion: 'pkg.crossplane.io/v1', kind: 'Provider' },
                    { package: 'xpkg.upbound.io/upbound/provider-aws-ec2', constraints: '>=v2.0.0', apiVersion: 'pkg.crossplane.io/v1', kind: 'Provider' },
                    { package: 'xpkg.upbound.io/upbound/provider-aws-rds', constraints: '>=v2.0.0', apiVersion: 'pkg.crossplane.io/v1', kind: 'Provider' },
                    { package: 'xpkg.crossplane.io/crossplane-contrib/function-patch-and-transform', constraints: '>=v0.8.0', apiVersion: 'pkg.crossplane.io/v1', kind: 'Function' },
                    { package: 'xpkg.crossplane.io/crossplane-contrib/function-go-templating', constraints: '>=v0.9.0', apiVersion: 'pkg.crossplane.io/v1', kind: 'Function' },
                    { package: 'xpkg.crossplane.io/crossplane-contrib/function-auto-ready', constraints: '>=v0.5.0', apiVersion: 'pkg.crossplane.io/v1', kind: 'Function' },
                    { package: 'xpkg.crossplane.io/crossplane-contrib/function-environment-configs', constraints: '>=v0.4.0', apiVersion: 'pkg.crossplane.io/v1', kind: 'Function' },
                ],
            },
            ...['provider-aws-s3', 'provider-aws-ec2', 'provider-aws-rds'].map((n) => ({
                name: rev(n),
                source: `xpkg.upbound.io/upbound/${n}`,
                version: 'v2.1.0',
                apiVersion: 'pkg.crossplane.io/v1',
                kind: 'Provider',
                dependencies: [{ package: 'xpkg.upbound.io/upbound/provider-family-aws', constraints: 'v2.1.0', apiVersion: 'pkg.crossplane.io/v1', kind: 'Provider' }],
            })),
            { name: rev('upbound-provider-family-aws'), source: 'xpkg.upbound.io/upbound/provider-family-aws', version: 'v2.1.0', apiVersion: 'pkg.crossplane.io/v1', kind: 'Provider', dependencies: [] },
            ...['function-patch-and-transform', 'function-go-templating', 'function-auto-ready'].map((n) => ({
                name: rev(n),
                source: `xpkg.crossplane.io/crossplane-contrib/${n}`,
                version: PKGS.find((p) => p.name === n)?.versions.slice(-1)[0] ?? '',
                apiVersion: 'pkg.crossplane.io/v1',
                kind: 'Function',
                dependencies: [],
            })),
        ],
    },
];

export const runtimeConfigs: Obj[] = [{ apiVersion: 'pkg.crossplane.io/v1beta1', kind: 'DeploymentRuntimeConfig', metadata: { name: 'default', uid: 'drc-default', creationTimestamp: ago(40 * DAY) }, spec: {} }];

// ----- managed resource definitions ----------------------------------------------------

const MR_KINDS: Record<string, { group: string; kinds: string[]; active: string[] | '*' }> = {
    'provider-aws-s3': {
        group: 's3.aws.m.upbound.io',
        kinds: ['Bucket', 'BucketACL', 'BucketAccelerateConfiguration', 'BucketAnalyticsConfiguration', 'BucketCorsConfiguration', 'BucketIntelligentTieringConfiguration', 'BucketInventory', 'BucketLifecycleConfiguration', 'BucketLogging', 'BucketMetric', 'BucketNotification', 'BucketObject', 'BucketObjectLockConfiguration', 'BucketOwnershipControls', 'BucketPolicy', 'BucketPublicAccessBlock', 'BucketReplicationConfiguration', 'BucketRequestPaymentConfiguration', 'BucketServerSideEncryptionConfiguration', 'BucketVersioning', 'BucketWebsiteConfiguration', 'DirectoryBucket', 'Object', 'ObjectCopy'],
        active: '*',
    },
    'provider-aws-ec2': {
        group: 'ec2.aws.m.upbound.io',
        kinds: ['VPC', 'Subnet', 'SecurityGroup', 'SecurityGroupRule', 'SecurityGroupIngressRule', 'SecurityGroupEgressRule', 'InternetGateway', 'NATGateway', 'EIP', 'RouteTable', 'Route', 'RouteTableAssociation', 'Instance', 'LaunchTemplate', 'KeyPair', 'NetworkInterface', 'NetworkACL', 'NetworkACLRule', 'VPCEndpoint', 'VPCPeeringConnection', 'TransitGateway', 'TransitGatewayAttachment', 'EBSVolume', 'EBSSnapshot', 'AMI', 'PlacementGroup', 'SpotInstanceRequest', 'FlowLog', 'DHCPOptions', 'CustomerGateway', 'VPNConnection', 'VPNGateway', 'EgressOnlyInternetGateway', 'ManagedPrefixList', 'CapacityReservation', 'Host'],
        active: ['VPC', 'Subnet', 'SecurityGroup', 'SecurityGroupRule', 'InternetGateway', 'NATGateway', 'EIP', 'RouteTable', 'Route', 'RouteTableAssociation'],
    },
    'provider-aws-rds': {
        group: 'rds.aws.m.upbound.io',
        kinds: ['Instance', 'Cluster', 'ClusterInstance', 'ClusterParameterGroup', 'ParameterGroup', 'SubnetGroup', 'OptionGroup', 'Snapshot', 'ClusterSnapshot', 'ProxyDefaultTargetGroup', 'Proxy', 'ProxyEndpoint', 'ProxyTarget', 'GlobalCluster', 'EventSubscription', 'InstanceRoleAssociation'],
        active: ['Instance', 'SubnetGroup', 'ParameterGroup'],
    },
    'provider-kubernetes': { group: 'kubernetes.m.crossplane.io', kinds: ['Object', 'ObservedObjectCollection'], active: '*' },
    'provider-helm': { group: 'helm.m.crossplane.io', kinds: ['Release'], active: '*' },
};

function pluralise(kind: string): string {
    const k = kind.toLowerCase();
    if (k.endsWith('policy')) return `${k.slice(0, -1)}ies`;
    if (k.endsWith('s') || k.endsWith('x')) return `${k}es`;
    return `${k}s`;
}

export const mrds: MRD[] = [];
export const crds: CRD[] = [];

for (const [provider, def] of Object.entries(MR_KINDS)) {
    for (const kind of def.kinds) {
        const plural = pluralise(kind);
        const name = `${plural}.${def.group}`;
        const state = def.active === '*' || def.active.includes(kind) ? 'Active' : 'Inactive';
        const owner = [{ apiVersion: 'pkg.crossplane.io/v1', kind: 'ProviderRevision', name: rev(provider), controller: true }];
        mrds.push({
            apiVersion: 'apiextensions.crossplane.io/v1alpha1',
            kind: 'ManagedResourceDefinition',
            metadata: { name, uid: `mrd-${name}`, ownerReferences: owner },
            spec: { group: def.group, names: { kind, plural, categories: ['crossplane', 'managed', provider.replace(/^provider-/, '').split('-')[0] ?? ''] }, scope: 'Namespaced', state },
            status: { conditions: [cond('Established', state === 'Active' ? 'True' : 'False', state === 'Active' ? 'Established' : 'InactiveManagedResource')] },
        });
        if (state === 'Active') crds.push({ apiVersion: 'apiextensions.k8s.io/v1', kind: 'CustomResourceDefinition', metadata: { name, uid: `crd-${name}`, ownerReferences: owner }, spec: { group: def.group, names: { kind, plural, categories: ['crossplane', 'managed'] }, scope: 'Namespaced' } });
    }
}

export const mraps: MRAP[] = [
    {
        apiVersion: 'apiextensions.crossplane.io/v1alpha1',
        kind: 'ManagedResourceActivationPolicy',
        metadata: { name: 'acme-platform', uid: 'mrap-acme' },
        spec: { activate: ['*.s3.aws.m.upbound.io', 'vpcs.ec2.aws.m.upbound.io', 'subnets.ec2.aws.m.upbound.io', 'securitygroups.ec2.aws.m.upbound.io', 'instances.rds.aws.m.upbound.io', '*.kubernetes.m.crossplane.io', '*.helm.m.crossplane.io'] },
        status: { conditions: [cond('Healthy', 'True', 'Running')] },
    },
];

// ----- APIs and compositions -------------------------------------------------------------

function xrd(group: string, kind: string, plural: string, scope: string | undefined, opts: { claim?: string; defaultComposition?: string; v1?: boolean; established?: boolean } = {}): XRD {
    return {
        apiVersion: opts.v1 ? 'apiextensions.crossplane.io/v1' : 'apiextensions.crossplane.io/v2',
        kind: 'CompositeResourceDefinition',
        metadata: { name: `${plural}.${group}`, uid: `xrd-${plural}`, creationTimestamp: ago(30 * DAY) },
        spec: {
            group,
            names: { kind, plural },
            ...(scope ? { scope } : {}),
            ...(opts.claim ? { claimNames: { kind: opts.claim, plural: pluralise(opts.claim) } } : {}),
            versions: [{ name: 'v1alpha1', served: true, referenceable: true }],
            ...(opts.defaultComposition ? { defaultCompositionRef: { name: opts.defaultComposition } } : {}),
        },
        status: { conditions: [cond('Established', opts.established === false ? 'False' : 'True', 'WatchingCompositeResource'), ...(opts.claim ? [cond('Offered', 'True', 'WatchingClaim')] : [])] },
    };
}

export const xrds: XRD[] = [
    xrd('platform.acme.io', 'XNetwork', 'xnetworks', 'Cluster'),
    xrd('storage.acme.io', 'Bucket', 'buckets', 'Namespaced', { defaultComposition: 'bucket-aws' }),
    xrd('db.acme.io', 'PostgresInstance', 'postgresinstances', 'Namespaced', { defaultComposition: 'postgres-aws' }),
    xrd('platform.acme.io', 'XCluster', 'xclusters', undefined, { claim: 'Cluster', v1: true }),
    xrd('platform.acme.io', 'App', 'apps', 'Namespaced'),
];

for (const x of xrds) {
    const spec = x.spec ?? {};
    crds.push({ apiVersion: 'apiextensions.k8s.io/v1', kind: 'CustomResourceDefinition', metadata: { name: x.metadata.name, uid: `crd-${x.metadata.name}`, ownerReferences: [{ apiVersion: 'apiextensions.crossplane.io/v1', kind: 'CompositeResourceDefinition', name: x.metadata.name, controller: true }] }, spec: { group: spec.group, names: { kind: spec.names?.kind, plural: spec.names?.plural, categories: ['composite'] }, scope: spec.scope === 'Namespaced' ? 'Namespaced' : 'Cluster' } });
}

function comp(name: string, apiVersion: string, kind: string, steps: [string, string, string?][], opts: { legacy?: boolean; created?: number } = {}): Composition {
    return {
        apiVersion: 'apiextensions.crossplane.io/v1',
        kind: 'Composition',
        metadata: { name, uid: `comp-${name}`, creationTimestamp: ago(opts.created ?? 20 * DAY), labels: { 'acme.io/provider': name.split('-').slice(-1)[0] ?? '' } },
        spec: opts.legacy
            ? { compositeTypeRef: { apiVersion, kind }, mode: 'Resources', resources: [{}, {}, {}] }
            : { compositeTypeRef: { apiVersion, kind }, mode: 'Pipeline', pipeline: steps.map(([step, fn, input]) => ({ step, functionRef: { name: fn }, ...(input ? { input: { apiVersion: input.split('/').slice(0, -1).join('/'), kind: input.split('/').slice(-1)[0] } } : {}) })) },
    };
}

export const compositions: Composition[] = [
    comp('xnetworks-aws', 'platform.acme.io/v1alpha1', 'XNetwork', [
        ['patch-and-transform', 'function-patch-and-transform', 'pt.fn.crossplane.io/v1beta1/Resources'],
        ['ready', 'function-auto-ready'],
    ]),
    comp('bucket-aws', 'storage.acme.io/v1alpha1', 'Bucket', [
        ['render', 'function-go-templating', 'gotemplating.fn.crossplane.io/v1beta1/GoTemplate'],
        ['ready', 'function-auto-ready'],
    ]),
    comp('postgres-aws', 'db.acme.io/v1alpha1', 'PostgresInstance', [
        ['environment', 'function-environment-configs', 'environmentconfigs.fn.crossplane.io/v1beta1/Input'],
        ['patch-and-transform', 'function-patch-and-transform', 'pt.fn.crossplane.io/v1beta1/Resources'],
        ['ready', 'function-auto-ready'],
    ]),
    comp('postgres-dev', 'db.acme.io/v1alpha1', 'PostgresInstance', [
        ['render', 'function-go-templating', 'gotemplating.fn.crossplane.io/v1beta1/GoTemplate'],
        ['policy', 'function-kcl', 'krm.kcl.dev/v1alpha1/KCLInput'],
        ['ready', 'function-auto-ready'],
    ]),
    comp('xcluster-legacy', 'platform.acme.io/v1alpha1', 'XCluster', [], { legacy: true, created: 200 * DAY }),
    comp('xqueue-aws', 'messaging.acme.io/v1alpha1', 'XQueue', [['render', 'function-go-templating']]),
];

export const compositionRevisions: CompositionRevision[] = compositions.flatMap((c, i) =>
    Array.from({ length: 1 + (i % 3) }, (_, r) => ({
        apiVersion: 'apiextensions.crossplane.io/v1',
        kind: 'CompositionRevision',
        metadata: { name: `${c.metadata.name}-${hash(c.metadata.name + r).slice(0, 7)}`, uid: `cr-${c.metadata.name}-${r}`, labels: { 'crossplane.io/composition-name': c.metadata.name } },
        spec: { revision: r + 1, compositeTypeRef: c.spec?.compositeTypeRef },
    })),
);

export const environmentConfigs: Obj[] = ['aws-prod', 'aws-dev'].map((n) => ({ apiVersion: 'apiextensions.crossplane.io/v1beta1', kind: 'EnvironmentConfig', metadata: { name: n, uid: `env-${n}` } }));

export const cronOperations: Obj[] = [
    { apiVersion: 'ops.crossplane.io/v1alpha1', kind: 'CronOperation', metadata: { name: 'rotate-db-credentials', uid: 'cron-rotate' }, spec: { schedule: '0 3 * * *' }, status: { conditions: [cond('Synced', 'True', 'ReconcileSuccess')], lastScheduleTime: ago(9 * 60), lastSuccessfulTime: ago(9 * 60 - 1) } },
];
export const watchOperations: Obj[] = [
    { apiVersion: 'ops.crossplane.io/v1alpha1', kind: 'WatchOperation', metadata: { name: 'tag-new-buckets', uid: 'watch-tag' }, spec: { watch: { apiVersion: 's3.aws.m.upbound.io/v1beta1', kind: 'Bucket' } }, status: { conditions: [cond('Synced', 'True', 'ReconcileSuccess')], watchingResources: 14, lastScheduleTime: ago(12) } },
];
export const operations: Obj[] = [
    { apiVersion: 'ops.crossplane.io/v1alpha1', kind: 'Operation', metadata: { name: 'rotate-db-credentials-29384', uid: 'op-1', creationTimestamp: ago(9 * 60) }, spec: { mode: 'Pipeline' }, status: { conditions: [cond('Succeeded', 'True', 'PipelineSuccess')], failures: 0 } },
    { apiVersion: 'ops.crossplane.io/v1alpha1', kind: 'Operation', metadata: { name: 'tag-new-buckets-x81kd', uid: 'op-2', creationTimestamp: ago(12) }, spec: { mode: 'Pipeline' }, status: { conditions: [cond('Succeeded', 'True', 'PipelineSuccess')], failures: 0 } },
];

// ----- events -----------------------------------------------------------------------------

let eventN = 0;
function event(o: { apiVersion: string; kind: string; name: string; namespace?: string }, type: 'Normal' | 'Warning', reason: string, message: string, firstMin: number, lastMin: number, count = 1, component = 'crossplane'): KubeEvent {
    const n = eventN++;
    return {
        apiVersion: 'v1',
        kind: 'Event',
        metadata: { name: `${o.name}.${(n * 7919).toString(16)}`, namespace: o.namespace ?? 'default', uid: `ev-${n}`, creationTimestamp: ago(firstMin) },
        involvedObject: o,
        type,
        reason,
        message,
        count,
        firstTimestamp: ago(firstMin),
        lastTimestamp: ago(lastMin),
        source: { component },
    };
}

const S3 = 's3.aws.m.upbound.io/v1beta1';
const EC2 = 'ec2.aws.m.upbound.io/v1beta1';
const RDS = 'rds.aws.m.upbound.io/v1beta1';

export const events: KubeEvent[] = [
    // Two buckets whose name is taken: retried all hour.
    event({ apiVersion: S3, kind: 'Bucket', name: 'team-a-logs-x7k2p', namespace: 'team-a' }, 'Warning', 'CannotCreateExternalResource', 'create failed: async create failed: failed to create the resource: [{0 creating S3 Bucket (team-a-logs): operation error S3: CreateBucket, https response error StatusCode: 409, BucketAlreadyExists:  []}]', 58, 1, 34, 'managed/s3.aws.m.upbound.io/v1beta1, kind=bucket'),
    event({ apiVersion: S3, kind: 'Bucket', name: 'team-b-assets-q9w3z', namespace: 'team-b' }, 'Warning', 'CannotCreateExternalResource', 'create failed: async create failed: failed to create the resource: [{0 creating S3 Bucket (assets): operation error S3: CreateBucket, https response error StatusCode: 409, BucketAlreadyExists:  []}]', 40, 2, 21, 'managed/s3.aws.m.upbound.io/v1beta1, kind=bucket'),
    // A database the API refuses.
    event({ apiVersion: RDS, kind: 'Instance', name: 'orders-db-9fkq2', namespace: 'orders' }, 'Warning', 'CannotCreateExternalResource', 'create failed: async create failed: failed to create the resource: [{0 creating RDS DB Instance (orders-db): operation error RDS: CreateDBInstance, https response error StatusCode: 400, InvalidParameterValue: The parameter MasterUserPassword is not a valid password because it is shorter than 8 characters.  []}]', 52, 3, 12, 'managed/rds.aws.m.upbound.io/v1beta1, kind=instance'),
    // Security group rules pointing at a ProviderConfig nobody made.
    event({ apiVersion: EC2, kind: 'SecurityGroupRule', name: 'sandbox-ingress-https', namespace: 'sandbox' }, 'Warning', 'CannotConnectToProvider', 'cannot get referenced ProviderConfig: ProviderConfig.aws.m.upbound.io "sandbox" not found', 45, 4, 9),
    event({ apiVersion: EC2, kind: 'SecurityGroupRule', name: 'sandbox-egress-all', namespace: 'sandbox' }, 'Warning', 'CannotConnectToProvider', 'cannot get referenced ProviderConfig: ProviderConfig.aws.m.upbound.io "sandbox" not found', 45, 4, 9),
    // A composite whose pipeline names a function that is not there.
    event({ apiVersion: 'db.acme.io/v1alpha1', kind: 'PostgresInstance', name: 'orders', namespace: 'orders' }, 'Warning', 'ComposeResources', 'cannot compose resources: pipeline step "environment" returned a fatal result: cannot run Function "function-environment-configs": Function.pkg.crossplane.io "function-environment-configs" not found', 55, 1, 28),
    // The package that cannot be pulled.
    event({ apiVersion: 'pkg.crossplane.io/v1', kind: 'Provider', name: 'provider-azure-network' }, 'Warning', 'UnpackPackage', 'cannot unpack package: failed to fetch package digest from remote: UNAUTHORIZED: authentication required', 14, 2, 8, 'packages/provider.pkg.crossplane.io'),
    event({ apiVersion: 'pkg.crossplane.io/v1', kind: 'Function', name: 'function-kcl' }, 'Normal', 'InstallPackageRevision', 'Successfully installed package revision', 6, 6, 1, 'packages/function.pkg.crossplane.io'),
    // A provider pod that restarted a few times this hour.
    event({ apiVersion: 'v1', kind: 'Pod', name: pods.find((p) => p.metadata.labels?.['pkg.crossplane.io/provider'] === 'provider-aws-ec2')?.metadata.name ?? 'ec2', namespace: 'crossplane-system' }, 'Warning', 'BackOff', 'Back-off restarting failed container package-runtime in pod', 33, 29, 4, 'kubelet'),
    event({ apiVersion: 'ops.crossplane.io/v1alpha1', kind: 'Operation', name: 'tag-new-buckets-x81kd' }, 'Normal', 'RunPipeline', 'Successfully ran the operation pipeline', 12, 12, 1),
];

// The steady business of a working platform: composites composing, providers
// observing and updating what they own.
const busy: [string, string, string, string, string][] = [
    ['storage.acme.io/v1alpha1', 'Bucket', 'team-a', 'logs', 'ComposeResources'],
    ['storage.acme.io/v1alpha1', 'Bucket', 'team-c', 'media', 'ComposeResources'],
    ['platform.acme.io/v1alpha1', 'XNetwork', '', 'prod-eu-west-1', 'ComposeResources'],
    ['platform.acme.io/v1alpha1', 'XNetwork', '', 'dev-eu-west-1', 'ComposeResources'],
    [S3, 'Bucket', 'team-c', 'team-c-media-82hd1', 'UpdatedExternalResource'],
    [S3, 'BucketVersioning', 'team-c', 'team-c-media-82hd1-ver', 'UpdatedExternalResource'],
    [EC2, 'VPC', '', 'prod-eu-west-1-vpc', 'UpdatedExternalResource'],
    [EC2, 'Subnet', '', 'prod-eu-west-1-a', 'UpdatedExternalResource'],
    [EC2, 'Subnet', '', 'prod-eu-west-1-b', 'UpdatedExternalResource'],
    [EC2, 'RouteTable', '', 'prod-eu-west-1-rt', 'UpdatedExternalResource'],
    ['kubernetes.m.crossplane.io/v1alpha1', 'Object', 'team-a', 'team-a-quota', 'UpdatedExternalResource'],
    ['helm.m.crossplane.io/v1beta1', 'Release', 'monitoring', 'kube-prometheus', 'UpdatedExternalResource'],
];
for (const [apiVersion, kind, namespace, name, reason] of busy) {
    const start = 5 + Math.floor(rand() * 54);
    const count = 2 + Math.floor(rand() * 14);
    events.push(event({ apiVersion, kind, name, namespace: namespace || undefined }, 'Normal', reason, reason === 'ComposeResources' ? 'Successfully composed resources' : 'Successfully requested update of external resource', start, Math.max(0, start - 4 - Math.floor(rand() * 40)), count));
}
for (let i = 0; i < 9; i++) {
    const m = Math.floor(rand() * 58);
    events.push(event({ apiVersion: EC2, kind: 'Subnet', name: `dev-eu-west-1-${String.fromCharCode(97 + i)}` }, 'Normal', 'CreatedExternalResource', 'Successfully requested creation of external resource', m, m));
}
// Something unrelated to Crossplane, which the plugin must leave out.
events.push(event({ apiVersion: 'apps/v1', kind: 'Deployment', name: 'web', namespace: 'shop' }, 'Normal', 'ScalingReplicaSet', 'Scaled up replica set web-7d9 to 3', 20, 20));

// ----- the snapshot --------------------------------------------------------------------------

export function snapshot(): Snapshot {
    return {
        providers,
        functions,
        configurations,
        providerRevisions,
        functionRevisions,
        configurationRevisions,
        locks,
        runtimeConfigs,
        imageConfigs: [],
        xrds,
        compositions,
        compositionRevisions,
        environmentConfigs,
        mrds,
        mraps,
        operations,
        cronOperations,
        watchOperations,
        usages: [],
        crds,
        events,
        pods,
        served: Object.fromEntries(Object.keys(KIND).map((k) => [k, true])),
    };
}

/** What `k8sdockside.list` answers for each kind, for the render test and the preview. */
export const LISTS: Record<string, unknown[]> = {
    [KIND.providers]: providers,
    [KIND.functions]: functions,
    [KIND.configurations]: configurations,
    [KIND.providerRevisions]: providerRevisions,
    [KIND.functionRevisions]: functionRevisions,
    [KIND.configurationRevisions]: configurationRevisions,
    [KIND.locks]: locks,
    [KIND.runtimeConfigs]: runtimeConfigs,
    [KIND.imageConfigs]: [],
    [KIND.xrds]: xrds,
    [KIND.compositions]: compositions,
    [KIND.compositionRevisions]: compositionRevisions,
    [KIND.environmentConfigs]: environmentConfigs,
    [KIND.mrds]: mrds,
    [KIND.mraps]: mraps,
    [KIND.operations]: operations,
    [KIND.cronOperations]: cronOperations,
    [KIND.watchOperations]: watchOperations,
    [KIND.usages]: [],
    [KIND.clusterUsages]: [],
    [KIND.crds]: crds,
    [KIND.events]: events,
    [KIND.pods]: pods,
};
