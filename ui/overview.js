// Built by k8sdockside-plugin from src/ -- edit the TypeScript there, not this file.
"use strict";
(() => {
  // src/model/types.ts
  var KIND = {
    providers: "crd:providers.pkg.crossplane.io",
    functions: "crd:functions.pkg.crossplane.io",
    configurations: "crd:configurations.pkg.crossplane.io",
    providerRevisions: "crd:providerrevisions.pkg.crossplane.io",
    functionRevisions: "crd:functionrevisions.pkg.crossplane.io",
    configurationRevisions: "crd:configurationrevisions.pkg.crossplane.io",
    locks: "crd:locks.pkg.crossplane.io",
    runtimeConfigs: "crd:deploymentruntimeconfigs.pkg.crossplane.io",
    imageConfigs: "crd:imageconfigs.pkg.crossplane.io",
    xrds: "crd:compositeresourcedefinitions.apiextensions.crossplane.io",
    compositions: "crd:compositions.apiextensions.crossplane.io",
    compositionRevisions: "crd:compositionrevisions.apiextensions.crossplane.io",
    environmentConfigs: "crd:environmentconfigs.apiextensions.crossplane.io",
    mrds: "crd:managedresourcedefinitions.apiextensions.crossplane.io",
    mraps: "crd:managedresourceactivationpolicies.apiextensions.crossplane.io",
    operations: "crd:operations.ops.crossplane.io",
    cronOperations: "crd:cronoperations.ops.crossplane.io",
    watchOperations: "crd:watchoperations.ops.crossplane.io",
    usages: "crd:usages.protection.crossplane.io",
    clusterUsages: "crd:clusterusages.protection.crossplane.io",
    crds: "customresourcedefinitions",
    events: "events",
    pods: "pods"
  };
  var PACKAGE_KIND = {
    Provider: KIND.providers,
    Function: KIND.functions,
    Configuration: KIND.configurations
  };
  var CORE_GROUPS = ["pkg.crossplane.io", "apiextensions.crossplane.io", "ops.crossplane.io", "protection.crossplane.io"];
  function groupOf(apiVersion) {
    if (!apiVersion) return "";
    const slash = apiVersion.indexOf("/");
    return slash < 0 ? "" : apiVersion.slice(0, slash);
  }

  // src/model/activity.ts
  function ms(...values) {
    for (const v of values) {
      if (!v) continue;
      const t = Date.parse(v);
      if (Number.isFinite(t)) return t;
    }
    return NaN;
  }
  function classifier(kinds, composites, pods) {
    const managed = /* @__PURE__ */ new Map();
    for (const k of kinds) managed.set(`${k.group}/${k.kind}`, k);
    return { managed, composites, pods: new Set(pods.map((p) => `${p.metadata.namespace ?? ""}/${p.metadata.name}`)) };
  }
  var PKG_PLURAL = {
    Provider: "providers",
    Function: "functions",
    Configuration: "configurations",
    ProviderRevision: "providerrevisions",
    FunctionRevision: "functionrevisions",
    ConfigurationRevision: "configurationrevisions",
    DeploymentRuntimeConfig: "deploymentruntimeconfigs",
    ImageConfig: "imageconfigs",
    CompositeResourceDefinition: "compositeresourcedefinitions",
    Composition: "compositions",
    CompositionRevision: "compositionrevisions",
    ManagedResourceDefinition: "managedresourcedefinitions",
    ManagedResourceActivationPolicy: "managedresourceactivationpolicies",
    EnvironmentConfig: "environmentconfigs",
    Operation: "operations",
    CronOperation: "cronoperations",
    WatchOperation: "watchoperations",
    Usage: "usages",
    ClusterUsage: "clusterusages"
  };
  function eventView(e, c) {
    const o = e.involvedObject ?? {};
    const group = groupOf(o.apiVersion);
    const kind = o.kind ?? "";
    let area = null;
    let provider = "";
    let appKind = "";
    if (group === "pkg.crossplane.io") area = "package";
    else if (group === "ops.crossplane.io") area = "operation";
    else if (CORE_GROUPS.includes(group)) area = "api";
    else if (c.managed.has(`${group}/${kind}`)) {
      const k = c.managed.get(`${group}/${kind}`);
      area = "managed";
      provider = k?.provider ?? "";
      appKind = k?.served ? k.appKind : "";
    } else if (c.composites.has(`${group}/${kind}`)) {
      area = "composite";
      appKind = c.composites.get(`${group}/${kind}`) ?? "";
    } else if (kind === "Pod" && c.pods.has(`${o.namespace ?? e.metadata.namespace ?? ""}/${o.name ?? ""}`)) {
      area = "runtime";
      appKind = "pods";
    }
    if (!area) return null;
    if (!appKind && CORE_GROUPS.includes(group) && PKG_PLURAL[kind]) appKind = `crd:${PKG_PLURAL[kind]}.${group}`;
    const last = ms(e.lastTimestamp, e.series?.lastObservedTime, e.eventTime, e.firstTimestamp, e.metadata.creationTimestamp);
    const first = ms(e.firstTimestamp, e.eventTime, e.lastTimestamp, e.metadata.creationTimestamp);
    return {
      key: e.metadata.uid ?? `${e.metadata.namespace}/${e.metadata.name}`,
      warning: e.type === "Warning",
      reason: e.reason ?? "",
      message: (e.message ?? "").trim(),
      count: Math.max(1, e.series?.count ?? e.count ?? 1),
      first: Number.isFinite(first) ? first : last,
      last,
      area,
      object: { apiVersion: o.apiVersion ?? "", group, kind, name: o.name ?? "", namespace: o.namespace ?? "" },
      provider,
      appKind
    };
  }
  function events(list, c) {
    return list.map((e) => eventView(e, c)).filter((e) => !!e && Number.isFinite(e.last)).sort((a, b) => b.last - a.last);
  }
  function bins(list, now, window, n, filter = () => true) {
    const size = window / n;
    const start2 = now - window;
    const out = Array.from({ length: n }, (_, i) => ({ start: start2 + i * size, end: start2 + (i + 1) * size, normal: 0, warning: 0 }));
    for (const e of list) {
      if (!filter(e)) continue;
      const span = Math.max(0, e.last - e.first);
      const steps = span === 0 ? 1 : Math.min(e.count, 240);
      const weight = e.count / steps;
      for (let i = 0; i < steps; i++) {
        const t = steps === 1 ? e.last : e.first + span * i / (steps - 1);
        if (t < start2 || t > now) continue;
        const idx = Math.min(n - 1, Math.floor((t - start2) / size));
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
  function occurrences(list, now, window, filter = () => true) {
    const b = bins(list, now, window, 1, filter)[0];
    return { normal: b?.normal ?? 0, warning: b?.warning ?? 0 };
  }
  function byReason(list, filter = (e) => e.warning) {
    const map = /* @__PURE__ */ new Map();
    for (const e of list) {
      if (!filter(e)) continue;
      const row = map.get(e.reason) ?? { reason: e.reason || "no reason", count: 0, objects: /* @__PURE__ */ new Set() };
      row.count += e.count;
      row.objects.add(`${e.object.kind}/${e.object.namespace}/${e.object.name}`);
      map.set(e.reason, row);
    }
    return [...map.values()].map((r) => ({ reason: r.reason, count: r.count, objects: r.objects.size })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
  }
  function failing(list, filter = () => true) {
    const map = /* @__PURE__ */ new Map();
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

  // src/model/tone.ts
  var RANK = { error: 4, warn: 3, "": 2, info: 1, ok: 0 };
  function toneRank(tone) {
    return RANK[tone] ?? 2;
  }
  function worst(tones) {
    let out = "ok";
    for (const t of tones) if (toneRank(t) > toneRank(out)) out = t;
    return out;
  }
  function condition(conditions, type) {
    return conditions?.find((c) => c.type === type);
  }
  function isTrue(conditions, type) {
    const c = condition(conditions, type);
    if (!c) return null;
    if (c.status === "True") return true;
    if (c.status === "False") return false;
    return null;
  }
  function positiveTone(conditions, type) {
    const v = isTrue(conditions, type);
    return v === true ? "ok" : v === false ? "error" : "warn";
  }
  function badConditions(conditions) {
    return (conditions ?? []).filter((c) => c.status !== "True").sort((a, b) => (a.status === "False" ? -1 : 0) - (b.status === "False" ? -1 : 0));
  }
  function plural(n, one, many = `${one}s`) {
    return `${n} ${n === 1 ? one : many}`;
  }

  // src/model/problems.ts
  var LOWER = { Provider: "provider", Function: "function", Configuration: "configuration" };
  function packageProblems(p, out) {
    const what = LOWER[p.type] ?? "package";
    const c = p.trouble;
    const verbatim = { reason: c?.reason ?? "", message: c?.message ?? "" };
    const source = p.src.source ? `${p.src.source}${p.src.version ? `:${p.src.version}` : ""}` : "its package";
    if (p.state === "unhealthy") {
      const pull = /pull|manifest|unauthorized|not found|denied|ErrImage/i.test(c?.message ?? "");
      out.push({
        tone: "error",
        area: "package",
        title: `The ${what} ${p.name} is not healthy`,
        subject: source,
        explain: pull ? `Crossplane could not fetch ${source}. Until it can, nothing this ${what} provides is installed.` : p.type === "Provider" ? `The provider's controller is not running as it should, so none of its managed resources are being reconciled.` : p.type === "Function" ? "Every Composition with a pipeline step on this function fails to compose until it is healthy." : "Its APIs and Compositions, or one of the packages it depends on, did not install.",
        fix: pull ? "Check the package reference and tag, that the registry is reachable from the cluster, and the packagePullSecrets for a private registry." : `Read the condition's message below, then the ${what}'s revision and its pod's logs.`,
        ...verbatim,
        ref: p.ref
      });
    } else if (p.state === "waiting") {
      out.push({
        tone: "warn",
        area: "package",
        title: `Nothing has reconciled the ${what} ${p.name} yet`,
        subject: source,
        explain: "It has no status at all. Crossplane writes Installed and Healthy within seconds of a package being created.",
        fix: "Check that Crossplane's own pod is running; its logs say why it has not got to this package.",
        reason: "",
        message: "",
        ref: p.ref
      });
    } else if (p.state === "installing") {
      out.push({
        tone: "warn",
        area: "package",
        title: `The ${what} ${p.name} is still installing`,
        subject: source,
        explain: "Crossplane is unpacking it or waiting for its revision to become healthy.",
        fix: "Give it a minute. If it stays here, the condition below says what it is waiting for.",
        ...verbatim,
        ref: p.ref
      });
    }
    const rt = p.runtime;
    if (rt && rt.pods > 0 && rt.ready < rt.pods && p.state !== "installing") {
      out.push({
        tone: rt.waiting ? "error" : "warn",
        area: "package",
        title: rt.waiting ? `The ${what} ${p.name}'s pod is in ${rt.waiting}` : `${rt.pods - rt.ready} of ${plural(rt.pods, "pod")} of the ${what} ${p.name} not ready`,
        subject: rt.restarts ? `${plural(rt.restarts, "restart")}` : "runtime",
        explain: p.type === "Provider" ? "While its pod is not ready nothing reconciles the managed resources it owns." : "While its pod is not ready, every pipeline step on it fails.",
        fix: "Open the pod and read its logs. A DeploymentRuntimeConfig is where its resources, arguments and service account are set.",
        reason: rt.waiting,
        message: "",
        ref: rt.pod ? { kind: "pods", namespace: rt.pod.namespace, name: rt.pod.name } : p.ref
      });
    }
    if (p.active && p.active.invalidDependencies > 0) {
      out.push({
        tone: "error",
        area: "package",
        title: `${p.name} has ${plural(p.active.invalidDependencies, "dependency", "dependencies")} it cannot satisfy`,
        subject: p.active.name,
        explain: "A package it depends on is installed at a version outside the constraint its metadata declares.",
        fix: "Upgrade or pin the dependency to a version that fits, or set skipDependencyResolution on the package if you manage dependencies yourself.",
        reason: "",
        message: "",
        ref: { kind: p.ref.kind.replace(/s\.pkg/, "revisions.pkg"), name: p.active.name }
      });
    }
    const latest = p.revisions[p.revisions.length - 1];
    if (p.activationPolicy === "Manual" && latest && !latest.active && p.active && latest.revision > p.active.revision) {
      out.push({
        tone: "info",
        area: "package",
        title: `A newer revision of ${p.name} is waiting to be activated`,
        subject: `${latest.version || latest.name} (revision ${latest.revision})`,
        explain: `The ${what} uses a Manual activation policy, so ${latest.name} stays inactive until you activate it.`,
        fix: `Set spec.desiredState: Active on ${latest.name} when you are ready.`,
        reason: "",
        message: "",
        ref: { kind: p.ref.kind.replace(/s\.pkg/, "revisions.pkg"), name: latest.name }
      });
    }
  }
  var AREA_PROBLEM = { managed: "managed", composite: "composite", operation: "operation" };
  function problems(m) {
    const out = [];
    for (const p of m.core.pods) {
      if (p.ready) continue;
      out.push({
        tone: p.waiting ? "error" : "warn",
        area: "core",
        title: p.component === "crossplane" ? "Crossplane's own pod is not ready" : "Crossplane's RBAC manager is not ready",
        subject: `${p.namespace}/${p.name}`,
        explain: p.component === "crossplane" ? "Nothing is reconciled while it is down: no packages install, no composite resource composes." : "New providers and XRDs do not get the roles they need while it is down.",
        fix: "Open the pod and read its logs and events.",
        reason: p.waiting,
        message: "",
        ref: { kind: "pods", namespace: p.namespace, name: p.name }
      });
    }
    for (const p of m.packages) packageProblems(p, out);
    for (const e of m.graph.edges) {
      if (!e.missing) continue;
      const from = m.graph.nodes.find((n) => n.id === e.from);
      const to = m.graph.nodes.find((n) => n.id === e.to);
      out.push({
        tone: "error",
        area: "package",
        title: `${from?.label ?? "A package"} depends on ${to?.label ?? "a package"}, which is not installed`,
        subject: `${to?.source ?? ""}${e.constraints ? ` ${e.constraints}` : ""}`,
        explain: "The package manager installs dependencies on its own unless it was told not to; until this one is there the package that needs it is not healthy.",
        fix: "Install the dependency at a version inside the constraint, or check why Crossplane could not resolve it in its logs.",
        reason: "",
        message: "",
        ref: from?.pkg?.ref ?? null
      });
    }
    for (const a of m.apis.apis) {
      const subject = `${a.kind}.${a.group}`;
      if (a.established === false || a.established === null) {
        out.push({
          tone: a.established === false ? "error" : "warn",
          area: "api",
          title: `The API ${a.kind} is not established`,
          subject,
          explain: "Crossplane has not created the CRD for this API, or is not watching it, so nobody can create one.",
          fix: "Read the XRD's Established condition; a schema the API server refuses is the usual cause.",
          reason: "",
          message: "",
          ref: a.ref
        });
      }
      if (a.claimKind && a.offered === false) {
        out.push({ tone: "error", area: "api", title: `The claim ${a.claimKind} is not offered`, subject, explain: "Namespaced claims of this API cannot be created.", fix: "Read the XRD's Offered condition.", reason: "", message: "", ref: a.ref });
      }
      if (a.compositions.length === 0) {
        out.push({
          tone: "warn",
          area: "api",
          title: `No Composition serves ${a.kind}`,
          subject,
          explain: `An ${a.kind} can be created, but nothing will compose it: it waits for a Composition forever.`,
          fix: `Add a Composition with compositeTypeRef ${a.group}/${a.referenceable || "v1"} ${a.kind}.`,
          reason: "",
          message: "",
          ref: a.ref
        });
      }
      if (a.defaultComposition && !a.compositions.some((c) => c.name === a.defaultComposition)) {
        out.push({
          tone: "error",
          area: "api",
          title: `${a.kind}'s default Composition ${a.defaultComposition} does not exist`,
          subject,
          explain: "A composite resource that does not choose a Composition gets the default, and there is none to get.",
          fix: `Create ${a.defaultComposition}, or point defaultCompositionRef at one that exists.`,
          reason: "",
          message: "",
          ref: a.ref
        });
      }
    }
    for (const c of m.apis.compositions) {
      if (!c.api) {
        out.push({
          tone: "warn",
          area: "composition",
          title: `The Composition ${c.name} is for an API that is not defined`,
          subject: `${c.kind} ${c.apiVersion}`,
          explain: "No XRD defines this composite type, so the Composition is never used.",
          fix: "Fix compositeTypeRef, or install the XRD (or the Configuration that brings it).",
          reason: "",
          message: "",
          ref: c.ref
        });
      }
      if (c.legacy) {
        out.push({
          tone: "warn",
          area: "composition",
          title: `The Composition ${c.name} uses the legacy Resources mode`,
          subject: c.kind,
          explain: "Crossplane v2 composes with function pipelines only. Native patch-and-transform is gone.",
          fix: "Convert it with `crossplane beta convert pipeline-composition`, which moves its resources into a function-patch-and-transform step.",
          reason: "",
          message: "",
          ref: c.ref
        });
      } else if (c.steps.length === 0) {
        out.push({ tone: "error", area: "composition", title: `The Composition ${c.name} has an empty pipeline`, subject: c.kind, explain: "It composes nothing.", fix: "Add at least one pipeline step.", reason: "", message: "", ref: c.ref });
      }
      for (const s of c.steps) {
        if (!s.fn) {
          out.push({
            tone: "error",
            area: "composition",
            title: `Step ${s.step} of ${c.name} runs the function ${s.functionName}, which is not installed`,
            subject: c.kind,
            explain: `Every ${c.kind} using this Composition fails at that step.`,
            fix: `Install the Function ${s.functionName} -- its name must match functionRef.name exactly.`,
            reason: "",
            message: "",
            ref: c.ref
          });
        } else if (s.fn.tone === "error") {
          out.push({
            tone: "error",
            area: "composition",
            title: `Step ${s.step} of ${c.name} runs ${s.functionName}, which is unhealthy`,
            subject: c.kind,
            explain: `Every ${c.kind} using this Composition fails at that step.`,
            fix: `Fix the Function ${s.functionName} first.`,
            reason: "",
            message: "",
            ref: s.fn.ref
          });
        }
      }
    }
    const groups = /* @__PURE__ */ new Map();
    for (const f of failing(m.events, (e) => e.area === "managed" || e.area === "composite" || e.area === "operation")) {
      const area = AREA_PROBLEM[f.area];
      if (!area) continue;
      const key = `${area}/${f.object.group}/${f.object.kind}/${f.reason}`;
      const g = groups.get(key);
      const ref = f.appKind ? { kind: f.appKind, namespace: f.object.namespace || void 0, name: f.object.name } : null;
      if (g) {
        g.objects++;
        g.count += f.count;
      } else groups.set(key, { area, kind: f.object.kind, reason: f.reason, message: f.message, provider: f.provider, objects: 1, count: f.count, ref });
    }
    for (const g of groups.values()) {
      const many = g.objects > 1;
      out.push({
        tone: /^Cannot|Failed|Error/i.test(g.reason) || g.area !== "managed" ? "error" : "warn",
        area: g.area,
        title: `${many ? `${g.objects} ${g.kind} objects` : `${/^[AEIOU]/.test(g.kind) ? "An" : "A"} ${g.kind}`} ${verbFor(g.reason)}`,
        subject: g.provider ? `${g.kind} · ${g.provider}` : g.kind,
        explain: g.area === "managed" ? "The provider recorded this in the last hour. The external resource may not match what was asked for." : g.area === "composite" ? "Crossplane could not finish composing it in the last hour." : "The operation failed in the last hour.",
        fix: fixFor(g.reason),
        reason: g.reason,
        message: g.message,
        ref: g.ref
      });
    }
    for (const mrap of m.snap.mraps) {
      const bad = (mrap.status?.conditions ?? []).find((c) => c.status === "False");
      if (bad) out.push({ tone: "warn", area: "managed", title: `The activation policy ${mrap.metadata.name} is not healthy`, subject: (mrap.spec?.activate ?? []).join(", "), explain: "Managed resource kinds it names may not have been activated.", fix: "Read its condition below.", reason: bad.reason ?? "", message: bad.message ?? "", ref: { kind: KIND.mraps, name: mrap.metadata.name } });
    }
    return out.sort((a, b) => toneRank(b.tone) - toneRank(a.tone) || areaOrder(a.area) - areaOrder(b.area) || a.title.localeCompare(b.title));
  }
  var ORDER = ["core", "package", "api", "composition", "composite", "managed", "operation"];
  function areaOrder(a) {
    return ORDER.indexOf(a);
  }
  function verbFor(reason) {
    const r = reason.replace(/ExternalResource$/, "");
    const words = {
      CannotConnectToProvider: "cannot reach their provider config",
      CannotObserve: "cannot be observed",
      CannotCreate: "cannot be created",
      CannotUpdate: "cannot be updated",
      CannotDelete: "cannot be deleted",
      CannotInitializeManagedResource: "cannot be initialised",
      CannotResolveResourceReferences: "cannot resolve their references",
      CannotPublishConnectionDetails: "cannot publish connection details",
      ComposeResources: "cannot compose their resources",
      SelectComposition: "cannot select a Composition",
      RunFunctionPipeline: "fail in the function pipeline",
      BindCompositeResource: "cannot bind their composite",
      ConfigureCompositeResource: "cannot be configured",
      ReconciliationPaused: "are paused"
    };
    return words[r] ?? words[reason] ?? `report ${reason || "a warning"}`;
  }
  function fixFor(reason) {
    if (/ConnectToProvider/.test(reason)) return "Check the ProviderConfig the resource names exists, and that the credentials it points at are valid.";
    if (/Observe|Create|Update|Delete/.test(reason)) return "The message is the cloud API's own answer. Most often it is a permission the provider's credentials lack, or a field the API refuses.";
    if (/ResolveResourceReferences/.test(reason)) return "A resource it references (by Ref or Selector) does not exist yet or is not ready.";
    if (/Compose|Function/.test(reason)) return "Read the message: it names the pipeline step that failed. `crossplane beta trace` shows the whole tree.";
    if (/SelectComposition/.test(reason)) return "Make sure a Composition exists for its type, and that its compositionSelector matches one.";
    return "Read the message below.";
  }
  function tally(list) {
    return {
      error: list.filter((p) => p.tone === "error").length,
      warn: list.filter((p) => p.tone === "warn").length,
      info: list.filter((p) => p.tone === "info").length
    };
  }

  // node_modules/@k8sdockside/plugin-sdk/dom.js
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) {
      if (value === void 0 || value === false) continue;
      if (name === "class") node.className = String(value);
      else if (name === "text") node.textContent = String(value);
      else node.setAttribute(name, String(value));
    }
    append(node, children);
    return node;
  }
  function replace(parent, ...children) {
    parent.replaceChildren();
    append(parent, children);
  }
  function byId(id) {
    const node = document.getElementById(id);
    if (!node) throw new Error(`the page has no #${id}`);
    return node;
  }
  function append(parent, children) {
    for (const child of children) {
      if (child === null || child === void 0 || child === false) continue;
      parent.append(child);
    }
  }

  // src/ui/dom.ts
  function svgEl(tag, attrs = {}, ...children) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [name, value] of Object.entries(attrs)) if (value !== void 0) node.setAttribute(name, String(value));
    for (const child of children) {
      if (child === null || child === void 0 || child === false) continue;
      node.append(child);
    }
    return node;
  }

  // src/ui/parts.ts
  var VIEWS = [
    ["overview", "Dashboard"],
    ["packages", "Packages"],
    ["compositions", "Compositions"],
    ["managed", "Managed resources"],
    ["activity", "Activity"],
    ["problems", "Problems"]
  ];
  function heading(current, title, note, problems2 = null) {
    const nav = el("nav", { class: "tabs", "aria-label": "Crossplane views" });
    for (const [id, label] of VIEWS) {
      const here = id === current;
      const tab = el(
        "button",
        { type: "button", class: here ? "tab here" : "tab", "aria-current": here ? "page" : void 0 },
        label,
        id === "problems" && problems2 ? el("span", { class: "tab-count" }, String(problems2)) : null
      );
      if (!here) tab.addEventListener("click", () => void k8sdockside.openView(id));
      nav.append(tab);
    }
    return el(
      "header",
      { class: "page-head" },
      el("div", { class: "page-title" }, el("img", { class: "mark", src: "logo.svg", alt: "", width: 30, height: 30 }), el("div", {}, el("h1", {}, title), note ? el("p", { class: "note" }, note) : null)),
      nav
    );
  }
  function dot(tone) {
    return el("span", { class: `dot dot-${tone || "none"}`, "aria-hidden": "true" });
  }
  function pill(text, tone = "", title = "") {
    return el("span", { class: `pill pill-${tone || "none"}`, title: title || void 0 }, text);
  }
  function block(title, note, ...children) {
    return el("section", { class: "block" }, el("div", { class: "block-head" }, el("h2", {}, title)), note ? el("p", { class: "note" }, note) : null, ...children);
  }
  function nothing(message) {
    return el("p", { class: "empty" }, message);
  }
  function clickable(node, onPick) {
    node.classList.add("pick");
    node.setAttribute("role", "button");
    node.setAttribute("tabindex", "0");
    node.addEventListener("click", onPick);
    node.addEventListener("keydown", (event) => {
      const key = event.key;
      if (key === "Enter" || key === " ") {
        event.preventDefault();
        onPick();
      }
    });
    return node;
  }
  function open(ref) {
    if (!ref) return;
    void k8sdockside.open({ kind: ref.kind, namespace: ref.namespace || void 0, name: ref.name || void 0 }).catch(() => void 0);
  }
  function linkButton(label, onClick) {
    const b = el("button", { type: "button", class: "link-button" }, label);
    b.addEventListener("click", onClick);
    return b;
  }
  function action(label, onClick, primary = false) {
    const b = el("button", { type: "button", class: primary ? "primary" : void 0 }, label);
    b.addEventListener("click", onClick);
    return b;
  }
  function clock(when) {
    try {
      if (k8sdockside.format) return k8sdockside.format.time(new Date(when));
    } catch {
    }
    const d = new Date(when);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  var tipNode = null;
  function tipHost() {
    if (tipNode && tipNode.isConnected) return tipNode;
    tipNode = el("div", { class: "tip", role: "tooltip", hidden: true });
    document.body.append(tipNode);
    return tipNode;
  }
  function place(tip2, x, y) {
    const w = tip2.offsetWidth || 180;
    const h = tip2.offsetHeight || 40;
    const vw = document.documentElement.clientWidth || 800;
    let left = x + 14;
    if (left + w > vw - 8) left = Math.max(8, x - w - 14);
    let top = y - h - 10;
    if (top < 4) top = y + 18;
    tip2.style.left = `${left}px`;
    tip2.style.top = `${top}px`;
  }
  function tip(node, lines) {
    const read2 = () => typeof lines === "function" ? lines() : lines;
    const show = (x, y) => {
      const t = tipHost();
      const [first, ...rest] = read2();
      replace(t, el("strong", {}, first ?? ""), ...rest.map((l) => el("div", {}, l)));
      t.hidden = false;
      place(t, x, y);
    };
    const hide = () => {
      if (tipNode) tipNode.hidden = true;
    };
    node.addEventListener("mouseenter", (e) => show(e.clientX, e.clientY));
    node.addEventListener("mousemove", (e) => {
      if (tipNode && !tipNode.hidden) place(tipNode, e.clientX, e.clientY);
    });
    node.addEventListener("mouseleave", hide);
    node.addEventListener("focus", () => {
      const r = node.getBoundingClientRect();
      show(r.left + r.width / 2, r.top);
    });
    node.addEventListener("blur", hide);
    return node;
  }

  // src/ui/charts.ts
  function series(i) {
    return `var(--chart-${Math.min(8, Math.max(1, i + 1))})`;
  }
  function palette(names) {
    const sorted = [...new Set(names)].sort();
    const index = new Map(sorted.map((n, i) => [n, i]));
    return (name) => series(Math.min(7, index.get(name) ?? 7));
  }
  var STATUS = {
    ok: "var(--ok)",
    warn: "var(--warn)",
    error: "var(--error)",
    none: "var(--text-faint)",
    idle: "var(--border)"
  };
  function share(part, total) {
    if (!total) return "0%";
    const p = part / total * 100;
    return p >= 10 || p === 0 || Number.isInteger(p) ? `${Math.round(p)}%` : `${p.toFixed(1)}%`;
  }
  function compact(n) {
    if (Math.abs(n) < 1e4) return Math.round(n).toLocaleString("en-US");
    if (Math.abs(n) < 1e6) return `${(n / 1e3).toFixed(n < 1e5 ? 1 : 0).replace(/\.0$/, "")}K`;
    return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  }
  function niceMax(max) {
    if (max <= 0) return { top: 1, step: 1 };
    const rough = max / 4;
    const mag = 10 ** Math.floor(Math.log10(rough));
    const norm = rough / mag;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
    const nice = Math.max(1, step < 1 ? 1 : step);
    return { top: Math.ceil(max / nice) * nice, step: nice };
  }
  function legend(items, className = "") {
    return el(
      "ul",
      { class: `legend ${className}`.trim() },
      ...items.map((i) => {
        const sw = el("span", { class: "swatch", "aria-hidden": "true" });
        sw.style.background = i.colour;
        return el("li", {}, sw, el("span", { class: "legend-label" }, i.label), i.value !== void 0 ? el("span", { class: "legend-value" }, i.value) : null);
      })
    );
  }
  function donut(parts, centre, opts = {}) {
    const size = opts.size ?? 148;
    const thick = opts.thickness ?? 16;
    const r = (size - thick) / 2;
    const c = 2 * Math.PI * r;
    const mid = size / 2;
    const total = parts.reduce((n, p) => n + Math.max(0, p.value), 0);
    const drawn = parts.filter((p) => p.value > 0);
    const gap = drawn.length > 1 ? 2 : 0;
    const ring = svgEl("svg", { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: "donut-svg", role: "img", "aria-label": opts.title ?? centre.label });
    ring.append(svgEl("circle", { cx: mid, cy: mid, r, class: "donut-track", "stroke-width": thick }));
    let offset = 0;
    const arcs = [];
    for (const p of drawn) {
      const length = p.value / total * c;
      const arc = svgEl("circle", {
        cx: mid,
        cy: mid,
        r,
        class: "donut-arc",
        "stroke-width": thick,
        "stroke-dasharray": `${Math.max(0.5, length - gap)} ${c}`,
        "stroke-dashoffset": String(-offset),
        transform: `rotate(-90 ${mid} ${mid})`
      });
      arc.style.stroke = p.colour;
      tip(arc, () => [p.label, `${compact(p.value)} · ${share(p.value, total)}`, ...p.note ?? []]);
      if (p.onPick) clickable(arc, p.onPick);
      ring.append(arc);
      arcs.push({ part: p, node: arc });
      offset += length;
    }
    const centreNode = el("div", { class: "donut-centre" }, el("div", { class: "donut-value" }, centre.value), el("div", { class: "donut-label" }, centre.label));
    const wrap = el("div", { class: "donut-ring" }, ring, centreNode);
    wrap.style.width = wrap.style.height = `${size}px`;
    if (opts.legend === false) return el("div", { class: "donut" }, wrap);
    const list = el("ul", { class: "legend legend-table" });
    for (const p of parts) {
      const sw = el("span", { class: "swatch", "aria-hidden": "true" });
      sw.style.background = p.colour;
      const row = el("li", { class: p.value === 0 ? "zero" : void 0 }, sw, el("span", { class: "legend-label" }, p.label), el("span", { class: "legend-value" }, compact(p.value)), el("span", { class: "legend-share" }, share(p.value, total)));
      const arc = arcs.find((a) => a.part === p)?.node;
      if (arc) {
        row.addEventListener("mouseenter", () => arc.classList.add("lit"));
        row.addEventListener("mouseleave", () => arc.classList.remove("lit"));
      }
      if (p.onPick) clickable(row, p.onPick);
      list.append(row);
    }
    return el("div", { class: "donut" }, wrap, list);
  }
  function bars(rows, opts = {}) {
    const fmt = opts.unit ?? compact;
    const max = opts.max ?? Math.max(1, ...rows.map((r) => r.parts.reduce((n, p) => n + p.value, 0)));
    const list = el("div", { class: "bars" });
    for (const r of rows) {
      const total = r.parts.reduce((n, p) => n + p.value, 0);
      const track = el("div", { class: "bar-track" });
      const fill = el("div", { class: "bar-fill" });
      fill.style.width = `${total / max * 100}%`;
      for (const p of r.parts) {
        if (p.value <= 0) continue;
        const seg = el("div", { class: "bar-seg" });
        seg.style.flexGrow = String(p.value);
        seg.style.background = p.colour;
        tip(seg, () => [r.label, `${p.label}: ${fmt(p.value)}${r.parts.length > 1 ? ` of ${fmt(total)}` : ""}`, ...p.note ?? []]);
        fill.append(seg);
      }
      track.append(fill);
      const row = el("div", { class: "bar-row" }, el("div", { class: "bar-label", title: r.label }, el("span", { class: "bar-name" }, r.label), r.sub ? el("span", { class: "bar-sub" }, r.sub) : null), track, el("div", { class: "bar-value" }, fmt(total)));
      if (r.onPick) clickable(row, r.onPick);
      list.append(row);
    }
    return el("div", { class: "bars-chart" }, list, opts.legend && opts.legend.length > 1 ? legend(opts.legend) : null);
  }
  function columns(cols, opts = {}) {
    const height = opts.height ?? 150;
    const max = Math.max(0, ...cols.map((c) => c.parts.reduce((n, p) => n + p.value, 0)));
    const { top, step } = niceMax(max);
    const plot = el("div", { class: "cols-plot" });
    plot.style.height = `${height}px`;
    const grid = el("div", { class: "cols-grid", "aria-hidden": "true" });
    for (let v = 0; v <= top + 1e-9; v += step) {
      const line = el("div", { class: v === 0 ? "cols-line base" : "cols-line" }, el("span", { class: "cols-tick" }, compact(v)));
      line.style.bottom = `${v / top * 100}%`;
      grid.append(line);
    }
    const area = el("div", { class: "cols-area" });
    cols.forEach((c) => {
      const slot = el("div", { class: "col-slot", tabindex: "0" });
      const stack = el("div", { class: "col-stack" });
      const total = c.parts.reduce((n, p) => n + p.value, 0);
      stack.style.height = `${total / top * 100}%`;
      for (const p of c.parts) {
        if (p.value <= 0) continue;
        const seg = el("div", { class: "col-seg" });
        seg.style.flexGrow = String(p.value);
        seg.style.background = p.colour;
        stack.append(seg);
      }
      slot.append(stack);
      tip(slot, c.tip);
      area.append(slot);
    });
    plot.append(grid, area);
    const xs = el("div", { class: "cols-x", "aria-hidden": "true" });
    for (const x of opts.xLabels ?? []) {
      const label = el("span", {}, x.text);
      label.style.left = `${x.at / Math.max(1, cols.length) * 100}%`;
      xs.append(label);
    }
    return el("div", { class: "cols-chart" }, plot, xs, opts.legend && opts.legend.length > 1 ? legend(opts.legend) : null);
  }
  function segbar(parts, className = "") {
    const total = parts.reduce((n, p) => n + p.value, 0);
    const bar = el("div", { class: `segbar ${className}`.trim(), role: "img", "aria-label": parts.map((p) => `${p.label} ${p.value}`).join(", ") });
    if (!total) bar.classList.add("empty");
    for (const p of parts) {
      if (p.value <= 0) continue;
      const seg = el("span", { class: "segbar-part" });
      seg.style.flexGrow = String(p.value);
      seg.style.background = p.colour;
      tip(seg, [p.label, `${p.value} · ${share(p.value, total)}`]);
      bar.append(seg);
    }
    return bar;
  }
  function sparkColumns(values) {
    const max = Math.max(1, ...values.map((v) => v.normal + v.warning));
    const wrap = el("div", { class: "spark", "aria-hidden": "true" });
    for (const v of values) {
      const col = el("span", { class: "spark-col" });
      const total = v.normal + v.warning;
      col.style.height = `${Math.max(total ? 8 : 0, total / max * 100)}%`;
      if (v.warning) {
        const w = el("span", { class: "spark-warn" });
        w.style.height = `${v.warning / total * 100}%`;
        col.append(w);
      }
      wrap.append(col);
    }
    return wrap;
  }
  function gauge(value, tone, label, size = 176) {
    const thick = 14;
    const r = (size - thick) / 2;
    const c = 2 * Math.PI * r;
    const mid = size / 2;
    const ring = svgEl("svg", { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: "gauge-svg", role: "img", "aria-label": `${label}: ${Math.round(value * 100)}%` });
    ring.append(svgEl("circle", { cx: mid, cy: mid, r, class: `gauge-track gauge-track-${tone}`, "stroke-width": thick }));
    const arc = svgEl("circle", { cx: mid, cy: mid, r, class: `gauge-arc gauge-${tone}`, "stroke-width": thick, "stroke-dasharray": `${Math.max(0.01, value) * c} ${c}`, transform: `rotate(-90 ${mid} ${mid})` });
    ring.append(arc);
    const wrap = el("div", { class: "gauge" }, ring, el("div", { class: "gauge-centre" }, el("div", { class: "gauge-value" }, `${Math.round(value * 100)}%`), el("div", { class: "gauge-label" }, label)));
    wrap.style.width = wrap.style.height = `${size}px`;
    return wrap;
  }

  // src/model/apis.ts
  function scopeOf(x) {
    const s = x.spec?.scope;
    if (s === "Namespaced" || s === "Cluster" || s === "LegacyCluster") return s;
    if ((x.apiVersion ?? "").endsWith("/v1") || x.spec?.claimNames) return "LegacyCluster";
    return "Namespaced";
  }
  function inputKind(input) {
    if (!input) return "";
    const group = groupOf(input.apiVersion);
    return input.kind ? group ? `${input.kind}.${group}` : input.kind : "";
  }
  function compositionView(c, fns, revisions, api, isDefault) {
    const ref = c.spec?.compositeTypeRef ?? {};
    const legacy = (c.spec?.mode ?? "Pipeline") !== "Pipeline" || !c.spec?.pipeline?.length && !!c.spec?.resources?.length;
    const steps = (c.spec?.pipeline ?? []).map((s) => {
      const name = s.functionRef?.name ?? "";
      const fn = fns.get(name) ?? null;
      return { step: s.step, functionName: name, fn, input: inputKind(s.input), tone: fn ? fn.tone === "ok" ? "ok" : fn.tone : "error" };
    });
    return {
      name: c.metadata.name,
      ref: { kind: KIND.compositions, name: c.metadata.name },
      kind: ref.kind ?? "",
      apiVersion: ref.apiVersion ?? "",
      group: groupOf(ref.apiVersion),
      mode: c.spec?.mode ?? "Pipeline",
      legacy,
      steps,
      revisions: revisions.length,
      latestRevision: revisions.length ? Math.max(...revisions) : 0,
      api,
      isDefault,
      tone: worst([api ? "ok" : "error", legacy ? "warn" : "ok", steps.length === 0 && !legacy ? "error" : "ok", ...steps.map((s) => s.tone)]),
      labels: c.metadata.labels ?? {}
    };
  }
  function apis(snap, functions) {
    const fns = new Map(functions.map((f) => [f.name, f]));
    const revs = /* @__PURE__ */ new Map();
    for (const r of snap.compositionRevisions) {
      const owner = r.metadata.labels?.["crossplane.io/composition-name"] ?? r.metadata.ownerReferences?.[0]?.name ?? "";
      if (!owner) continue;
      const list2 = revs.get(owner) ?? [];
      list2.push(r.spec?.revision ?? 0);
      revs.set(owner, list2);
    }
    const byType = /* @__PURE__ */ new Map();
    for (const x of snap.xrds) {
      const group = x.spec?.group ?? "";
      const kind = x.spec?.names?.kind ?? "";
      byType.set(`${group}/${kind}`, x);
    }
    const compositions = snap.compositions.map((c) => {
      const ref = c.spec?.compositeTypeRef ?? {};
      const x = byType.get(`${groupOf(ref.apiVersion)}/${ref.kind ?? ""}`);
      const isDefault = !!x && x.spec?.defaultCompositionRef?.name === c.metadata.name;
      return compositionView(c, fns, revs.get(c.metadata.name) ?? [], x ? x.metadata.name : null, isDefault);
    });
    compositions.sort((a, b) => a.name.localeCompare(b.name));
    const servedCRDs = new Set(snap.crds.map((c) => c.metadata.name));
    const list = snap.xrds.map((x) => {
      const conditions = x.status?.conditions ?? [];
      const scope = scopeOf(x);
      const claimKind = x.spec?.claimNames?.kind ?? "";
      const versions = (x.spec?.versions ?? []).map((v) => ({ name: v.name, served: v.served !== false, referenceable: !!v.referenceable }));
      const mine = compositions.filter((c) => c.api === x.metadata.name);
      const established = isTrue(conditions, "Established");
      const offered = claimKind ? isTrue(conditions, "Offered") : null;
      const plural2 = x.spec?.names?.plural ?? "";
      const group = x.spec?.group ?? "";
      const crdName = `${plural2}.${group}`;
      return {
        key: x.metadata.name,
        name: x.metadata.name,
        ref: { kind: KIND.xrds, name: x.metadata.name },
        group,
        kind: x.spec?.names?.kind ?? "",
        plural: plural2,
        scope,
        claimKind,
        versions,
        referenceable: versions.find((v) => v.referenceable)?.name ?? "",
        established,
        offered,
        tone: worst([positiveTone(conditions, "Established"), claimKind ? positiveTone(conditions, "Offered") : "ok", mine.length === 0 ? "warn" : "ok", ...mine.map((c) => c.tone === "error" ? "warn" : c.tone)]),
        compositions: mine,
        defaultComposition: x.spec?.defaultCompositionRef?.name ?? "",
        xrKind: servedCRDs.has(crdName) ? `crd:${crdName}` : ""
      };
    });
    list.sort((a, b) => a.kind.localeCompare(b.kind));
    const use = /* @__PURE__ */ new Map();
    for (const f of functions) use.set(f.name, { name: f.name, fn: f, compositions: /* @__PURE__ */ new Set(), steps: 0 });
    for (const c of compositions) {
      for (const s of c.steps) {
        const u = use.get(s.functionName) ?? { name: s.functionName, fn: null, compositions: /* @__PURE__ */ new Set(), steps: 0 };
        u.compositions.add(c.name);
        u.steps++;
        use.set(s.functionName, u);
      }
    }
    const functionUse = [...use.values()].map((u) => ({ name: u.name, fn: u.fn, compositions: u.compositions.size, steps: u.steps })).sort((a, b) => b.steps - a.steps || a.name.localeCompare(b.name));
    return { apis: list, compositions, orphans: compositions.filter((c) => !c.api), functionUse };
  }
  function providerOwner(owners, revisionToPackage) {
    for (const o of owners ?? []) {
      if (o.kind === "ProviderRevision" && o.name) return revisionToPackage.get(o.name) ?? o.name.replace(/-[0-9a-f]{12}$/, "");
      if (o.kind === "Provider" && o.name) return o.name;
    }
    return "";
  }
  function revisionPackages(revisions) {
    const out = /* @__PURE__ */ new Map();
    for (const r of revisions) {
      const pkg = r.metadata.labels?.["pkg.crossplane.io/package"] ?? r.metadata.ownerReferences?.find((o) => o.kind === "Provider")?.name;
      if (pkg) out.set(r.metadata.name, pkg);
    }
    return out;
  }
  function isManaged(c) {
    return !!c.spec?.names?.categories?.includes("managed");
  }
  function managedKinds(snap) {
    const owners = revisionPackages(snap.providerRevisions);
    const crds = new Map(snap.crds.filter(isManaged).map((c) => [c.metadata.name, c]));
    const out = /* @__PURE__ */ new Map();
    const add = (key, def, state) => {
      const spec = def.spec ?? {};
      const crd = crds.get(key);
      const provider = providerOwner(def.metadata.ownerReferences, owners) || providerOwner(crd?.metadata.ownerReferences, owners);
      out.set(key, {
        key,
        kind: spec.names?.kind ?? key,
        plural: spec.names?.plural ?? key.split(".")[0] ?? key,
        group: spec.group ?? key.split(".").slice(1).join("."),
        provider,
        state,
        served: !!crd,
        scope: spec.scope ?? "",
        appKind: `crd:${key}`
      });
    };
    for (const m of snap.mrds) add(m.metadata.name, m, m.spec?.state === "Inactive" ? "Inactive" : "Active");
    for (const [key, c] of crds) if (!out.has(key)) add(key, c, "Active");
    return [...out.values()].sort((a, b) => a.provider.localeCompare(b.provider) || a.group.localeCompare(b.group) || a.kind.localeCompare(b.kind));
  }
  function compositeKinds(snap) {
    const out = /* @__PURE__ */ new Map();
    for (const c of snap.crds) {
      const cats = c.spec?.names?.categories ?? [];
      if (cats.includes("composite") || cats.includes("claim") || c.metadata.ownerReferences?.some((o) => o.kind === "CompositeResourceDefinition")) out.set(`${c.spec?.group ?? ""}/${c.spec?.names?.kind ?? ""}`, `crd:${c.metadata.name}`);
    }
    for (const x of snap.xrds) {
      const group = x.spec?.group ?? "";
      for (const kind of [x.spec?.names?.kind, x.spec?.claimNames?.kind]) if (kind && !out.has(`${group}/${kind}`)) out.set(`${group}/${kind}`, "");
    }
    return out;
  }
  function kindsPerProvider(kinds) {
    const map = /* @__PURE__ */ new Map();
    for (const k of kinds) {
      const name = k.provider || "unknown provider";
      const row = map.get(name) ?? { provider: name, active: 0, inactive: 0 };
      if (k.state === "Active") row.active++;
      else row.inactive++;
      map.set(name, row);
    }
    return [...map.values()].sort((a, b) => b.active + b.inactive - (a.active + a.inactive) || a.provider.localeCompare(b.provider));
  }

  // src/model/packages.ts
  var DEFAULT_REGISTRY = "xpkg.crossplane.io";
  function parseSource(ref) {
    const raw = (ref ?? "").trim();
    if (!raw) return { source: "", registry: "", org: "", repo: "", version: "" };
    let rest = raw;
    let version = "";
    const at = rest.indexOf("@");
    if (at >= 0) {
      version = rest.slice(at + 1);
      rest = rest.slice(0, at);
    } else {
      const colon = rest.lastIndexOf(":");
      if (colon > rest.lastIndexOf("/")) {
        version = rest.slice(colon + 1);
        rest = rest.slice(0, colon);
      }
    }
    const parts = rest.split("/");
    const first = parts[0] ?? "";
    const hasRegistry = parts.length > 1 && (first.includes(".") || first.includes(":") || first === "localhost");
    const registry = hasRegistry ? first : DEFAULT_REGISTRY;
    const path = hasRegistry ? parts.slice(1) : parts;
    const repo = path[path.length - 1] ?? "";
    const org = path.slice(0, -1).join("/");
    const source = hasRegistry ? rest : `${DEFAULT_REGISTRY}/${rest}`;
    return { source, registry, org, repo, version: version.startsWith("sha256:") ? version.slice(0, 19) : version };
  }
  var STATE_WORD = {
    healthy: "Healthy",
    unhealthy: "Unhealthy",
    installing: "Installing",
    waiting: "No status yet"
  };
  var STATE_TONE = {
    healthy: "ok",
    unhealthy: "error",
    installing: "warn",
    waiting: "warn"
  };
  function revisionsOf(pkg, all) {
    const name = pkg.metadata.name;
    return all.filter((r) => r.metadata.labels?.["pkg.crossplane.io/package"] === name || r.metadata.ownerReferences?.some((o) => o.kind === pkg.kind && o.name === name) || r.metadata.ownerReferences?.some((o) => o.name === name && o.controller));
  }
  function revisionView(r, kind) {
    const healthy = isTrue(r.status?.conditions, "Healthy");
    const runtime = isTrue(r.status?.conditions, "RuntimeHealthy");
    const active = r.spec?.desiredState === "Active";
    const bad = healthy === false || runtime === false || (r.status?.invalidDependencies ?? 0) > 0;
    return {
      name: r.metadata.name,
      revision: r.spec?.revision ?? 0,
      active,
      healthy: healthy === null ? null : healthy && runtime !== false,
      tone: !active ? "" : bad ? "error" : healthy === true ? "ok" : "warn",
      version: parseSource(r.status?.resolvedImage || r.spec?.image).version,
      created: r.metadata.creationTimestamp ?? "",
      objects: r.status?.objectRefs?.length ?? 0,
      invalidDependencies: r.status?.invalidDependencies ?? 0,
      conditions: r.status?.conditions ?? [],
      ref: { kind: kind.replace(/s\.pkg/, "revisions.pkg"), name: r.metadata.name }
    };
  }
  function runtimeOf(pkg, type, revisions, pods) {
    if (type === "Configuration") return null;
    const label = type === "Provider" ? "pkg.crossplane.io/provider" : "pkg.crossplane.io/function";
    const names = new Set(revisions.map((r) => r.name));
    const mine = pods.filter((p) => p.metadata.labels?.[label] === pkg.metadata.name || names.has(p.metadata.labels?.["pkg.crossplane.io/revision"] ?? ""));
    let ready = 0;
    let restarts = 0;
    let waiting = "";
    let pick;
    for (const p of mine) {
      const statuses = p.status?.containerStatuses ?? [];
      if (statuses.length && statuses.every((c) => c.ready)) ready++;
      else pick ??= p;
      for (const c of statuses) {
        restarts += c.restartCount ?? 0;
        const reason = c.state?.waiting?.reason;
        if (reason && reason !== "ContainerCreating") waiting = reason;
      }
    }
    pick ??= mine[0];
    return { pods: mine.length, ready, restarts, waiting, pod: pick ? { namespace: pick.metadata.namespace ?? "", name: pick.metadata.name } : null };
  }
  function stateOf(installed, healthy, conditions) {
    if (installed === false || healthy === false) {
      const installed_ = conditions.find((c) => c.type === "Installed");
      const failed = /cannot|fail|error|unauthori[sz]ed|denied|not found|invalid|refused/i.test(installed_?.message ?? "");
      if (healthy !== false && !failed && /Unpack|Inactive/.test(installed_?.reason ?? "")) return "installing";
      return "unhealthy";
    }
    if (installed === true && healthy === true) return "healthy";
    if (conditions.length === 0) return "waiting";
    return "installing";
  }
  function packageView(pkg, type, revisions, pods) {
    const kind = PACKAGE_KIND[type];
    const conditions = pkg.status?.conditions ?? [];
    const installed = isTrue(conditions, "Installed");
    const healthy = isTrue(conditions, "Healthy");
    const revs = revisionsOf(pkg, revisions).map((r) => revisionView(r, kind)).sort((a, b) => a.revision - b.revision || a.created.localeCompare(b.created));
    const active = revs.find((r) => r.active) ?? null;
    const state = stateOf(installed, healthy, conditions);
    const runtime = runtimeOf(pkg, type, revs, pods);
    const runtimeTone = runtime && runtime.pods > 0 && runtime.ready < runtime.pods ? runtime.waiting ? "error" : "warn" : "ok";
    return {
      key: `${type}/${pkg.metadata.name}`,
      type,
      name: pkg.metadata.name,
      ref: { kind, name: pkg.metadata.name },
      src: parseSource(pkg.spec?.package),
      state,
      tone: worst([STATE_TONE[state], runtimeTone, active?.tone ?? "ok"]),
      installed,
      healthy,
      conditions,
      trouble: badConditions(conditions)[0] ?? badConditions(active?.conditions)[0] ?? null,
      revisions: revs,
      active,
      activationPolicy: pkg.spec?.revisionActivationPolicy ?? "Automatic",
      runtimeConfig: pkg.spec?.runtimeConfigRef?.name ?? (type === "Configuration" ? "" : "default"),
      runtime,
      created: pkg.metadata.creationTimestamp ?? "",
      dependsOn: [],
      usedBy: []
    };
  }
  function lockType(p) {
    return p.kind || p.type || "Provider";
  }
  function sourceKey(source) {
    return parseSource(source).source.toLowerCase();
  }
  function dependencyGraph(packages2, locks) {
    const bySource = /* @__PURE__ */ new Map();
    const byRevision = /* @__PURE__ */ new Map();
    for (const p of packages2) {
      if (p.src.source) bySource.set(p.src.source.toLowerCase(), p);
      for (const r of p.revisions) byRevision.set(r.name, p);
    }
    const nodes = /* @__PURE__ */ new Map();
    const edges = [];
    const nodeFor = (pkg, source, version, type, missing) => {
      const id = pkg ? pkg.key : `missing/${sourceKey(source)}`;
      let node = nodes.get(id);
      if (!node) {
        const src = parseSource(source);
        node = { id, pkg, type: pkg?.type ?? type, label: pkg?.name ?? src.repo ?? source, source: src.source, version: pkg?.active?.version || pkg?.src.version || version, tone: pkg ? pkg.tone : "error", missing, depth: 0 };
        nodes.set(id, node);
      }
      return node;
    };
    const entries = locks.flatMap((l) => l.packages ?? []);
    for (const entry of entries) {
      const pkg = byRevision.get(entry.name) ?? bySource.get(sourceKey(entry.source)) ?? null;
      const from = nodeFor(pkg, entry.source, entry.version, lockType(entry), false);
      for (const dep of entry.dependencies ?? []) {
        const target = bySource.get(sourceKey(dep.package ?? "")) ?? null;
        const to = nodeFor(target, dep.package ?? "", "", lockType(dep), !target);
        if (!edges.some((e) => e.from === from.id && e.to === to.id)) edges.push({ from: from.id, to: to.id, constraints: dep.constraints ?? "", missing: !target });
      }
    }
    for (const p of packages2) nodeFor(p, p.src.source, p.src.version, p.type, false);
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
    for (const e of edges) {
      const a = nodes.get(e.from);
      const b = nodes.get(e.to);
      if (a?.pkg && b) a.pkg.dependsOn.push(b.label);
      if (b?.pkg && a) b.pkg.usedBy.push(a.label);
    }
    return { nodes: list, edges };
  }
  function packages(snap) {
    return [
      ...snap.configurations.map((p) => packageView(p, "Configuration", snap.configurationRevisions, snap.pods)),
      ...snap.providers.map((p) => packageView(p, "Provider", snap.providerRevisions, snap.pods)),
      ...snap.functions.map((p) => packageView(p, "Function", snap.functionRevisions, snap.pods))
    ];
  }

  // src/model/crossplane.ts
  function core(pods) {
    const out = [];
    for (const p of pods) {
      const l = p.metadata.labels ?? {};
      const app = l["app"] ?? "";
      if (app !== "crossplane" && app !== "crossplane-rbac-manager") continue;
      const statuses = p.status?.containerStatuses ?? [];
      const image = p.spec?.containers?.[0]?.image ?? statuses[0]?.image ?? "";
      out.push({
        name: p.metadata.name,
        namespace: p.metadata.namespace ?? "",
        component: app === "crossplane" ? "crossplane" : "rbac-manager",
        ready: statuses.length > 0 && statuses.every((c) => c.ready),
        restarts: statuses.reduce((n, c) => n + (c.restartCount ?? 0), 0),
        waiting: statuses.map((c) => c.state?.waiting?.reason ?? "").find((r) => r && r !== "ContainerCreating") ?? "",
        version: l["app.kubernetes.io/version"] ?? parseSource(image).version
      });
    }
    out.sort((a, b) => a.component.localeCompare(b.component) || a.name.localeCompare(b.name));
    const main = out.find((p) => p.component === "crossplane");
    return {
      pods: out,
      version: main?.version ?? "",
      tone: out.length === 0 ? "" : worst(out.map((p) => p.ready ? "ok" : p.waiting ? "error" : "warn"))
    };
  }
  function model(snap) {
    const pkgs = packages(snap);
    const providers = pkgs.filter((p) => p.type === "Provider");
    const functions = pkgs.filter((p) => p.type === "Function");
    const configurations = pkgs.filter((p) => p.type === "Configuration");
    const graph = dependencyGraph(pkgs, snap.locks);
    const kinds = managedKinds(snap);
    const perProvider2 = kindsPerProvider(kinds);
    for (const p of providers) if (!perProvider2.some((r) => r.provider === p.name)) perProvider2.push({ provider: p.name, active: 0, inactive: 0 });
    const runtimePods = snap.pods.filter((p) => p.metadata.labels?.["pkg.crossplane.io/revision"]);
    const list = events(snap.events, classifier(kinds, compositeKinds(snap), [...runtimePods, ...snap.pods.filter((p) => /^crossplane/.test(p.metadata.labels?.["app"] ?? ""))]));
    return {
      packages: pkgs,
      providers,
      functions,
      configurations,
      graph,
      apis: apis(snap, functions),
      kinds,
      perProvider: perProvider2,
      events: list,
      core: core(snap.pods),
      snap
    };
  }

  // src/ui/page.ts
  function fail(host, err) {
    const message = err instanceof Error ? err.message : String(err);
    replace(host, el("div", { class: "failure" }, el("strong", {}, "That did not work. "), el("span", {}, message)));
  }
  function start(hostId, body) {
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
  function every(ms2, body, onError) {
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
    const timer = setInterval(() => void tick(), ms2);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }
  async function maybe(query) {
    try {
      return await k8sdockside.list(query);
    } catch {
      return null;
    }
  }
  async function load() {
    const keys = Object.keys(KIND).filter((k) => k !== "pods" && k !== "clusterUsages");
    const [lists, usages, clusterUsages, runtimePods, corePods] = await Promise.all([
      Promise.all(keys.map((k) => maybe({ kind: KIND[k] }))),
      maybe({ kind: KIND.usages }),
      maybe({ kind: KIND.clusterUsages }),
      // Only the pods that are Crossplane's: a package's runtime, and its own.
      maybe({ kind: KIND.pods, selector: "pkg.crossplane.io/revision" }),
      maybe({ kind: KIND.pods, selector: "app in (crossplane,crossplane-rbac-manager)" })
    ]);
    const got = new Map(keys.map((k, i) => [k, lists[i] ?? null]));
    const served = {};
    for (const [k, v] of got) served[k] = v !== null;
    const list = (k) => got.get(k) ?? [];
    const pods = [...runtimePods ?? [], ...corePods ?? []];
    const seen = /* @__PURE__ */ new Set();
    const snap = {
      providers: list("providers"),
      functions: list("functions"),
      configurations: list("configurations"),
      providerRevisions: list("providerRevisions"),
      functionRevisions: list("functionRevisions"),
      configurationRevisions: list("configurationRevisions"),
      locks: list("locks"),
      runtimeConfigs: list("runtimeConfigs"),
      imageConfigs: list("imageConfigs"),
      xrds: list("xrds"),
      compositions: list("compositions"),
      compositionRevisions: list("compositionRevisions"),
      environmentConfigs: list("environmentConfigs"),
      mrds: list("mrds"),
      mraps: list("mraps"),
      operations: list("operations"),
      cronOperations: list("cronOperations"),
      watchOperations: list("watchOperations"),
      usages: [...usages ?? [], ...clusterUsages ?? []],
      crds: list("crds"),
      events: list("events"),
      pods: pods.filter((p) => {
        const key = `${p.metadata.namespace}/${p.metadata.name}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
      served
    };
    return { snap, installed: served["providers"] === true && served["xrds"] === true };
  }
  async function read() {
    const { snap, installed } = await load();
    return { installed, m: model(snap) };
  }
  function fingerprint(value) {
    return JSON.stringify(value, (key, v) => key === "resourceVersion" || key === "managedFields" ? void 0 : v);
  }
  function notInstalled(ctx) {
    const go = (label, url, primary = false) => {
      const b = el("button", { type: "button", class: primary ? "primary" : void 0 }, label);
      b.addEventListener("click", () => void k8sdockside.openUrl(url));
      return b;
    };
    return el(
      "section",
      { class: "block hero-empty" },
      el("img", { src: "logo.svg", alt: "", width: 64, height: 64 }),
      el("h2", {}, "Crossplane is not installed here"),
      el("p", { class: "note" }, `${ctx.contextName} does not serve pkg.crossplane.io and apiextensions.crossplane.io, so there are no providers, APIs or compositions to draw. Crossplane installs with one Helm chart.`),
      el("pre", { class: "mono snippet" }, "helm repo add crossplane-stable https://charts.crossplane.io/stable\nhelm install crossplane --namespace crossplane-system --create-namespace crossplane-stable/crossplane"),
      el("div", { class: "links" }, go("Get started with Crossplane", "https://docs.crossplane.io/latest/get-started/", true), go("Install guide", "https://docs.crossplane.io/latest/get-started/install/"), go("crossplane.io", "https://www.crossplane.io/"))
    );
  }

  // src/ui/timeline.ts
  var NORMAL = "var(--chart-1)";
  var EVENT_LEGEND = [
    { label: "Normal", colour: NORMAL },
    { label: "Warning", colour: STATUS.warn }
  ];
  function xLabels(start2, size, n) {
    const every2 = Math.max(1, Math.round(n / 6));
    const out = [];
    for (let i = 0; i < n; i += every2) out.push({ at: i, text: clock(start2 + i * size) });
    return out;
  }
  function eventColumns(list, now, minutes, n, filter, height = 150) {
    const window = minutes * 6e4;
    const b = bins(list, now, window, n, filter);
    return columns(
      b.map((x) => ({
        parts: [
          { label: "Normal", value: x.normal, colour: NORMAL },
          { label: "Warning", value: x.warning, colour: STATUS.warn }
        ],
        tip: [`${clock(x.start)} – ${clock(x.end)}`, `${compact(x.warning)} warning${x.warning === 1 ? "" : "s"}`, `${compact(x.normal)} normal`]
      })),
      { height, xLabels: xLabels(now - window, window / n, n), legend: EVENT_LEGEND }
    );
  }

  // src/ui/widgets.ts
  var STATE_COLOUR = {
    healthy: STATUS.ok,
    installing: STATUS.warn,
    unhealthy: STATUS.error,
    waiting: STATUS.none
  };
  var STATES = ["healthy", "installing", "unhealthy", "waiting"];
  function stateParts(list, onPick) {
    return STATES.map((s) => ({ label: STATE_WORD[s], value: list.filter((p) => p.state === s).length, colour: STATE_COLOUR[s], onPick: onPick ? () => onPick(s) : void 0 }));
  }
  function tile(opts) {
    const parts = (opts.parts ?? []).filter((p) => p.value > 0);
    const node = el(
      "div",
      { class: `tile tone-edge-${opts.tone || "none"}` },
      el("div", { class: "tile-label" }, opts.label),
      el("div", { class: "tile-value" }, typeof opts.value === "number" ? compact(opts.value) : opts.value),
      opts.extra ?? null,
      opts.parts ? segbar(opts.parts) : null,
      parts.length ? el(
        "div",
        { class: "tile-parts" },
        ...parts.map((p) => {
          const sw = el("span", { class: "swatch small", "aria-hidden": "true" });
          sw.style.background = p.colour;
          return el("span", { class: "tile-part" }, sw, el("strong", {}, compact(p.value)), ` ${p.label.toLowerCase()}`);
        })
      ) : null,
      opts.note ? el("div", { class: "tile-note" }, opts.note) : null
    );
    if (opts.onPick) clickable(node, opts.onPick);
    return node;
  }
  function chartCard(title, note, chart, foot = null, className = "") {
    return el("article", { class: `chart-card ${className}`.trim() }, el("h3", {}, title), note ? el("p", { class: "note small" }, note) : null, chart, foot ? el("div", { class: "card-foot" }, foot) : null);
  }

  // src/pages/overview.ts
  var REFRESH = 2e4;
  var HOUR = 60 * 6e4;
  start("page", async (ctx) => {
    const head = byId("head");
    const body = byId("body");
    const failure = el("p", { class: "refresh-failure" });
    let last = "";
    const note = `Packages, APIs, compositions and managed resources in ${ctx.contextName}.`;
    replace(head, heading("overview", "Crossplane", note));
    const stop = every(
      REFRESH,
      async () => {
        const { installed, m } = await read();
        failure.textContent = "";
        document.getElementById("first")?.remove();
        const now = Date.now();
        const print = fingerprint([installed, m.snap, Math.floor(now / 6e4)]);
        if (print === last) return;
        last = print;
        const list = problems(m);
        replace(head, heading("overview", "Crossplane", note, list.filter((p) => p.tone !== "info").length));
        if (!installed) {
          replace(body, failure, notInstalled(ctx));
          return;
        }
        replace(body, failure, verdict(m, list), tiles(m, now), rings(m), lastHour(m, now), el("div", { class: "columns" }, perProvider(m), reasons(m)), el("div", { class: "columns" }, attention(list), crossplane(m)));
      },
      (err) => {
        failure.textContent = err instanceof Error ? err.message : String(err);
      }
    );
    addEventListener("pagehide", stop);
  });
  function health(m) {
    const items = [...m.packages.map((p) => p.tone), ...m.apis.apis.map((a) => a.tone), ...m.apis.compositions.map((c) => c.tone), ...m.core.pods.map((p) => p.ready ? "ok" : "error")];
    const good = items.filter((t) => t === "ok" || t === "info" || t === "").length;
    return { score: items.length ? good / items.length : 1, good, total: items.length };
  }
  function verdict(m, list) {
    const t = tally(list);
    const h = health(m);
    const tone = t.error ? "error" : t.warn ? "warn" : "ok";
    const empty = m.packages.length === 0 && m.apis.apis.length === 0;
    const headline = empty ? "Crossplane is running, with nothing installed yet" : t.error ? `${plural(t.error, "error")} to fix${t.warn ? `, and ${plural(t.warn, "warning")}` : ""}` : t.warn ? `Healthy, with ${plural(t.warn, "thing")} to look at` : "Every package is healthy and every API is served";
    const line = empty ? "Install a Provider to manage cloud resources, or a Configuration that brings a whole platform." : `${plural(m.providers.length, "provider")}, ${plural(m.functions.length, "function")} and ${plural(m.configurations.length, "configuration")}; ${plural(m.apis.apis.length, "API")} served by ${plural(m.apis.compositions.length, "composition")}; ${compact(m.kinds.filter((k) => k.state === "Active").length)} managed resource kinds active.`;
    const g = gauge(h.score, h.score >= 0.9 && !t.error ? "ok" : h.score >= 0.7 ? "warn" : "error", "healthy");
    tip(g, ["Control plane health", `${h.good} of ${h.total} packages, APIs, compositions and Crossplane pods are as they should be`]);
    return el(
      "div",
      { class: `verdict tone-edge-${tone}` },
      g,
      el(
        "div",
        { class: "verdict-text" },
        el("div", { class: `verdict-head tone-${tone}` }, headline),
        el("div", { class: "verdict-line" }, line),
        el("div", { class: "verdict-tags" }, m.core.version ? pill(`Crossplane ${m.core.version}`, "info") : null, pill(`${m.core.pods.filter((p) => p.ready).length}/${m.core.pods.length} core pods ready`, m.core.tone || "warn"), t.error ? pill(plural(t.error, "error"), "error") : null, t.warn ? pill(plural(t.warn, "warning"), "warn") : null),
        el("div", { class: "verdict-actions" }, action("Packages", () => void k8sdockside.openView("packages"), true), action("Compositions", () => void k8sdockside.openView("compositions")), action("Problems", () => void k8sdockside.openView("problems")))
      )
    );
  }
  function tiles(m, now) {
    const occ = occurrences(m.events, now, HOUR);
    const spark = bins(m.events, now, HOUR, 20);
    const apiReady = m.apis.apis.filter((a) => a.tone === "ok").length;
    const compOk = m.apis.compositions.filter((c) => c.tone === "ok").length;
    const active = m.kinds.filter((k) => k.state === "Active").length;
    const pkgTone = (list) => list.length ? worst(list.map((p) => p.tone === "info" ? "ok" : p.tone)) : "";
    return el(
      "div",
      { class: "tiles" },
      tile({ label: "Providers", value: m.providers.length, tone: pkgTone(m.providers), parts: stateParts(m.providers), onPick: () => void k8sdockside.openView("packages") }),
      tile({ label: "Functions", value: m.functions.length, tone: pkgTone(m.functions), parts: stateParts(m.functions), onPick: () => void k8sdockside.openView("packages") }),
      tile({ label: "Configurations", value: m.configurations.length, tone: pkgTone(m.configurations), parts: stateParts(m.configurations), onPick: () => void k8sdockside.openView("packages") }),
      tile({
        label: "APIs (XRDs)",
        value: m.apis.apis.length,
        tone: m.apis.apis.length ? worst(m.apis.apis.map((a) => a.tone)) : "",
        parts: [
          { label: "Served", value: apiReady, colour: STATUS.ok },
          { label: "Need attention", value: m.apis.apis.length - apiReady, colour: STATUS.warn }
        ],
        onPick: () => void k8sdockside.openView("compositions")
      }),
      tile({
        label: "Compositions",
        value: m.apis.compositions.length,
        tone: m.apis.compositions.length ? worst(m.apis.compositions.map((c) => c.tone)) : "",
        parts: [
          { label: "Ready", value: compOk, colour: STATUS.ok },
          { label: "Degraded", value: m.apis.compositions.filter((c) => c.tone === "warn").length, colour: STATUS.warn },
          { label: "Broken", value: m.apis.compositions.filter((c) => c.tone === "error").length, colour: STATUS.error }
        ],
        onPick: () => void k8sdockside.openView("compositions")
      }),
      tile({
        label: "Managed kinds",
        value: m.kinds.length,
        parts: [
          { label: "Active", value: active, colour: "var(--chart-1)" },
          { label: "Inactive", value: m.kinds.length - active, colour: STATUS.idle }
        ],
        onPick: () => void k8sdockside.openView("managed")
      }),
      tile({
        label: "Warnings, last hour",
        value: occ.warning,
        tone: occ.warning ? "warn" : "ok",
        extra: sparkColumns(spark),
        note: `${compact(occ.normal)} normal events`,
        onPick: () => void k8sdockside.openView("activity")
      })
    );
  }
  function rings(m) {
    const colourOf = palette(m.perProvider.map((r) => r.provider));
    const providerParts = m.perProvider.filter((r) => r.active > 0);
    const top = providerParts.slice(0, 7);
    const rest = providerParts.slice(7).reduce((n, r) => n + r.active, 0);
    const kindParts = top.map((r) => ({ label: r.provider, value: r.active, colour: colourOf(r.provider), note: [`${r.inactive} inactive`] }));
    if (rest) kindParts.push({ label: "Other providers", value: rest, colour: "var(--chart-8)", note: [] });
    const activeKinds = m.kinds.filter((k) => k.state === "Active").length;
    const apiOk = m.apis.apis.filter((a) => a.established === true && a.compositions.length > 0).length;
    const noComp = m.apis.apis.filter((a) => a.established !== false && a.compositions.length === 0).length;
    const notEst = m.apis.apis.filter((a) => a.established === false).length;
    return el(
      "div",
      { class: "cards-3" },
      chartCard("Package health", "Every Provider, Function and Configuration, by what the package manager says.", donut(stateParts(m.packages), { value: String(m.packages.length), label: "packages" }, { title: "Package health" }), linkButton("Packages and dependencies →", () => void k8sdockside.openView("packages"))),
      chartCard(
        "Managed kinds by provider",
        "Active managed resource kinds -- what each provider lets you create.",
        providerParts.length ? donut(kindParts, { value: compact(activeKinds), label: "active kinds" }, { title: "Managed kinds by provider" }) : nothing("No managed resource kinds yet. They arrive with a Provider."),
        linkButton("The managed resource map →", () => void k8sdockside.openView("managed"))
      ),
      chartCard(
        "API readiness",
        "Each API (XRD): established, and served by at least one Composition.",
        m.apis.apis.length ? donut(
          [
            { label: "Ready", value: apiOk, colour: STATUS.ok },
            { label: "No Composition", value: noComp, colour: STATUS.warn },
            { label: "Not established", value: notEst, colour: STATUS.error }
          ],
          { value: String(m.apis.apis.length), label: "APIs" },
          { title: "API readiness" }
        ) : nothing("No CompositeResourceDefinition yet. An XRD is how a platform team defines its own API."),
        linkButton("APIs and their pipelines →", () => void k8sdockside.openView("compositions"))
      )
    );
  }
  function lastHour(m, now) {
    return block(
      "The last hour",
      "Every event Crossplane, its providers and functions recorded, in two-minute columns. Hover a column for its numbers.",
      m.events.length ? eventColumns(m.events, now, 60, 30) : nothing("No Crossplane events in the last hour. The API server keeps events for about an hour."),
      linkButton("All activity, by area and over time →", () => void k8sdockside.openView("activity"))
    );
  }
  function perProvider(m) {
    const rows = m.perProvider.slice(0, 10);
    const pkgs = new Map(m.providers.map((p) => [p.name, p]));
    return block(
      "Managed APIs per provider",
      "Kinds each provider defines; the faint part is inactive (MRDs not activated).",
      rows.length ? bars(
        rows.map((r) => ({
          label: r.provider,
          sub: pkgs.get(r.provider)?.active?.version ?? "",
          parts: [
            { label: "Active", value: r.active, colour: "var(--chart-1)" },
            { label: "Inactive", value: r.inactive, colour: STATUS.idle }
          ],
          onPick: pkgs.get(r.provider) ? () => open(pkgs.get(r.provider)?.ref ?? null) : void 0
        })),
        { legend: [{ label: "Active", colour: "var(--chart-1)" }, { label: "Inactive", colour: STATUS.idle }] }
      ) : nothing("No providers installed.")
    );
  }
  function reasons(m) {
    const list = byReason(m.events).slice(0, 8);
    return block(
      "Warnings by reason",
      "What went wrong in the last hour, counted by occurrence, with how many objects it hit.",
      list.length ? bars(list.map((r) => ({ label: r.reason, sub: plural(r.objects, "object"), parts: [{ label: "Occurrences", value: r.count, colour: STATUS.warn }], onPick: () => void k8sdockside.openView("activity") }))) : nothing("No warnings in the last hour.")
    );
  }
  function attention(list) {
    const shown = list.filter((p) => p.tone !== "info");
    if (shown.length === 0) return block("Needs attention", "", nothing("Nothing. Every package is healthy, every API served, and no managed resource reported a warning this hour."));
    const rows = el("ul", { class: "issues" });
    for (const p of shown.slice(0, 8)) {
      rows.append(clickable(el("li", { class: "issue", title: `${p.explain}

Fix: ${p.fix}` }, dot(p.tone), el("span", { class: "issue-title" }, p.title), el("span", { class: "issue-detail" }, p.subject)), () => open(p.ref)));
    }
    return block("Needs attention", "Worst first. Each row opens the object it is about.", rows, linkButton(shown.length > 8 ? `All ${shown.length} problems, with how to fix each →` : "How to fix each of them →", () => void k8sdockside.openView("problems")));
  }
  function crossplane(m) {
    const pods = el("ul", { class: "pod-list" });
    for (const p of m.core.pods) {
      pods.append(clickable(el("li", { class: "pod-row" }, dot(p.ready ? "ok" : p.waiting ? "error" : "warn"), el("span", { class: "pod-name" }, p.component === "crossplane" ? "crossplane" : "rbac-manager"), el("span", { class: "faint mono" }, p.name), el("span", { class: "spacer" }), p.restarts ? pill(plural(p.restarts, "restart"), "warn") : null, pill(p.ready ? "ready" : p.waiting || "not ready", p.ready ? "ok" : "error")), () => open({ kind: "pods", namespace: p.namespace, name: p.name })));
    }
    const s = m.snap;
    const count = (label, n, kind, served = true) => {
      const row = el("li", { class: served ? "count-row" : "count-row faint" }, el("span", {}, label), el("span", { class: "spacer" }), el("strong", {}, served ? compact(n) : "—"));
      if (served) clickable(row, () => open({ kind, name: "" }));
      return row;
    };
    const runningOps = s.operations.filter((o) => !o.status?.conditions?.some((c) => c.type === "Succeeded")).length;
    return block(
      "Crossplane",
      m.core.version ? `Version ${m.core.version}, running in ${m.core.pods[0]?.namespace ?? "the cluster"}.` : "The core pods were not found by their Helm labels (app=crossplane).",
      m.core.pods.length ? pods : null,
      el(
        "ul",
        { class: "counts" },
        count("Runtime configs", s.runtimeConfigs.length, KIND.runtimeConfigs, s.served["runtimeConfigs"]),
        count("Image configs", s.imageConfigs.length, KIND.imageConfigs, s.served["imageConfigs"]),
        count("Environment configs", s.environmentConfigs.length, KIND.environmentConfigs, s.served["environmentConfigs"]),
        count("Activation policies", s.mraps.length, KIND.mraps, s.served["mraps"]),
        count("Usages", s.usages.length, KIND.usages, s.served["usages"]),
        count(`Operations${runningOps ? ` (${runningOps} running)` : ""}`, s.operations.length, KIND.operations, s.served["operations"]),
        count("Cron operations", s.cronOperations.length, KIND.cronOperations, s.served["cronOperations"]),
        count("Watch operations", s.watchOperations.length, KIND.watchOperations, s.served["watchOperations"])
      )
    );
  }
})();
