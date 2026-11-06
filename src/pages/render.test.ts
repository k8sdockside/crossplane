// @vitest-environment happy-dom
//
// Does each page actually draw?
//
// The model tests say the Crossplane knowledge is right; this says the pages
// put it on the screen, against three clusters: the fixture platform, a
// cluster without Crossplane, and a fresh Crossplane with nothing installed
// yet (core only, a default MRAP and runtime config -- what `helm install`
// leaves). It runs each page module against a stub of the bridge and reads
// the text that comes out.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LISTS } from '../fixtures.js';
import { KIND } from '../model/types.js';

type Lists = Record<string, unknown[]>;

let opened: unknown[] = [];

function bridge(lists: Lists, object: K8sDockside.SectionObject | null = null) {
    return {
        ready: async () => ({ pluginId: 'crossplane', viewId: '', sectionId: object ? 'panel' : '', object, contextId: 'test', contextName: 'test-cluster', readable: [], write: false, actions: [], theme: { id: 'k8sdockside-dark', base: 'dark' as const, tokens: {} } }),
        object: async () => null,
        list: async ({ kind }: { kind: string }) => {
            if (!(kind in lists)) throw new Error(`the cluster does not serve ${kind}`);
            return lists[kind];
        },
        get: async () => null,
        open: async (ref: unknown) => void opened.push(ref),
        openView: async () => null,
        openUrl: async () => null,
        summary: async () => ({ pluginId: 'crossplane', installed: true, checked: true, requirements: [], cards: [], error: '' }),
        storage: { get: async () => null, set: async () => null, remove: async () => null, keys: async () => [] },
        actions: async () => [],
        run: async () => ({ created: '' }),
        resize: async () => null,
        watch: () => () => {},
        namespaces: async () => [],
        charts: async () => ({ attached: false, source: {}, charts: [], range: 60 }),
        patch: async () => null,
        create: async () => ({ name: '' }),
        edit: async () => null,
        logs: async () => null,
        on: () => () => {},
    };
}

const PAGE = '<div id="page"><div id="head"></div><p id="first"></p><div id="body"></div></div>';

async function draw(module: string, lists: Lists, object: K8sDockside.SectionObject | null = null): Promise<string> {
    document.body.innerHTML = object ? '<div id="panel"></div>' : PAGE;
    vi.stubGlobal('k8sdockside', bridge(lists, object));
    vi.resetModules();
    await import(`./${module}.ts`);
    for (let i = 0; i < 40; i++) await new Promise((r) => setTimeout(r, 0));
    return document.body.textContent ?? '';
}

/** A fresh Crossplane: every core kind served, nothing installed but its defaults. */
const FRESH: Lists = Object.fromEntries(Object.values(KIND).map((k) => [k, []]));
FRESH[KIND.mraps] = [{ metadata: { name: 'default' }, spec: { activate: ['*'] }, status: { conditions: [{ type: 'Healthy', status: 'True', reason: 'Running' }] } }];
FRESH[KIND.runtimeConfigs] = [{ metadata: { name: 'default' } }];

beforeEach(() => {
    opened = [];
    vi.useRealTimers();
});
afterEach(() => {
    vi.unstubAllGlobals();
});

describe('the dashboard', () => {
    it('draws the fixture platform', async () => {
        const text = await draw('overview', LISTS);
        expect(text).toContain('errors to fix');
        expect(text).toContain('Package health');
        expect(text).toContain('Managed kinds by provider');
        expect(text).toContain('The last hour');
        expect(text).toContain('CannotCreateExternalResource');
        expect(text).toContain('The provider provider-azure-network is not healthy');
        expect(text).toContain('Crossplane 2.4.3');
    });
    it('says Crossplane is not installed on a cluster without it', async () => {
        const text = await draw('overview', { [KIND.pods]: [], [KIND.events]: [], [KIND.crds]: [] });
        expect(text).toContain('Crossplane is not installed here');
    });
    it('draws a fresh install without throwing', async () => {
        const text = await draw('overview', FRESH);
        expect(text).toContain('Crossplane is running, with nothing installed yet');
        expect(text).not.toContain('That did not work');
    });
});

describe('the views', () => {
    it.each([
        ['packages', ['Dependencies', 'Every package', 'provider-aws-s3', 'function-environment-configs', 'Revisions kept']],
        ['compositions', ['APIs and their pipelines', 'PostgresInstance', 'No Composition serves this API', 'Compositions for an API that is not defined', 'Pipeline length']],
        ['managed', ['The managed API surface', 'Failing managed resources', 'team-a-logs-x7k2p', 'Every managed kind', 'SecurityGroupRule']],
        ['activity', ['Over time', 'By area, over time', 'Busiest objects', 'ComposeResources']],
        ['problems', ['By severity', 'Fix:', 'legacy Resources mode']],
    ])('%s draws', async (module, expected) => {
        const text = await draw(module, LISTS);
        expect(text).not.toContain('That did not work');
        for (const e of expected) expect(text).toContain(e);
    });
    it.each(['packages', 'compositions', 'managed', 'activity', 'problems'])('%s draws a fresh install', async (module) => {
        const text = await draw(module, FRESH);
        expect(text).not.toContain('That did not work');
    });
});

describe('the panels', () => {
    it('draws a provider, with its kinds', async () => {
        const text = await draw('package', LISTS, { kind: KIND.providers, namespace: '', name: 'provider-aws-ec2' });
        expect(text).toContain('provider-aws-ec2');
        expect(text).toContain('Managed resource kinds');
        expect(text).toContain('SecurityGroupRule');
    });
    it('draws a function, with the compositions that use it', async () => {
        const text = await draw('package', LISTS, { kind: KIND.functions, namespace: '', name: 'function-auto-ready' });
        expect(text).toContain('Used by 4 Compositions');
    });
    it('draws an XRD with its pipelines', async () => {
        const text = await draw('api', LISTS, { kind: KIND.xrds, namespace: '', name: 'postgresinstances.db.acme.io' });
        expect(text).toContain('postgres-aws');
        expect(text).toContain('postgres-dev');
        expect(text).toContain('cannot compose their resources');
    });
    it('draws a composition pipeline', async () => {
        const text = await draw('api', LISTS, { kind: KIND.compositions, namespace: '', name: 'xqueue-aws' });
        expect(text).toContain('no XRD defines it');
    });
});
