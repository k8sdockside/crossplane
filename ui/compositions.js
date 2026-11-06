// Built by k8sdockside-plugin from src/ -- edit the TypeScript there, not this file.
"use strict";
(() => {
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
  function pill(text, tone = "", title = "") {
    return el("span", { class: `pill pill-${tone || "none"}`, title: title || void 0 }, text);
  }
  function block(title, note, ...children) {
    return el("section", { class: "block" }, el("div", { class: "block-head" }, el("h2", {}, title)), note ? el("p", { class: "note" }, note) : null, ...children);
  }
  function blockWith(title, note, aside, ...children) {
    return el("section", { class: "block" }, el("div", { class: "block-head" }, el("h2", {}, title), el("span", { class: "spacer" }), aside), note ? el("p", { class: "note" }, note) : null, ...children);
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

  // src/ui/diagrams.ts
  function clip(text, max) {
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  }
  function arrow() {
    return el("span", { class: "flow-arrow", "aria-hidden": "true" });
  }
  function stepChip(s, index) {
    const chip = el(
      "div",
      { class: `flow-step tone-edge-${s.tone || "none"}` },
      el("span", { class: "flow-step-n" }, String(index + 1)),
      el("div", { class: "flow-step-body" }, el("div", { class: "flow-step-name" }, s.step), el("div", { class: "flow-step-fn" }, dot(s.tone), s.functionName || "no function"))
    );
    tip(chip, [`Step ${index + 1}: ${s.step}`, `Function ${s.functionName}${s.fn ? ` (${s.fn.active?.version || s.fn.src.version || "installed"})` : " — not installed"}`, ...s.input ? [`Input ${s.input}`] : [], ...s.fn?.trouble?.message ? [clip(s.fn.trouble.message, 140)] : []]);
    const fn = s.fn;
    if (fn) clickable(chip, () => open(fn.ref));
    return chip;
  }
  function pipelineRow(c) {
    const head = el(
      "div",
      { class: `flow-comp tone-edge-${c.tone || "none"}` },
      el("div", { class: "flow-comp-name" }, c.name),
      el("div", { class: "flow-comp-sub" }, c.isDefault ? pill("default", "info") : null, c.legacy ? pill("Resources mode", "warn") : null, c.revisions ? el("span", { class: "faint" }, `rev ${c.latestRevision}`) : null)
    );
    tip(head, [c.name, `for ${c.kind} (${c.apiVersion})`, c.legacy ? "legacy Resources mode" : `${c.steps.length} pipeline step${c.steps.length === 1 ? "" : "s"}`, ...c.revisions ? [`${c.revisions} revision${c.revisions === 1 ? "" : "s"}`] : []]);
    clickable(head, () => open(c.ref));
    const row = el("div", { class: "flow-pipe" }, head);
    if (c.legacy) row.append(arrow(), el("div", { class: "flow-note" }, "patch-and-transform resources (not run by Crossplane v2)"));
    c.steps.forEach((s, i) => row.append(arrow(), stepChip(s, i)));
    if (!c.legacy) row.append(arrow(), el("div", { class: "flow-end" }, c.steps.length ? "composed resources" : "nothing"));
    return row;
  }
  function apiFlow(a) {
    const scopeTone = a.scope === "LegacyCluster" ? "warn" : "";
    const card = el(
      "div",
      { class: `flow-api tone-edge-${a.tone || "none"}` },
      el("div", { class: "flow-api-kind" }, a.kind),
      el("div", { class: "flow-api-group mono" }, a.group),
      el("div", { class: "flow-api-tags" }, pill(a.scope, scopeTone), a.referenceable ? pill(a.referenceable) : null, a.claimKind ? pill(`claim ${a.claimKind}`, "info") : null, a.established === false ? pill("not established", "error") : null)
    );
    tip(card, [a.kind, a.name, `${a.scope} · ${a.versions.map((v) => v.name).join(", ")}`, `${a.compositions.length} Composition${a.compositions.length === 1 ? "" : "s"}`]);
    clickable(card, () => open(a.ref));
    const rows = el("div", { class: "flow-rows" });
    if (a.compositions.length === 0) rows.append(el("div", { class: "flow-pipe" }, el("div", { class: "flow-missing" }, "No Composition serves this API")));
    for (const c of a.compositions) rows.append(pipelineRow(c));
    return el("div", { class: "flow" }, card, el("span", { class: "flow-fork", "aria-hidden": "true" }), rows);
  }

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
    const perProvider = kindsPerProvider(kinds);
    for (const p of providers) if (!perProvider.some((r) => r.provider === p.name)) perProvider.push({ provider: p.name, active: 0, inactive: 0 });
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
      perProvider,
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

  // src/pages/compositions.ts
  var REFRESH = 2e4;
  start("page", async (ctx) => {
    const head = byId("head");
    const body = byId("body");
    const failure = el("p", { class: "refresh-failure" });
    const note = `The APIs defined in ${ctx.contextName}, the Compositions behind each, and the function pipeline each one runs.`;
    replace(head, heading("compositions", "Compositions", note));
    let last = "";
    let search = "";
    let current = null;
    const flowsHost = el("div");
    const drawFlows = () => {
      if (current) replace(flowsHost, flows(current, search, (s) => {
        search = s;
        drawFlows();
      }));
    };
    const stop = every(
      REFRESH,
      async () => {
        const { installed, m } = await read();
        failure.textContent = "";
        document.getElementById("first")?.remove();
        const print = fingerprint([installed, m.snap.xrds, m.snap.compositions, m.snap.compositionRevisions, m.functions.map((f) => [f.name, f.tone])]);
        if (print === last) return;
        last = print;
        current = m;
        if (!installed) {
          replace(body, failure, notInstalled(ctx));
          return;
        }
        drawFlows();
        replace(body, failure, summary(m), flowsHost, strays(m));
      },
      (err) => {
        failure.textContent = err instanceof Error ? err.message : String(err);
      }
    );
    addEventListener("pagehide", stop);
  });
  function summary(m) {
    const scopes = [
      { label: "Namespaced", value: m.apis.apis.filter((a) => a.scope === "Namespaced").length, colour: "var(--chart-1)" },
      { label: "Cluster", value: m.apis.apis.filter((a) => a.scope === "Cluster").length, colour: "var(--chart-2)" },
      { label: "Legacy cluster (v1)", value: m.apis.apis.filter((a) => a.scope === "LegacyCluster").length, colour: "var(--chart-4)" }
    ];
    const colourOf = palette(m.apis.functionUse.map((f) => f.name));
    const use = m.apis.functionUse.slice(0, 8);
    const pipelines = m.apis.compositions.filter((c) => !c.legacy);
    const longest = Math.max(0, ...pipelines.map((c) => c.steps.length));
    const hist = Array.from({ length: Math.max(4, longest + 1) }, (_, n) => pipelines.filter((c) => c.steps.length === n));
    return el(
      "div",
      { class: "cards-3" },
      chartCard("APIs by scope", "Namespaced XRs are the v2 default; legacy cluster-scoped ones come from v1 XRDs and offer claims.", m.apis.apis.length ? donut(scopes, { value: String(m.apis.apis.length), label: "APIs" }, { title: "APIs by scope" }) : nothing("No XRDs yet.")),
      chartCard(
        "Function use",
        "Pipeline steps that run each Function, across every Composition.",
        use.length ? bars(
          use.map((f) => ({
            label: f.name,
            sub: f.fn ? plural(f.compositions, "composition") : "not installed",
            parts: [{ label: "Steps", value: f.steps, colour: f.fn ? colourOf(f.name) : STATUS.error }],
            onPick: f.fn ? () => open(f.fn?.ref ?? null) : void 0
          }))
        ) : nothing("No Functions installed.")
      ),
      chartCard(
        "Pipeline length",
        "How many steps each Composition runs: a histogram of the pipelines.",
        pipelines.length ? columns(
          hist.map((list, n) => ({
            parts: [{ label: "Compositions", value: list.length, colour: "var(--chart-1)" }],
            tip: [`${plural(n, "step")}`, `${plural(list.length, "Composition")}`, ...list.slice(0, 6).map((c) => c.name)]
          })),
          { height: 120, xLabels: hist.map((_, n) => ({ at: n + 0.5, text: String(n) })) }
        ) : nothing("No pipelines yet.")
      )
    );
  }
  function flows(m, search, onSearch) {
    const input = el("input", { type: "search", class: "search", placeholder: "Search APIs, compositions, functions", value: search, "aria-label": "Search", spellcheck: "false" });
    input.addEventListener("input", () => {
      onSearch(input.value);
      requestAnimationFrame(() => {
        const again = document.querySelector("input.search");
        again?.focus();
        again?.setSelectionRange(again.value.length, again.value.length);
      });
    });
    const q = search.trim().toLowerCase();
    const shown = m.apis.apis.filter((a) => !q || [a.kind, a.group, a.name, ...a.compositions.flatMap((c) => [c.name, ...c.steps.flatMap((s) => [s.step, s.functionName])])].join(" ").toLowerCase().includes(q));
    if (m.apis.apis.length === 0) return block("APIs and their pipelines", "", nothing("No CompositeResourceDefinitions yet. An XRD defines the API; a Composition says how to build it from managed resources, as a pipeline of functions."));
    return blockWith(
      "APIs and their pipelines",
      "Each API on the left; each Composition that serves it to the right, with its pipeline steps in order. A step whose function is missing or unhealthy is drawn in red. Click anything to open it.",
      input,
      shown.length ? el("div", { class: "flows" }, ...shown.map(apiFlow)) : nothing("Nothing matches.")
    );
  }
  function strays(m) {
    if (m.apis.orphans.length === 0) return null;
    return block("Compositions for an API that is not defined", "Their compositeTypeRef names a type no XRD defines, so nothing ever uses them.", el("div", { class: "flows" }, ...m.apis.orphans.map((c) => el("div", { class: "flow solo" }, el("div", { class: "flow-api ghost" }, el("div", { class: "flow-api-kind" }, c.kind), el("div", { class: "flow-api-group mono" }, c.group || c.apiVersion), el("div", { class: "flow-api-tags" }, el("span", { class: "pill pill-error" }, "no XRD"))), el("span", { class: "flow-fork", "aria-hidden": "true" }), el("div", { class: "flow-rows" }, pipelineRow(c))))));
  }
})();
