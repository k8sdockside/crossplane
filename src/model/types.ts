// The shapes of the Crossplane objects the plugin reads, as far as it reads
// them.
//
// Field names are the JSON tags of Crossplane v2 (checked against the CRDs a
// 2.4 install serves): pkg.crossplane.io/v1 for packages and revisions,
// v1beta1 for the Lock and runtime configs, apiextensions.crossplane.io/v1
// and v2 for XRDs and Compositions, v1alpha1 for MRDs, MRAPs and operations.
// Everything is optional on purpose: an object no controller has reconciled
// yet has no status at all, and the pages have to say so rather than throw.

export interface Condition {
    type: string;
    status: 'True' | 'False' | 'Unknown' | string;
    reason?: string;
    message?: string;
    lastTransitionTime?: string;
    observedGeneration?: number;
}

export interface OwnerRef {
    apiVersion?: string;
    kind?: string;
    name?: string;
    uid?: string;
    controller?: boolean;
}

export interface Meta {
    name: string;
    namespace?: string;
    uid?: string;
    creationTimestamp?: string;
    deletionTimestamp?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    ownerReferences?: OwnerRef[];
    generation?: number;
}

export interface Obj {
    apiVersion?: string;
    kind?: string;
    metadata: Meta;
    [field: string]: unknown;
}

// ----- the package manager -------------------------------------------------------

export type PackageType = 'Provider' | 'Function' | 'Configuration';

export interface Package extends Obj {
    spec?: {
        package?: string;
        revisionActivationPolicy?: 'Automatic' | 'Manual' | string;
        revisionHistoryLimit?: number;
        packagePullPolicy?: string;
        runtimeConfigRef?: { name?: string; apiVersion?: string; kind?: string };
        skipDependencyResolution?: boolean;
    };
    status?: {
        conditions?: Condition[];
        currentRevision?: string;
        currentIdentifier?: string;
        resolvedPackage?: string;
    };
}

export interface PackageRevision extends Obj {
    spec?: {
        desiredState?: 'Active' | 'Inactive' | string;
        image?: string;
        revision?: number;
        packagePullPolicy?: string;
    };
    status?: {
        conditions?: Condition[];
        objectRefs?: { apiVersion?: string; kind?: string; name?: string; uid?: string }[];
        foundDependencies?: number;
        installedDependencies?: number;
        invalidDependencies?: number;
        resolvedImage?: string;
        capabilities?: string[];
    };
}

export interface LockDependency {
    package?: string;
    constraints?: string;
    type?: PackageType | string;
    apiVersion?: string;
    kind?: string;
}

export interface LockPackage {
    name: string;
    source: string;
    version: string;
    type?: PackageType | string;
    apiVersion?: string;
    kind?: string;
    dependencies?: LockDependency[];
}

export interface Lock extends Obj {
    packages?: LockPackage[];
}

export interface RuntimeConfig extends Obj {
    spec?: unknown;
}

// ----- APIs and compositions -------------------------------------------------------

export interface XRD extends Obj {
    spec?: {
        group?: string;
        names?: { kind?: string; plural?: string; categories?: string[] };
        claimNames?: { kind?: string; plural?: string };
        scope?: 'Namespaced' | 'Cluster' | 'LegacyCluster' | string;
        versions?: { name: string; served?: boolean; referenceable?: boolean; deprecated?: boolean }[];
        defaultCompositionRef?: { name?: string };
        enforcedCompositionRef?: { name?: string };
    };
    status?: {
        conditions?: Condition[];
        controllers?: { compositeResourceType?: { apiVersion?: string; kind?: string }; compositeResourceClaimType?: { apiVersion?: string; kind?: string } };
    };
}

export interface PipelineStep {
    step: string;
    functionRef?: { name?: string };
    input?: { apiVersion?: string; kind?: string; [field: string]: unknown };
    credentials?: unknown[];
    requirements?: unknown;
}

export interface Composition extends Obj {
    spec?: {
        compositeTypeRef?: { apiVersion?: string; kind?: string };
        mode?: 'Pipeline' | 'Resources' | string;
        pipeline?: PipelineStep[];
        /** The legacy, pre-v2 way of composing: patch-and-transform resources. */
        resources?: unknown[];
        writeConnectionSecretsToNamespace?: string;
    };
}

export interface CompositionRevision extends Obj {
    spec?: { revision?: number; compositeTypeRef?: { apiVersion?: string; kind?: string } };
}

export interface MRD extends Obj {
    spec?: {
        group?: string;
        names?: { kind?: string; plural?: string; categories?: string[] };
        scope?: 'Namespaced' | 'Cluster' | string;
        state?: 'Active' | 'Inactive' | string;
    };
    status?: { conditions?: Condition[] };
}

export interface MRAP extends Obj {
    spec?: { activate?: string[] };
    status?: { activated?: string[]; conditions?: Condition[] };
}

// ----- operations ----------------------------------------------------------------

export interface Operation extends Obj {
    spec?: { mode?: string; pipeline?: PipelineStep[]; retryLimit?: number };
    status?: { conditions?: Condition[]; failures?: number; appliedResourceRefs?: unknown[] };
}

