// The Crossplane knowledge, tested without a cluster: how a package reference
// reads, how revisions, pods and the Lock join to a package, how MRDs and
// CRDs make the managed resource inventory, which Events are Crossplane's,
// and which problems the fixture cluster has.

import { describe, expect, it } from 'vitest';
import { NOW, snapshot } from '../fixtures.js';
import { bins, byReason, failing, occurrences } from './activity.js';
import { model } from './crossplane.js';
import { parseSource } from './packages.js';
import { problems, tally, verbFor } from './problems.js';
import { squarify } from '../ui/charts.js';

const m = model(snapshot());

describe('package references', () => {
    it('splits registry, org, repo and tag', () => {
        expect(parseSource('xpkg.upbound.io/upbound/provider-aws-s3:v2.1.0')).toEqual({ source: 'xpkg.upbound.io/upbound/provider-aws-s3', registry: 'xpkg.upbound.io', org: 'upbound', repo: 'provider-aws-s3', version: 'v2.1.0' });
    });
    it('defaults the registry to xpkg.crossplane.io', () => {
        const s = parseSource('crossplane-contrib/provider-nop:v0.4.0');
        expect(s.registry).toBe('xpkg.crossplane.io');
        expect(s.source).toBe('xpkg.crossplane.io/crossplane-contrib/provider-nop');
    });
    it('keeps a registry port and shortens a digest', () => {
        const s = parseSource('localhost:5000/team/fn@sha256:0123456789abcdef0123456789');
        expect(s.registry).toBe('localhost:5000');
        expect(s.version).toBe('sha256:0123456789ab');
    });
});

describe('packages', () => {
    it('reads every package with its state', () => {
        expect(m.providers).toHaveLength(7);
        expect(m.functions).toHaveLength(4);
        expect(m.configurations).toHaveLength(1);
        expect(m.providers.find((p) => p.name === 'provider-azure-network')?.state).toBe('unhealthy');
        expect(m.functions.find((p) => p.name === 'function-kcl')?.state).toBe('installing');
        expect(m.providers.find((p) => p.name === 'provider-aws-s3')?.state).toBe('healthy');
    });
    it('joins revisions and runtime pods', () => {
        const s3 = m.providers.find((p) => p.name === 'provider-aws-s3');
        expect(s3?.revisions.map((r) => r.revision)).toEqual([1, 2, 3]);
        expect(s3?.active?.version).toBe('v2.1.0');
        expect(s3?.runtime).toMatchObject({ pods: 1, ready: 1 });
        expect(m.providers.find((p) => p.name === 'provider-aws-ec2')?.runtime?.restarts).toBe(7);
    });
    it('draws the Lock as a graph, with a ghost for the missing dependency', () => {
        const missing = m.graph.nodes.filter((n) => n.missing);
        expect(missing.map((n) => n.label)).toEqual(['function-environment-configs']);
        const conf = m.graph.nodes.find((n) => n.label === 'acme-platform');
        const family = m.graph.nodes.find((n) => n.label === 'upbound-provider-family-aws');
        expect(conf?.depth).toBe(0);
        expect(family?.depth).toBe(2);
        expect(m.packages.find((p) => p.name === 'provider-aws-s3')?.usedBy).toContain('acme-platform');
    });
});

describe('APIs and compositions', () => {
    it('joins compositions to their XRDs and functions', () => {
        const pg = m.apis.apis.find((a) => a.kind === 'PostgresInstance');
        expect(pg?.compositions.map((c) => c.name)).toEqual(['postgres-aws', 'postgres-dev']);
        expect(pg?.compositions[0]?.steps[0]?.fn).toBeNull();
        expect(pg?.compositions[0]?.isDefault).toBe(true);
        expect(m.apis.orphans.map((c) => c.name)).toEqual(['xqueue-aws']);
    });
    it('reads a v1 XRD as LegacyCluster', () => {
        expect(m.apis.apis.find((a) => a.kind === 'XCluster')?.scope).toBe('LegacyCluster');
    });
    it('counts function use across pipelines', () => {
        const auto = m.apis.functionUse.find((f) => f.name === 'function-auto-ready');
        expect(auto?.steps).toBe(4);
    });
});

describe('managed resource kinds', () => {
    it('joins MRDs to providers, active or not', () => {
        const ec2 = m.perProvider.find((r) => r.provider === 'provider-aws-ec2');
        expect(ec2?.active).toBe(10);
        expect(ec2?.inactive).toBe(26);
        expect(m.kinds.filter((k) => k.state === 'Active').every((k) => k.served)).toBe(true);
    });
    it('gives every installed provider a row', () => {
        expect(m.perProvider.some((r) => r.provider === 'provider-azure-network')).toBe(true);
    });
});

describe('activity', () => {
    it('keeps only Crossplane events', () => {
        expect(m.events.some((e) => e.object.kind === 'Deployment')).toBe(false);
        expect(new Set(m.events.map((e) => e.area))).toEqual(new Set(['managed', 'composite', 'package', 'runtime', 'operation']));
    });
    it('spreads repeated events over their span', () => {
        const b = bins(m.events, NOW, 60 * 60_000, 12, (e) => e.object.name === 'team-a-logs-x7k2p');
        expect(b.reduce((n, x) => n + x.warning, 0)).toBe(34);
        expect(b.filter((x) => x.warning > 0).length).toBeGreaterThan(8);
        expect(occurrences(m.events, NOW, 60 * 60_000).warning).toBeGreaterThan(100);
    });
    it('ranks warning reasons and failing objects', () => {
        expect(byReason(m.events)[0]?.reason).toBe('CannotCreateExternalResource');
        expect(failing(m.events, (e) => e.area === 'managed')).toHaveLength(5);
    });
});

describe('problems', () => {
    const list = problems(m);
    const titles = list.map((p) => p.title);
    it('finds what is wrong in the fixture cluster', () => {
        expect(titles).toContain('The provider provider-azure-network is not healthy');
        expect(titles).toContain('Step environment of postgres-aws runs the function function-environment-configs, which is not installed');
        expect(titles).toContain('No Composition serves App');
        expect(titles).toContain('The Composition xcluster-legacy uses the legacy Resources mode');
        expect(titles).toContain('The Composition xqueue-aws is for an API that is not defined');
        expect(titles).toContain('2 Bucket objects cannot be created');
        expect(titles).toContain('A newer revision of provider-helm is waiting to be activated');
        expect(titles.some((t) => t.includes('function-environment-configs, which is not installed'))).toBe(true);
    });
    it('puts errors first', () => {
        expect(list[0]?.tone).toBe('error');
        expect(tally(list).error).toBeGreaterThan(3);
    });
    it('says reasons in words', () => {
        expect(verbFor('CannotCreateExternalResource')).toBe('cannot be created');
    });
});

describe('the treemap layout', () => {
    it('fills the box exactly', () => {
        const rects = squarify([6, 6, 4, 3, 2, 2, 1], { x: 0, y: 0, w: 600, h: 400 });
        const area = rects.reduce((n, r) => n + r.w * r.h, 0);
        expect(area).toBeCloseTo(240000, 3);
        for (const r of rects) {
            expect(r.x + r.w).toBeLessThanOrEqual(600.0001);
            expect(r.y + r.h).toBeLessThanOrEqual(400.0001);
        }
    });
});
