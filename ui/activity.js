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
  var AREAS = ["managed", "composite", "api", "package", "runtime", "operation"];
  var AREA_WORD = {
    managed: "Managed resources",
    composite: "Composite resources",
    api: "APIs & compositions",
    package: "Packages",
    runtime: "Provider & function pods",
    operation: "Operations"
  };
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
  function events(list2, c) {
    return list2.map((e) => eventView(e, c)).filter((e) => !!e && Number.isFinite(e.last)).sort((a, b) => b.last - a.last);
  }
  function bins(list2, now, window, n, filter = () => true) {
    const size = window / n;
    const start2 = now - window;
    const out = Array.from({ length: n }, (_, i) => ({ start: start2 + i * size, end: start2 + (i + 1) * size, normal: 0, warning: 0 }));
    for (const e of list2) {
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
  function occurrences(list2, now, window, filter = () => true) {
    const b = bins(list2, now, window, 1, filter)[0];
    return { normal: b?.normal ?? 0, warning: b?.warning ?? 0 };
  }
  function heatmap(list2, now, window, n) {
    return AREAS.map((area) => ({ area, cells: bins(list2, now, window, n, (e) => e.area === area) })).filter((r) => r.cells.some((c) => c.normal + c.warning > 0));
  }
  function byReason(list2, filter = (e) => e.warning) {
    const map = /* @__PURE__ */ new Map();
    for (const e of list2) {
      if (!filter(e)) continue;
      const row = map.get(e.reason) ?? { reason: e.reason || "no reason", count: 0, objects: /* @__PURE__ */ new Set() };
      row.count += e.count;
      row.objects.add(`${e.object.kind}/${e.object.namespace}/${e.object.name}`);
      map.set(e.reason, row);
    }
    return [...map.values()].map((r) => ({ reason: r.reason, count: r.count, objects: r.objects.size })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
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
  function heading(current, title, note, problems = null) {
    const nav = el("nav", { class: "tabs", "aria-label": "Crossplane views" });
    for (const [id, label] of VIEWS) {
      const here = id === current;
      const tab = el(
        "button",
        { type: "button", class: here ? "tab here" : "tab", "aria-current": here ? "page" : void 0 },
        label,
        id === "problems" && problems ? el("span", { class: "tab-count" }, String(problems)) : null
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
  function code(text, className = "") {
    return el("code", { class: className ? `mono ${className}` : "mono" }, text);
  }
  function age(when) {
    if (!when) return "";
    try {
      if (k8sdockside.format) return k8sdockside.format.age(typeof when === "number" ? new Date(when) : when);
    } catch {
    }
    const t = typeof when === "number" ? when : Date.parse(when);
    if (!Number.isFinite(t)) return "";
    const s = Math.max(0, (Date.now() - t) / 1e3);
    if (s < 90) return `${Math.round(s)}s`;
    if (s < 5400) return `${Math.round(s / 60)}m`;
    if (s < 172800) return `${Math.round(s / 3600)}h`;
    return `${Math.round(s / 86400)}d`;
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
    const list2 = el("ul", { class: "legend legend-table" });
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
      list2.append(row);
    }
    return el("div", { class: "donut" }, wrap, list2);
  }
  function bars(rows, opts = {}) {
    const fmt = opts.unit ?? compact;
    const max = opts.max ?? Math.max(1, ...rows.map((r) => r.parts.reduce((n, p) => n + p.value, 0)));
    const list2 = el("div", { class: "bars" });
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
      list2.append(row);
    }
    return el("div", { class: "bars-chart" }, list2, opts.legend && opts.legend.length > 1 ? legend(opts.legend) : null);
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
  function heatmap2(rows, opts = {}) {
    const max = Math.max(1, ...rows.flatMap((r) => r.cells.map((c) => c.value)));
    const n = Math.max(1, ...rows.map((r) => r.cells.length));
    const grid = el("div", { class: "heat" });
    grid.style.gridTemplateColumns = `minmax(110px, max-content) repeat(${n}, minmax(6px, 1fr))`;
    for (const r of rows) {
      grid.append(el("div", { class: "heat-label" }, r.label));
      for (const c of r.cells) {
        const cell = el("div", { class: c.value ? "heat-cell" : "heat-cell empty", tabindex: "0" });
        if (c.value) {
          const pct = Math.round(18 + 82 * Math.sqrt(c.value / max));
          cell.style.setProperty("--heat", `${pct}%`);
        }
        if (c.flag) cell.append(el("span", { class: "heat-flag", "aria-hidden": "true" }));
        tip(cell, c.tip);
        grid.append(cell);
      }
    }
    const xs = el("div", { class: "heat-x", "aria-hidden": "true" });
    for (const x of opts.xLabels ?? []) {
      const label = el("span", {}, x.text);
      label.style.left = `${x.at / n * 100}%`;
      xs.append(label);
    }
    const scale = el("div", { class: "heat-scale" }, el("span", {}, "fewer"), el("span", { class: "heat-ramp", "aria-hidden": "true" }), el("span", {}, "more"), el("span", { class: "heat-flag inline", "aria-hidden": "true" }), el("span", {}, "has warnings"));
    return el("div", { class: "heat-chart" }, grid, el("div", { class: "heat-x-row" }, el("div", {}), xs), scale);
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
      const list3 = revs.get(owner) ?? [];
      list3.push(r.spec?.revision ?? 0);
      revs.set(owner, list3);
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
    const list2 = snap.xrds.map((x) => {
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
    list2.sort((a, b) => a.kind.localeCompare(b.kind));
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
    return { apis: list2, compositions, orphans: compositions.filter((c) => !c.api), functionUse };
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
    const list2 = [...nodes.values()];
    for (let pass = 0; pass < list2.length; pass++) {
      let moved = false;
      for (const e of edges) {
        const a = nodes.get(e.from);
        const b = nodes.get(e.to);
        if (a && b && b.depth < a.depth + 1 && a.depth + 1 < list2.length) {
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
    return { nodes: list2, edges };
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
    const perProvider = kindsPerProvider(kinds);
    for (const p of providers) if (!perProvider.some((r) => r.provider === p.name)) perProvider.push({ provider: p.name, active: 0, inactive: 0 });
    const runtimePods = snap.pods.filter((p) => p.metadata.labels?.["pkg.crossplane.io/revision"]);
    const list2 = events(snap.events, classifier(kinds, compositeKinds(snap), [...runtimePods, ...snap.pods.filter((p) => /^crossplane/.test(p.metadata.labels?.["app"] ?? ""))]));
    return {
      packages: pkgs,
      providers,
      functions,
      configurations,
      graph,
      apis: apis(snap, functions),
      kinds,
      perProvider,
      events: list2,
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
    const list2 = (k) => got.get(k) ?? [];
    const pods = [...runtimePods ?? [], ...corePods ?? []];
    const seen = /* @__PURE__ */ new Set();
    const snap = {
      providers: list2("providers"),
      functions: list2("functions"),
      configurations: list2("configurations"),
      providerRevisions: list2("providerRevisions"),
      functionRevisions: list2("functionRevisions"),
      configurationRevisions: list2("configurationRevisions"),
      locks: list2("locks"),
      runtimeConfigs: list2("runtimeConfigs"),
      imageConfigs: list2("imageConfigs"),
      xrds: list2("xrds"),
      compositions: list2("compositions"),
      compositionRevisions: list2("compositionRevisions"),
      environmentConfigs: list2("environmentConfigs"),
      mrds: list2("mrds"),
      mraps: list2("mraps"),
      operations: list2("operations"),
      cronOperations: list2("cronOperations"),
      watchOperations: list2("watchOperations"),
      usages: [...usages ?? [], ...clusterUsages ?? []],
      crds: list2("crds"),
      events: list2("events"),
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
  var remember = {
    async get(key) {
      try {
        return await k8sdockside.storage?.get(key) ?? null;
      } catch {
        return null;
      }
    },
    async set(key, value) {
      try {
        await k8sdockside.storage?.set(key, value);
      } catch {
      }
    }
  };
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
  function eventColumns(list2, now, minutes, n, filter, height = 150) {
    const window = minutes * 6e4;
    const b = bins(list2, now, window, n, filter);
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
  function eventHeatmap(list2, now, minutes, n) {
    const window = minutes * 6e4;
    const rows = heatmap(list2, now, window, n);
    return heatmap2(
      rows.map((r) => ({
        label: AREA_WORD[r.area],
        cells: r.cells.map((c) => ({ value: c.normal + c.warning, flag: c.warning, tip: [AREA_WORD[r.area], `${clock(c.start)} – ${clock(c.end)}`, `${compact(c.normal + c.warning)} events, ${compact(c.warning)} warnings`] }))
      })),
      { xLabels: xLabels(now - window, window / n, n) }
    );
  }

  // src/ui/widgets.ts
  var STATE_COLOUR = {
    healthy: STATUS.ok,
    installing: STATUS.warn,
    unhealthy: STATUS.error,
    waiting: STATUS.none
  };
  function chartCard(title, note, chart, foot = null, className = "") {
    return el("article", { class: `chart-card ${className}`.trim() }, el("h3", {}, title), note ? el("p", { class: "note small" }, note) : null, chart, foot ? el("div", { class: "card-foot" }, foot) : null);
  }
  var RANGES = [
    { label: "15 min", minutes: 15, bins: 30 },
    { label: "1 hour", minutes: 60, bins: 30 },
    { label: "6 hours", minutes: 360, bins: 36 },
    { label: "24 hours", minutes: 1440, bins: 48 }
  ];
  function segmented(options, current, onPick, label) {
    const group = el("div", { class: "segmented", role: "group", "aria-label": label });
    for (const o of options) {
      const b = el("button", { type: "button", class: o.id === current ? "seg here" : "seg", "aria-pressed": o.id === current ? "true" : "false" }, o.label);
      b.addEventListener("click", () => onPick(o.id));
      group.append(b);
    }
    return group;
  }

  // src/pages/activity.ts
  var REFRESH = 15e3;
  var AREA_COLOUR = Object.fromEntries(AREAS.map((a, i) => [a, series(i)]));
  start("page", async (ctx) => {
    const head = byId("head");
    const body = byId("body");
    const failure = el("p", { class: "refresh-failure" });
    replace(head, heading("activity", "Activity", `Every event Crossplane, its providers and functions recorded in ${ctx.contextName}.`));
    const f = { range: "1 hour", area: "all", warnings: false, search: "", ...await remember.get("activity.filters") ?? {} };
    let current = null;
    let last = "";
    const draw = () => {
      if (!current) return;
      replace(body, failure, ...page(current, f, () => {
        void remember.set("activity.filters", f);
        draw();
      }));
    };
    const stop = every(
      REFRESH,
      async () => {
        const { installed, m } = await read();
        failure.textContent = "";
        document.getElementById("first")?.remove();
        const print = fingerprint([installed, m.events, Math.floor(Date.now() / 3e4)]);
        if (print === last) return;
        last = print;
        current = m;
        if (!installed) {
          replace(body, failure, notInstalled(ctx));
          return;
        }
        if (document.activeElement?.classList.contains("search")) return;
        draw();
      },
      (err) => {
        failure.textContent = err instanceof Error ? err.message : String(err);
      }
    );
    addEventListener("pagehide", stop);
  });
  function page(m, f, changed) {
    const now = Date.now();
    const range = RANGES.find((r) => r.label === f.range) ?? RANGES[1] ?? { label: "1 hour", minutes: 60, bins: 30 };
    const window = range.minutes * 6e4;
    const q = f.search.trim().toLowerCase();
    const inArea = (e) => f.area === "all" || e.area === f.area;
    const matches = (e) => inArea(e) && (!f.warnings || e.warning) && (!q || `${e.reason} ${e.message} ${e.object.kind} ${e.object.name} ${e.object.namespace} ${e.provider}`.toLowerCase().includes(q));
    const inWindow = (e) => e.last >= now - window;
    const shown = m.events.filter((e) => matches(e) && inWindow(e));
    const search = el("input", { type: "search", class: "search", placeholder: "Search reason, message, object", value: f.search, "aria-label": "Search events", spellcheck: "false" });
    search.addEventListener("input", () => {
      f.search = search.value;
      changed();
      requestAnimationFrame(() => {
        const again = document.querySelector("input.search");
        again?.focus();
        again?.setSelectionRange(again.value.length, again.value.length);
      });
    });
    const warnOnly = el("label", { class: "check" }, el("input", { type: "checkbox", checked: f.warnings }), " warnings only");
    warnOnly.querySelector("input")?.addEventListener("change", (e) => {
      f.warnings = e.target.checked;
      changed();
    });
    const present = AREAS.filter((a) => m.events.some((e) => e.area === a));
    const filters = el(
      "div",
      { class: "filters sticky" },
      segmented(RANGES.map((r) => ({ id: r.label, label: r.label })), range.label, (id) => {
        f.range = id;
        changed();
      }, "Time range"),
      segmented([{ id: "all", label: "Everything" }, ...present.map((a) => ({ id: a, label: AREA_WORD[a] }))], f.area, (id) => {
        f.area = id;
        changed();
      }, "Area"),
      warnOnly,
      search
    );
    const occ = occurrences(m.events, now, window, matches);
    const note = el("p", { class: "note" }, `${compact(occ.normal + occ.warning)} occurrences in the last ${range.label} — ${compact(occ.warning)} warnings — over ${plural(shown.length, "event")}. A repeating event is spread over the time between its first and last occurrence. The API server keeps events for about an hour unless it was told otherwise.`);
    if (m.events.length === 0) return [filters, block("Nothing recorded", "", nothing("No Crossplane events in the cluster right now. The API server keeps events for about an hour, so a quiet control plane has none."))];
    const areaParts = present.map((a) => ({ label: AREA_WORD[a], value: m.events.filter((e) => e.area === a && matches(e) && inWindow(e)).reduce((n, e) => n + e.count, 0), colour: AREA_COLOUR[a] }));
    const reasons = byReason(shown, () => true).slice(0, 8);
    const objects = /* @__PURE__ */ new Map();
    for (const e of shown) {
      const key = `${e.object.kind}/${e.object.namespace}/${e.object.name}`;
      const row = objects.get(key) ?? { label: e.object.name, sub: e.object.kind, warn: 0, normal: 0, e };
      if (e.warning) row.warn += e.count;
      else row.normal += e.count;
      objects.set(key, row);
    }
    const busiest = [...objects.values()].sort((a, b) => b.warn + b.normal - (a.warn + a.normal)).slice(0, 8);
    return [
      filters,
      block("Over time", "", note, eventColumns(m.events, now, range.minutes, range.bins, matches, 210)),
      f.area === "all" ? block("By area, over time", "Each row an area of Crossplane, each column a slice of the range, darker where it was busier. A red mark is a slice with warnings.", eventHeatmap(m.events.filter(matches), now, range.minutes, range.bins)) : null,
      el(
        "div",
        { class: "cards-3" },
        chartCard("By area", "Occurrences in the range, by what they are about.", areaParts.some((p) => p.value) ? donut(areaParts, { value: compact(areaParts.reduce((n, p) => n + p.value, 0)), label: "occurrences" }, { title: "Events by area" }) : nothing("Nothing in this range.")),
        chartCard("Reasons", "The reason each event gives, most first.", reasons.length ? bars(reasons.map((r) => ({ label: r.reason, sub: plural(r.objects, "object"), parts: [{ label: "Occurrences", value: r.count, colour: "var(--chart-1)" }] }))) : nothing("Nothing in this range.")),
        chartCard(
          "Busiest objects",
          "The objects with the most events in the range.",
          busiest.length ? bars(
            busiest.map((o) => ({
              label: o.label,
              sub: o.sub,
              parts: [
                { label: "Normal", value: o.normal, colour: "var(--chart-1)" },
                { label: "Warning", value: o.warn, colour: STATUS.warn }
              ],
              onPick: o.e.appKind ? () => open({ kind: o.e.appKind, namespace: o.e.object.namespace || void 0, name: o.e.object.name }) : void 0
            })),
            { legend: [{ label: "Normal", colour: "var(--chart-1)" }, { label: "Warning", colour: STATUS.warn }] }
          ) : nothing("Nothing in this range.")
        )
      ),
      list(shown)
    ];
  }
  function list(shown) {
    if (shown.length === 0) return block("Events", "", nothing("No event matches these filters."));
    const rows = el("ul", { class: "events" });
    for (const e of shown.slice(0, 200)) {
      const swatch = el("span", { class: "swatch", "aria-hidden": "true" });
      swatch.style.background = AREA_COLOUR[e.area];
      const row = el(
        "li",
        { class: e.warning ? "event warning" : "event" },
        dot(e.warning ? "warn" : "ok"),
        el("div", { class: "event-main" }, el("div", { class: "event-head" }, code(e.reason || "no reason"), el("span", { class: "event-object" }, `${e.object.kind} ${e.object.namespace ? `${e.object.namespace}/` : ""}${e.object.name}`), e.count > 1 ? el("span", { class: "pill pill-none" }, `×${compact(e.count)}`) : null), el("div", { class: "event-msg" }, e.message)),
        el("div", { class: "event-side" }, el("span", { class: "event-area" }, swatch, AREA_WORD[e.area]), el("span", { class: "faint" }, `${age(e.last)} ago`))
      );
      tip(row, [`${e.warning ? "Warning" : "Normal"}: ${e.reason}`, `${e.object.apiVersion} ${e.object.kind}`, e.count > 1 ? `${e.count} times, first ${age(e.first)} ago` : `${age(e.last)} ago`]);
      if (e.appKind) clickable(row, () => open({ kind: e.appKind, namespace: e.object.namespace || void 0, name: e.object.name }));
      rows.append(row);
    }
    return block("Events", shown.length > 200 ? `The newest 200 of ${shown.length}.` : `${plural(shown.length, "event")}, newest first.`, rows);
  }
})();