export interface CronOperation extends Obj {
    spec?: { schedule?: string; suspend?: boolean };
    status?: { conditions?: Condition[]; lastScheduleTime?: string; lastSuccessfulTime?: string; runningOperationRefs?: unknown[] };
}

export interface WatchOperation extends Obj {
    spec?: { watch?: { apiVersion?: string; kind?: string } };
    status?: { conditions?: Condition[]; lastScheduleTime?: string; lastSuccessfulTime?: string; watchingResources?: number };
}

// ----- the Kubernetes objects around them ------------------------------------------

export interface CRD extends Obj {
    spec?: {
        group?: string;
        names?: { kind?: string; plural?: string; categories?: string[] };
        scope?: 'Namespaced' | 'Cluster' | string;
        versions?: { name: string; served?: boolean; storage?: boolean }[];
    };
}

export interface KubeEvent extends Obj {
    involvedObject?: { apiVersion?: string; kind?: string; name?: string; namespace?: string; uid?: string };
    reason?: string;
    message?: string;
    type?: 'Normal' | 'Warning' | string;
    count?: number;
    firstTimestamp?: string | null;
    lastTimestamp?: string | null;
    eventTime?: string | null;
    series?: { count?: number; lastObservedTime?: string };
    source?: { component?: string };
    reportingComponent?: string;
}

export interface Pod extends Obj {
    spec?: { nodeName?: string; containers?: { name: string; image?: string }[] };
    status?: {
        phase?: string;
        conditions?: Condition[];
        containerStatuses?: { name: string; ready?: boolean; restartCount?: number; image?: string; state?: Record<string, { reason?: string; message?: string } | undefined> }[];
        startTime?: string;
    };
}

/** Everything the model is built from, read in one go. */
export interface Snapshot {
    providers: Package[];
    functions: Package[];
    configurations: Package[];
    providerRevisions: PackageRevision[];
    functionRevisions: PackageRevision[];
    configurationRevisions: PackageRevision[];
    locks: Lock[];
    runtimeConfigs: RuntimeConfig[];
    imageConfigs: Obj[];
    xrds: XRD[];
    compositions: Composition[];
    compositionRevisions: CompositionRevision[];
    environmentConfigs: Obj[];
    mrds: MRD[];
    mraps: MRAP[];
    operations: Operation[];
    cronOperations: CronOperation[];
    watchOperations: WatchOperation[];
    usages: Obj[];
    crds: CRD[];
    events: KubeEvent[];
    pods: Pod[];
    /** Which of the optional kinds the cluster serves at all; a missing kind is not an empty one. */
    served: Record<string, boolean>;
}

/** The app's names for the kinds, in one place. */
export const KIND = {
    providers: 'crd:providers.pkg.crossplane.io',
    functions: 'crd:functions.pkg.crossplane.io',
    configurations: 'crd:configurations.pkg.crossplane.io',
    providerRevisions: 'crd:providerrevisions.pkg.crossplane.io',
    functionRevisions: 'crd:functionrevisions.pkg.crossplane.io',
    configurationRevisions: 'crd:configurationrevisions.pkg.crossplane.io',
    locks: 'crd:locks.pkg.crossplane.io',
    runtimeConfigs: 'crd:deploymentruntimeconfigs.pkg.crossplane.io',
    imageConfigs: 'crd:imageconfigs.pkg.crossplane.io',
    xrds: 'crd:compositeresourcedefinitions.apiextensions.crossplane.io',
    compositions: 'crd:compositions.apiextensions.crossplane.io',
    compositionRevisions: 'crd:compositionrevisions.apiextensions.crossplane.io',
    environmentConfigs: 'crd:environmentconfigs.apiextensions.crossplane.io',
    mrds: 'crd:managedresourcedefinitions.apiextensions.crossplane.io',
    mraps: 'crd:managedresourceactivationpolicies.apiextensions.crossplane.io',
    operations: 'crd:operations.ops.crossplane.io',
    cronOperations: 'crd:cronoperations.ops.crossplane.io',
    watchOperations: 'crd:watchoperations.ops.crossplane.io',
    usages: 'crd:usages.protection.crossplane.io',
    clusterUsages: 'crd:clusterusages.protection.crossplane.io',
    crds: 'customresourcedefinitions',
    events: 'events',
    pods: 'pods',
} as const;

export const PACKAGE_KIND: Record<PackageType, string> = {
    Provider: KIND.providers,
    Function: KIND.functions,
    Configuration: KIND.configurations,
};

/** The API groups Crossplane itself serves. Anything else an event names belongs to a provider or an XRD. */
export const CORE_GROUPS = ['pkg.crossplane.io', 'apiextensions.crossplane.io', 'ops.crossplane.io', 'protection.crossplane.io'];

/** The group of an `apiVersion`: `s3.aws.upbound.io/v1beta1` -> `s3.aws.upbound.io`; `v1` -> `''`. */
export function groupOf(apiVersion: string | undefined): string {
    if (!apiVersion) return '';
    const slash = apiVersion.indexOf('/');
    return slash < 0 ? '' : apiVersion.slice(0, slash);
}

/** The app's kind name for a custom resource: `crd:<plural>.<group>`. */
export function crdKind(plural: string, group: string): string {
    return `crd:${plural}.${group}`;
}
