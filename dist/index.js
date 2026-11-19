// LogPulse release notes Action (MIT). Built from src/ with `npm run build`; do not edit by hand.
"use strict";

// src/run.ts
var import_node_fs2 = require("node:fs");
var import_node_os2 = require("node:os");
var import_node_path = require("node:path");

// src/converter/changelog-feed.ts
var VERSION_PATTERN = /^[vV]?[0-9A-Za-z][0-9A-Za-z.+_-]{0,39}$/;
function cleanVersion(v) {
  const t = (v ?? "").trim();
  return t && VERSION_PATTERN.test(t) ? t : null;
}
function parse(v) {
  const noV = v.trim().replace(/^[vV]/, "").split("+")[0] ?? "";
  const dash = noV.indexOf("-");
  const core = dash === -1 ? noV : noV.slice(0, dash);
  const pre = dash === -1 ? "" : noV.slice(dash + 1);
  const part = (s) => /^\d+$/.test(s) ? Number(s) : s.toLowerCase();
  return { core: core.split(/[._]/).filter(Boolean).map(part), pre: pre ? pre.split(".").filter(Boolean).map(part) : [] };
}
function cmpPart(a, b) {
  if (a === b) return 0;
  if (a === void 0) return typeof b === "number" ? b === 0 ? 0 : -1 : -1;
  if (b === void 0) return typeof a === "number" ? a === 0 ? 0 : 1 : 1;
  if (typeof a === "number" && typeof b === "number") return a < b ? -1 : 1;
  if (typeof a === "number") return -1;
  if (typeof b === "number") return 1;
  return a < b ? -1 : 1;
}
function compareVersions(a, b) {
  const pa = parse(a);
  const pb = parse(b);
  const n = Math.max(pa.core.length, pb.core.length);
  for (let i = 0; i < n; i++) {
    const c = cmpPart(pa.core[i], pb.core[i]);
    if (c !== 0) return c;
  }
  if (pa.pre.length === 0 && pb.pre.length === 0) return 0;
  if (pa.pre.length === 0) return 1;
  if (pb.pre.length === 0) return -1;
  const m = Math.max(pa.pre.length, pb.pre.length);
  for (let i = 0; i < m; i++) {
    if (pa.pre[i] === void 0) return -1;
    if (pb.pre[i] === void 0) return 1;
    const c = cmpPart(pa.pre[i], pb.pre[i]);
    if (c !== 0) return c;
  }
  return 0;
}

// src/converter/changelog-convert.ts
var CONVERT_LIMITS = {
  /** Characters of markdown accepted (pasted or fetched). */
  maxInputChars: 1e6,
  maxReleases: 500,
  /** Items kept per change list in one release. */
  maxItemsPerList: 200,
  /** Nested list items kept under one entry, and the levels kept (deeper items sit on the deepest level). */
  maxNestedItems: 50,
  maxNestedDepth: 4,
  /** Releases listed in the llms.txt summary (the JSON has all of them). */
  maxSummaryReleases: 100
};
var CONVERTED_FORMAT = "logpulse.changelog.v1";
var ConvertError = class extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
    this.name = "ConvertError";
  }
};
var FENCE = /^\s{0,3}(```|~~~)/;
var LIST_ITEM = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/;
var ATX = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
var LINK_DEF = /^\s{0,3}\[([^\]]+)\]:\s*<?(\S+?)>?(?:\s+["'(].*)?\s*$/;
var clip = (s, n) => s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
function plainText(md) {
  return md.split(/(`[^`]*`)/).map(
    (part, i) => i % 2 ? part : part.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1").replace(/<\/?[a-z][^>]*>/gi, "").replace(/(\*\*|__)(.+?)\1/g, "$2").replace(/(^|[\s(])[*_]([^*_\s][^*_]*?)[*_](?=$|[\s).,:;!?])/g, "$1$2")
  ).join("").replace(/\s+/g, " ").trim();
}
function expandTabs(lines) {
  let inFence = false;
  return lines.map((l) => {
    if (FENCE.test(l)) inFence = !inFence;
    if (inFence || !/^[ ]*\t/.test(l)) return l;
    const lead = /^[ \t]*/.exec(l)[0];
    let width = 0;
    for (const ch of lead) width = ch === "	" ? width + 4 - width % 4 : width + 1;
    return " ".repeat(width) + l.slice(lead.length);
  });
}
function dedent(lines) {
  const indents = lines.filter((l) => l.trim()).map((l) => /^\s*/.exec(l)[0].length);
  const min = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(Math.min(min, /^\s*/.exec(l)[0].length))).join("\n").replace(/^\n+|\s+$/g, "");
}
var MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
function isoDate(y, m, d) {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function findDate(text) {
  let m = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(text);
  if (m) return isoDate(+m[1], +m[2], +m[3]);
  m = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/.exec(text);
  if (m) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    if (mi >= 0) return isoDate(+m[3], mi + 1, +m[2]);
  }
  m = /\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/.exec(text);
  if (m) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mi >= 0) return isoDate(+m[3], mi + 1, +m[1]);
  }
  return null;
}
var VERSION_TOKEN = /(?<![\w.-])[vV]?(\d+(?:\.\d+){1,3}(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?(?:\+[0-9A-Za-z.-]+)?)(?![\w])/;
function findVersion(text) {
  const t = text.replace(/\[([^\]]*)\]\([^)]*\)/g, " $1 ").replace(/[[\]]/g, " ").replace(/@(?=\d)/g, " ");
  const re = new RegExp(VERSION_TOKEN.source, "g");
  for (let m = re.exec(t); m; m = re.exec(t)) {
    const raw = m[1].replace(/[.-]+$/, "");
    const parts = raw.split(/[-+]/)[0].split(".");
    if (parts.length === 3 && parts[2].length === 4 && +parts[0] <= 31 && +parts[2] >= 1990) continue;
    const v = cleanVersion(raw);
    if (v) return v;
  }
  const single = /(?<![\w.])[vV](\d{1,4})(?![\w.])/.exec(t);
  return single ? single[1] : null;
}
function sectionKind(heading) {
  const h = plainText(heading).toLowerCase().replace(/^[^\p{L}\p{N}]+/u, "").trim();
  if (/breaking|backwards?[- ]incompatible|incompatible change|major changes/.test(h)) return "breaking";
  if (/migrat|upgrad(e|ing)|how to update/.test(h)) return "migration";
  if (/deprecat/.test(h)) return "deprecated";
  if (/^remov|^deleted?\b|^dropped\b/.test(h)) return "removed";
  if (/securit|vulnerab|\bcve\b/.test(h)) return "security";
  if (/new contributors?|^contributors|thanks|acknowledg|full changelog/.test(h)) return "noise";
  if (/fix|bug|patch changes|^patches|hotfix|regression/.test(h)) return "fixed";
  if (/^add|^new\b|feature|minor changes|^feat|highlight/.test(h)) return "added";
  if (/chang|improv|enhanc|updat|perf|refactor|tweak|polish|optimi|^misc/.test(h)) return "changed";
  return "other";
}
function extractItems(input) {
  const lines = expandTabs(input);
  let inFence = false;
  let base = Infinity;
  for (const l of lines) {
    if (FENCE.test(l)) inFence = !inFence;
    else if (!inFence) {
      const m = LIST_ITEM.exec(l);
      if (m) base = Math.min(base, m[1].length);
    }
  }
  const items = [];
  if (base === Infinity) {
    let para = [];
    const flush = () => {
      if (para.length) items.push({ text: para.join(" ").trim(), detail: "" });
      para = [];
    };
    inFence = false;
    let fence = [];
    for (const l of lines) {
      if (FENCE.test(l)) {
        fence.push(l);
        if (inFence) {
          flush();
          const last = items[items.length - 1];
          if (last) last.detail = [last.detail, fence.join("\n")].filter(Boolean).join("\n");
          fence = [];
        }
        inFence = !inFence;
      } else if (inFence) fence.push(l);
      else if (!l.trim()) flush();
      else para.push(l.trim());
    }
    flush();
    return items.filter((i) => i.text);
  }
  let cur = null;
  const push = () => {
    if (cur) items.push({ text: cur.head.join(" ").trim(), detail: dedent(cur.detail) });
  };
  inFence = false;
  for (const l of lines) {
    if (FENCE.test(l) || inFence) {
      if (FENCE.test(l)) inFence = !inFence;
      if (cur) {
        cur.detail.push(l);
        cur.inDetail = true;
      }
      continue;
    }
    const m = LIST_ITEM.exec(l);
    if (m && m[1].length <= base + 1) {
      push();
      cur = { head: [m[3]], detail: [], blank: false, inDetail: false };
      continue;
    }
    if (!cur) continue;
    if (!l.trim()) {
      cur.blank = true;
      if (cur.inDetail) cur.detail.push("");
      continue;
    }
    const indent2 = /^\s*/.exec(l)[0].length;
    if (indent2 <= base && cur.blank) {
      push();
      cur = { head: [l.trim()], detail: [], blank: false, inDetail: false };
      continue;
    }
    if (!cur.inDetail && !cur.blank && !m) cur.head.push(l.trim());
    else {
      cur.inDetail = true;
      cur.detail.push(l);
    }
  }
  push();
  return items.filter((i) => i.text);
}
var ANY_FENCE = /^\s*(```|~~~)/;
function nestedList(detail) {
  const out = [];
  const stack = [];
  let last = null;
  let blank = false;
  let inFence = false;
  for (const line of expandTabs(detail.split("\n"))) {
    if (ANY_FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (!line.trim()) {
      blank = true;
      continue;
    }
    const indent2 = /^ */.exec(line)[0].length;
    const m = LIST_ITEM.exec(line);
    if (m) {
      if (out.length >= CONVERT_LIMITS.maxNestedItems) break;
      while (stack.length && indent2 < stack[stack.length - 1].indent - 1) stack.pop();
      let level = stack[stack.length - 1];
      const ordered = /\d/.test(m[2]);
      const start = ordered ? parseInt(m[2], 10) : 1;
      if (!level || indent2 >= level.indent + 2 && stack.length < CONVERT_LIMITS.maxNestedDepth) {
        const parent = level?.item ?? null;
        level = { indent: indent2, pad: parent ? parent.pad + parent.marker.length + 1 : 2, ordered, next: start, item: null };
        stack.push(level);
      } else if (level.ordered !== ordered) {
        level.ordered = ordered;
        level.next = start;
      }
      last = { pad: level.pad, marker: ordered ? `${level.next++}.` : "-", parts: [m[3]], col: indent2 + m[2].length + 1 };
      level.item = last;
      out.push(last);
      blank = false;
      continue;
    }
    if (last && (!blank || indent2 >= last.col)) last.parts.push(line.trim());
    else last = null;
    blank = false;
  }
  return out.flatMap((o) => {
    const text = clip(plainText(o.parts.join(" ")), 500);
    return text ? [`${" ".repeat(o.pad)}${o.marker} ${text}`] : [];
  });
}
var CONVENTIONAL = /^([a-z]+)(?:\(([^)]{1,60})\))?(!)?:\s+(.+)$/i;
var CONVENTIONAL_TYPES = /* @__PURE__ */ new Set([
  "feat",
  "feature",
  "fix",
  "bugfix",
  "hotfix",
  "perf",
  "refactor",
  "docs",
  "chore",
  "build",
  "ci",
  "test",
  "tests",
  "style",
  "revert",
  "deps",
  "security",
  "deprecate",
  "remove"
]);
function cleanItem(raw) {
  let text = raw.trim();
  let breaking = false;
  let scope = null;
  let type = null;
  text = text.replace(/^(?:\[[0-9a-f]{7,40}\]\([^)]*\)|[0-9a-f]{7,40})\s*:?\s+/, "");
  const cs = /^(?:\[#\d+\]\([^)]*\)\s*|#\d+\s+)?(?:\[`?[0-9a-f]{7,40}`?\]\([^)]*\)\s*|`[0-9a-f]{7,40}`\s*)?(?:Thanks\s+[^!\n]{1,200}!\s*)?-\s+/.exec(text);
  if (cs && cs[0].replace(/-\s+$/, "").trim()) text = text.slice(cs[0].length);
  text = text.replace(/:\s+#(\d+)\s*$/, " (#$1)");
  text = text.replace(/(?:\s*\((?:\[`?[0-9a-f]{7,40}`?\]\([^)]*\)|`?[0-9a-f]{7,40}`?)\))+\s*$/, "");
  text = text.replace(/\s+by @[\w-]+(?:\[bot\])? in https:\/\/github\.com\/[^\s]+\/pull\/(\d+)\s*$/i, " (#$1)");
  text = text.replace(/\s+by \[@[\w-]+(?:\[bot\])?\]\([^)]*\) in \[#(\d+)\]\([^)]*\)\s*$/i, " (#$1)");
  const marker = /^(?:⚠️?|💥|:boom:|:warning:)\s*|^\*\*breaking(?: changes?)?:?\*\*:?\s*|^\[breaking\]\s*|^breaking(?: changes?)?:\s*/i;
  if (marker.test(text)) {
    breaking = true;
    text = text.replace(marker, "");
  }
  const conv = CONVENTIONAL.exec(text);
  if (conv && CONVENTIONAL_TYPES.has(conv[1].toLowerCase())) {
    type = conv[1].toLowerCase();
    scope = conv[2]?.trim() || null;
    if (conv[3]) breaking = true;
    text = conv[4];
  }
  const bold = /^\*\*([^*]{1,60}?):?\*\*:?\s+(.+)$/.exec(text);
  if (bold && !/^breaking/i.test(bold[1])) {
    scope = scope ?? bold[1].trim();
    text = bold[2];
  }
  if (/\bBREAKING(?: CHANGES?)?\b/.test(text)) {
    breaking = true;
    text = text.replace(/\s*\(?\bBREAKING(?: CHANGES?)?\b\)?:?\s*/g, " ").trim();
  }
  return { text: text.trim(), scope, type, breaking };
}
function kindFromType(type) {
  if (!type) return null;
  if (type === "feat" || type === "feature") return "added";
  if (type === "fix" || type === "bugfix" || type === "hotfix") return "fixed";
  if (type === "security") return "security";
  if (type === "deprecate") return "deprecated";
  if (type === "remove") return "removed";
  if (type === "perf" || type === "refactor" || type === "revert") return "changed";
  return "other";
}
function toDeprecation(text) {
  const plain = plainText(text);
  const code = /`([^`]{1,200})`/.exec(text);
  let item = code?.[1] ?? plain.replace(/^deprecat\w*:?\s*(the\s+)?/i, "").split(/\s+(?:in favou?r of|is deprecated|are deprecated|has been deprecated|have been deprecated|—|-|;|\.\s)/i)[0];
  if (!code) item = item.replace(/[\s:–—-]*\(?#\d+\)?\s*$/, "");
  item = clip(item.trim() || plain, 200);
  const rep = /(?:in favou?r of|replaced (?:by|with)|use|switch to|migrate to|instead,? use)\s+`([^`]{1,200})`/i.exec(text) ?? /(?:in favou?r of|replaced (?:by|with))\s+([^\s,;)]+[^\s,;.)])/i.exec(plain);
  const removal = /(?:removed|removal|dropped|deleted)\s+(?:in|with|by|from)\s+(?:v(?:ersion)?\s*)?(\d+(?:\.\d+){0,3}(?:-[\w.]+)?)/i.exec(plain);
  const out = { item };
  if (rep && rep[1] !== item) out.replacement = clip(rep[1], 200);
  if (removal) out.removal_version = removal[1].replace(/\.$/, "");
  if (plain !== item) out.note = clip(plain, 1e3);
  return out;
}
var DEPRECATION_HINT = /^deprecat(e|ed|es|ion)\b|\b(is|are|has been|have been|now|was|were|marked( as)?) deprecated\b/i;
function toBreaking(c, detail) {
  let summary = plainText(c.text);
  let extra = "";
  if (summary.length > 300) {
    const cut = summary.search(/[.!?]\s/);
    if (cut > 20 && cut < 300) {
      extra = summary.slice(cut + 1).trim();
      summary = summary.slice(0, cut + 1);
    }
  }
  const migration = [extra, detail].filter(Boolean).join("\n\n");
  const out = { summary: clip(summary, 300) };
  if (c.scope) out.affects = clip(plainText(c.scope), 120);
  if (migration) out.migration = clip(migration, 4e3);
  return out;
}
function splitSections(lines) {
  const out = [{ kind: "other", lines: [], headed: false }];
  let inFence = false;
  for (const l of lines) {
    if (FENCE.test(l)) inFence = !inFence;
    const h = !inFence ? ATX.exec(l) : null;
    if (h) out.push({ kind: sectionKind(h[2]), lines: [], headed: true });
    else out[out.length - 1].lines.push(l);
  }
  return out.filter((s) => s.lines.some((l) => l.trim()));
}
function introOf(sections) {
  const lead = sections[0];
  if (!lead || lead.headed || !sections.some((s) => s.headed)) return null;
  if (lead.lines.some((l) => LIST_ITEM.test(l) || FENCE.test(l))) return null;
  const paragraphs = extractItems(lead.lines).map((i) => i.text);
  return paragraphs.length ? paragraphs : null;
}
var EXPLICIT_BREAKING = /\bbreaking\b|⚠|💥|:boom:|major changes|backwards?[- ]incompatible/i;
var NOISE_ITEM = /^\*{0,2}full changelog\*{0,2}:?|^updated dependencies\b|^@[\w-]+\/[\w.-]+@\d/i;
function emptyLists() {
  return { added: [], changed: [], deprecated: [], removed: [], fixed: [], security: [], other: [] };
}
function buildRelease(meta, bodyLines, opts = {}) {
  const removedIsBreaking = opts.removedIsBreaking ?? true;
  const changes = emptyLists();
  const breaking = [];
  const deprecations = [];
  const migrationParts = [];
  let summary = null;
  const seenBreaking = /* @__PURE__ */ new Set();
  const seenDep = /* @__PURE__ */ new Set();
  const addBreaking = (b) => {
    const key2 = b.summary.toLowerCase();
    if (seenBreaking.has(key2)) return;
    seenBreaking.add(key2);
    breaking.push(b);
  };
  const addDep = (d) => {
    const key2 = d.item.toLowerCase();
    if (seenDep.has(key2)) return;
    seenDep.add(key2);
    deprecations.push(d);
  };
  const sections = splitSections(bodyLines);
  const intro = introOf(sections);
  if (intro) sections.shift();
  for (const section of sections) {
    if (section.kind === "migration") {
      const md = dedent(section.lines);
      if (md) migrationParts.push(md);
      continue;
    }
    if (section.kind === "noise") continue;
    for (const item of extractItems(section.lines)) {
      const c = cleanItem(item.text);
      if (!c.text || NOISE_ITEM.test(c.text)) {
        if (/^updated dependencies\b/i.test(c.text)) changes.other.length < CONVERT_LIMITS.maxItemsPerList && changes.other.push(plainText(c.text));
        continue;
      }
      let kind = section.kind;
      if (kind === "other" || kind === "changed") kind = kindFromType(c.type) ?? kind;
      const plain = clip(plainText(c.text), 500);
      summary = summary ?? clip(plain, 280);
      const breakingEntry = kind === "breaking" || c.breaking || section.kind === "removed" && removedIsBreaking;
      if (breakingEntry) {
        const text = kind === "removed" && !/^(remov|drop|delet)/i.test(c.text) ? `Removed ${c.text.charAt(0).toLowerCase()}${c.text.slice(1)}` : c.text;
        addBreaking(toBreaking({ ...c, text }, item.detail));
      }
      if (kind === "deprecated" || DEPRECATION_HINT.test(plain)) addDep(toDeprecation(c.text));
      const list = kind === "added" || kind === "changed" || kind === "deprecated" || kind === "removed" || kind === "fixed" || kind === "security" ? kind : kind === "breaking" ? "changed" : "other";
      const nested = breakingEntry ? [] : nestedList(item.detail);
      if (changes[list].length < CONVERT_LIMITS.maxItemsPerList) changes[list].push([plain, ...nested].join("\n"));
    }
  }
  if (intro) {
    summary = clip(plainText(intro[0]), 280) || summary;
    for (const p of intro) {
      const c = cleanItem(p);
      if (c.breaking && breaking.length === 0) addBreaking(toBreaking(c, ""));
      if (deprecations.length === 0 && DEPRECATION_HINT.test(plainText(c.text))) addDep(toDeprecation(c.text));
    }
  }
  let migration_guide = null;
  const migration = migrationParts.join("\n\n");
  if (migration) {
    if (breaking.length === 0) {
      const first = plainText(migration.split("\n").find((l) => l.trim() && !FENCE.test(l)) ?? "") || "Upgrade steps required";
      breaking.push({ summary: clip(first.replace(/^[-*+]\s+/, ""), 300), migration: clip(migration, 4e3) });
    } else if (breaking.length === 1 && !breaking[0].migration) breaking[0].migration = clip(migration, 4e3);
    else migration_guide = clip(migration, 2e4);
  }
  if (!summary) {
    const firstText = bodyLines.find((l) => l.trim() && !ATX.test(l) && !FENCE.test(l));
    summary = firstText ? clip(plainText(firstText.replace(LIST_ITEM, "$3")), 280) || null : null;
  }
  const score = {
    new: changes.added.length,
    improved: changes.changed.length + changes.deprecated.length + changes.removed.length,
    fixed: changes.fixed.length + changes.security.length
  };
  const category = score.new === 0 && score.improved === 0 && score.fixed === 0 ? "improved" : score.new >= score.improved && score.new >= score.fixed ? "new" : score.improved >= score.fixed ? "improved" : "fixed";
  return {
    ...meta,
    category,
    summary: summary || null,
    changes,
    has_breaking_changes: breaking.length > 0,
    breaking_changes: breaking.slice(0, 50),
    deprecations: deprecations.slice(0, 50),
    migration_guide,
    notes_markdown: dedent(bodyLines)
  };
}
function cleanTitle(heading, version) {
  let t = heading.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[[\]]/g, "");
  if (version) t = t.replace(new RegExp(`(?:@|\\bv)?${version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"), " ");
  t = t.replace(/\(?\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\)?/g, " ").replace(/\(?\b[A-Za-z]{3,9}\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}\)?/g, " ").replace(/\byanked\b/gi, " ").replace(/\(\s*\)/g, " ").replace(/^[\s\-–—:|·•,]+|[\s\-–—:|·•,]+$/g, "").replace(/\s+/g, " ").trim();
  if (/^(?:release|version|v)$/i.test(t)) return "";
  return new RegExp("\\p{L}{2,}", "u").test(t) ? clip(plainText(t), 160) : "";
}
function finalize(releases, unreleased, opts) {
  const warnings = [...opts.warnings];
  if (releases.length === 0) {
    throw new ConvertError(
      unreleased ? "Only an “Unreleased” section was found. Add a released version heading like “## 1.2.0 - 2024-05-01” and try again." : "No releases found. Release headings need a version, like “## 1.2.0”, “## [1.2.0] - 2024-05-01” or “# v2.0.0”."
    );
  }
  let list = releases;
  if (list.length > CONVERT_LIMITS.maxReleases) {
    warnings.push(`Only the first ${CONVERT_LIMITS.maxReleases} of ${list.length} releases were converted.`);
    list = list.slice(0, CONVERT_LIMITS.maxReleases);
  }
  if (list.every((r) => r.version)) list = [...list].sort((a, b) => compareVersions(b.version, a.version));
  const unversioned = list.filter((r) => !r.version).length;
  if (unversioned) warnings.push(`${unversioned} release${unversioned === 1 ? " has" : "s have"} no version number, so version comparisons skip ${unversioned === 1 ? "it" : "them"}.`);
  const versions = list.map((r) => r.version?.toLowerCase()).filter(Boolean);
  const dupes = [...new Set(versions.filter((v, i) => versions.indexOf(v) !== i))];
  if (dupes.length) warnings.push(`Some versions appear more than once (${dupes.slice(0, 5).join(", ")}).`);
  const latest = list.find((r) => r.version && !r.prerelease && !r.yanked) ?? list.find((r) => r.version);
  return {
    format: CONVERTED_FORMAT,
    name: opts.name,
    source: opts.source,
    generated_at: (opts.now ?? /* @__PURE__ */ new Date()).toISOString(),
    latest_version: latest?.version ?? null,
    release_count: list.length,
    breaking_change_count: list.reduce((n, r) => n + r.breaking_changes.length, 0),
    deprecation_count: list.reduce((n, r) => n + r.deprecations.length, 0),
    unreleased,
    releases: list,
    warnings
  };
}
function headingsOf(lines) {
  const out = [];
  let inFence = false;
  lines.forEach((l, i) => {
    if (FENCE.test(l)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const atx = ATX.exec(l);
    if (atx) {
      out.push({ index: i, level: atx[1].length, text: atx[2] });
      return;
    }
    const next = lines[i + 1];
    if (next && /^\s{0,3}(=+|-+)\s*$/.test(next) && l.trim() && !LIST_ITEM.test(l) && !/^\s{0,3}(=+|-+)\s*$/.test(l)) {
      out.push({ index: i, level: next.trim().startsWith("=") ? 1 : 2, text: l.trim() });
    }
  });
  return out;
}
function stripName(text) {
  const t = plainText(text).replace(/\b(change ?log|changes|release notes|releases|history|news|what'?s new)\b/gi, "").replace(/^[\s\-–—:|]+|[\s\-–—:|]+$/g, "").replace(/\s+/g, " ").trim();
  return t ? clip(t, 100) : null;
}
function convertMarkdownChangelog(markdown, opts = {}) {
  if (markdown.length > CONVERT_LIMITS.maxInputChars) throw new ConvertError(`That changelog is over ${CONVERT_LIMITS.maxInputChars / 1e6} MB. Paste a shorter part, like the last few releases.`, 413);
  const all = markdown.replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "").split("\n");
  const links = /* @__PURE__ */ new Map();
  const lines = all.map((l) => {
    const def = LINK_DEF.exec(l);
    if (def && /^https?:\/\//.test(def[2])) {
      links.set(def[1].toLowerCase().replace(/^v/, ""), def[2]);
      return "";
    }
    return l;
  });
  if (links.size) {
    for (let i = 0; i < lines.length; i++) {
      if (ATX.test(lines[i])) continue;
      lines[i] = lines[i].replace(/(?<!!)\[([^\]\n]{1,100})\](?![([:])/g, (m, label) => {
        const url = links.get(label.toLowerCase().replace(/^v/, ""));
        return url ? `[${label}](${url})` : m;
      });
    }
  }
  const heads = headingsOf(lines);
  const removedIsBreaking = !EXPLICIT_BREAKING.test(markdown);
  const isRelease = (h) => !!findVersion(h.text) || /^\W*unreleased\b/i.test(plainText(h.text));
  const sectionLevels = heads.filter((h) => !isRelease(h) && sectionKind(h.text) !== "other").map((h) => h.level);
  const versionHeads = heads.filter(isRelease);
  let maxLevel;
  if (sectionLevels.length) {
    const counts = /* @__PURE__ */ new Map();
    for (const l of sectionLevels) counts.set(l, (counts.get(l) ?? 0) + 1);
    const common = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
    maxLevel = common - 1;
    if (!versionHeads.some((h) => h.level <= maxLevel)) maxLevel = Math.min(...versionHeads.map((h) => h.level), 6);
  } else {
    const counts = /* @__PURE__ */ new Map();
    for (const h of versionHeads) counts.set(h.level, (counts.get(h.level) ?? 0) + 1);
    maxLevel = counts.size ? [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0] : 0;
  }
  let releaseHeads = versionHeads.filter((h) => h.level <= maxLevel);
  releaseHeads = releaseHeads.filter((h, i) => {
    const next = releaseHeads[i + 1];
    if (!next || next.level <= h.level) return true;
    const between = lines.slice(h.index + 1, next.index).some((l) => l.trim() && !/^\s{0,3}(=+|-+)\s*$/.test(l));
    return between;
  });
  let name = opts.name?.trim() || null;
  if (!name) {
    const first = heads.find((h) => h.level === 1 && !isRelease(h) && (!releaseHeads[0] || h.index < releaseHeads[0].index));
    if (first) name = stripName(first.text);
  }
  const releases = [];
  let unreleased = null;
  releaseHeads.forEach((h, i) => {
    const end = releaseHeads[i + 1]?.index ?? lines.length;
    let stop = end;
    for (const other of heads) {
      if (other.index > h.index && other.index < end && other.level < h.level && !isRelease(other)) {
        stop = other.index;
        break;
      }
    }
    const isSetext = lines[h.index + 1] !== void 0 && /^\s{0,3}(=+|-+)\s*$/.test(lines[h.index + 1]) && !ATX.test(lines[h.index]);
    const body = lines.slice(h.index + (isSetext ? 2 : 1), stop);
    const version = findVersion(h.text);
    const linkMatch = /\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/.exec(h.text);
    const url = linkMatch?.[1] ?? (version ? links.get(version.toLowerCase()) ?? null : null);
    if (!version) {
      const r = buildRelease({ version: null, title: "Unreleased", date: null, url: links.get("unreleased") ?? null, prerelease: false, yanked: false }, body, { removedIsBreaking });
      if (Object.values(r.changes).some((l) => l.length) || r.breaking_changes.length) unreleased = r;
      return;
    }
    releases.push(
      buildRelease(
        {
          version: version.replace(/^[vV](?=\d)/, ""),
          title: cleanTitle(h.text, version) || `Version ${version.replace(/^[vV](?=\d)/, "")}`,
          date: findDate(h.text),
          url,
          prerelease: /-/.test(version.split("+")[0]),
          yanked: /\byanked\b/i.test(h.text)
        },
        body,
        { removedIsBreaking }
      )
    );
  });
  return finalize(releases, unreleased, { name, source: opts.source ?? { kind: "markdown", url: null }, warnings: opts.warnings ?? [], now: opts.now });
}

// src/commits.ts
var DEFAULT_EXCLUDED_TYPES = ["chore", "ci", "build", "test", "tests", "style"];
var SECTION_HEADINGS = {
  added: "Added",
  changed: "Changed",
  deprecated: "Deprecated",
  removed: "Removed",
  fixed: "Fixed",
  security: "Security",
  other: "Other changes"
};
var CONVENTIONAL2 = /^([a-z]+)(?:\(([^)]{1,60})\))?(!)?:\s+(.+)$/i;
var TYPE_SECTION = {
  feat: "added",
  feature: "added",
  fix: "fixed",
  bugfix: "fixed",
  hotfix: "fixed",
  perf: "changed",
  refactor: "changed",
  revert: "changed",
  deps: "changed",
  security: "security",
  deprecate: "deprecated",
  remove: "removed",
  docs: "other"
};
var VERB_SECTIONS = [
  [/^(?:security|cve-\d)/i, "security"],
  [/^deprecat/i, "deprecated"],
  [/^(?:remove[sd]?|drop(?:s|ped)?|delete[sd]?)\b/i, "removed"],
  [/^(?:fix(?:e[sd])?|resolve[sd]?|correct(?:s|ed)?|patch(?:es|ed)?|prevent(?:s|ed)?)\b/i, "fixed"],
  [/^(?:add(?:s|ed)?|introduce[sd]?|implement(?:s|ed)?|support(?:s|ed)?|create[sd]?|new)\b/i, "added"],
  [
    /^(?:update[sd]?|improve[sd]?|change[sd]?|refactor(?:s|ed)?|rename[sd]?|bump(?:s|ed)?|upgrade[sd]?|move[sd]?|replace[sd]?|optimi[sz]e[sd]?|speed up|make[s]?|use[sd]?|switch(?:es|ed)?|tweak(?:s|ed)?|clean(?:s|ed)? up|simplif(?:y|ies|ied)|enhance[sd]?|polish(?:es|ed)?|allow(?:s|ed)?|enable[sd]?|disable[sd]?|revert(?:s|ed)?|reduce[sd]?|increase[sd]?)\b/i,
    "changed"
  ]
];
var BOOKKEEPING = /^(?:v?\d+\.\d+\.\d+\S*$|(?:\w+(?:\([^)]*\))?:\s*)?(?:release|prepare release|bump version|version bump|publish|tag)\b.*\d+\.\d+)/i;
var TRAILER = /^(?:signed-off-by|co-authored-by|reviewed-by|acked-by|refs?|closes|fixes|change-id|cc):/i;
var GITHUB_MERGE = /^Merge pull request #(\d+) from \S+/i;
var GITLAB_MERGE = /^Merge branch '[^'\n]+' into '[^'\n]+'\s*$/;
var GITLAB_REF = /^See merge request \S*!(\d+)\s*$/;
var TITLE_REF = /\s\(#(\d+)\)$/;
var SQUASHED = /^\* \S/;
var SQUASHED_BREAKING = /^\* [a-z]+(?:\([^)]{1,60}\))?!:\s/i;
function requestMerge(commit) {
  const lines = commit.message.replace(/\r\n?/g, "\n").split("\n");
  const subject = (lines[0] ?? "").trim();
  const rest = lines.slice(1);
  const firstText = (from) => from.findIndex((l) => l.trim());
  const github = GITHUB_MERGE.exec(subject);
  if (github) {
    const at = firstText(rest);
    if (at < 0) return null;
    return { ref: `#${github[1]}`, title: rest[at].trim(), body: rest.slice(at + 1).join("\n").trim() };
  }
  if (GITLAB_MERGE.test(subject)) {
    const refAt = rest.findIndex((l) => GITLAB_REF.test(l.trim()));
    if (refAt < 0) return null;
    const body = rest.slice(0, refAt);
    const at = firstText(body);
    if (at < 0 || /^Merge branch\b/i.test(body[at].trim())) return null;
    return { ref: `!${GITLAB_REF.exec(rest[refAt].trim())[1]}`, title: body[at].trim(), body: body.slice(at + 1).join("\n").trim() };
  }
  const titled = commit.parents > 1 ? TITLE_REF.exec(subject) : null;
  if (titled) return { ref: `#${titled[1]}`, title: subject, body: rest.join("\n").trim() };
  return null;
}
var parentsOf = (c) => c.parentShas ?? [];
var isRequestMerge = (c) => parentsOf(c).length > 1 && requestMerge(c) !== null;
function releaseCommits(commits, head) {
  if (!commits.some((c) => c.parentShas)) return commits;
  const byId = new Map(commits.map((c) => [c.sha, c]));
  let start = head && byId.has(head) ? head : null;
  if (!start) {
    const isParent = new Set(commits.flatMap(parentsOf));
    start = commits.find((c) => !isParent.has(c.sha))?.sha ?? null;
    if (!start) return commits;
  }
  const position = new Map(commits.map((c, i) => [c.sha, i]));
  const claimed = /* @__PURE__ */ new Set();
  const reachable = (shas) => {
    const found = /* @__PURE__ */ new Set();
    const stack = [...shas];
    while (stack.length) {
      const c = byId.get(stack.pop());
      if (!c || found.has(c.sha) || claimed.has(c.sha)) continue;
      found.add(c.sha);
      stack.push(...parentsOf(c));
    }
    return [...found].sort((a, b) => position.get(a) - position.get(b)).map((sha) => byId.get(sha));
  };
  const line = (sha) => {
    const chain = [];
    for (let c = byId.get(sha); c && !claimed.has(c.sha); c = byId.get(parentsOf(c)[0] ?? "")) {
      claimed.add(c.sha);
      chain.push(c);
    }
    const replaced = /* @__PURE__ */ new Map();
    for (const c of [...chain].reverse()) {
      const sides = parentsOf(c).slice(1);
      if (!sides.length) continue;
      const branch = reachable(sides);
      const request = requestMerge(c) !== null;
      if (request && !branch.some(isRequestMerge)) {
        for (const b of branch) claimed.add(b.sha);
        replaced.set(c.sha, [{ ...c, branchCommits: branch }]);
      } else {
        const brought = sides.flatMap(line);
        replaced.set(c.sha, request ? brought : [c, ...brought]);
      }
    }
    return chain.flatMap((c) => replaced.get(c.sha) ?? [c]);
  };
  return line(start);
}
function footerText(text, squash) {
  const lines = text.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^-{3,}\s*$/.test(l.trim())) break;
    if (squash && i > 0 && SQUASHED.test(l) && !lines[i - 1].trim()) break;
    if (!TRAILER.test(l.trim())) out.push(l);
  }
  return out.join("\n").trim();
}
var KNOWN_COMMIT_TYPES = [...Object.keys(TYPE_SECTION), ...DEFAULT_EXCLUDED_TYPES];
function converterLine(subject, conv, type, breaking) {
  const bangRead = !!conv?.[3] && !!type && CONVENTIONAL_TYPES.has(type);
  return `${breaking && !bangRead ? "BREAKING: " : ""}${subject}`;
}
function commitEntry(commit, excludedTypes = DEFAULT_EXCLUDED_TYPES) {
  const lines = commit.message.replace(/\r\n?/g, "\n").split("\n");
  let subject = (lines[0] ?? "").trim();
  let body = lines.slice(1).join("\n").trim();
  if (!subject) return null;
  const request = requestMerge(commit);
  if (request) {
    subject = request.title.endsWith(`(${request.ref})`) ? request.title : `${request.title} (${request.ref})`;
    body = request.body;
  } else if (commit.parents > 1 || /^Merge (?:pull request|branch|remote-tracking branch|tag|commit)\b/i.test(subject)) {
    return null;
  }
  const squash = TITLE_REF.test(subject) && SQUASHED.test(body);
  const footer = /^BREAKING[ -]CHANGE:\s*([\s\S]*)$/m.exec(body);
  const migration = footer ? footerText(footer[1], squash) : "";
  const squashBreaking = squash && body.split("\n").some((l) => SQUASHED_BREAKING.test(l));
  const fromBranch = (commit.branchCommits ?? []).map((b) => commitEntry(b, [])).filter((e) => !!e?.breaking);
  const detail = [...new Set([migration, ...fromBranch.map((e) => e.detail)].filter(Boolean))].join("\n\n");
  const conv = CONVENTIONAL2.exec(subject);
  const type = conv ? conv[1].toLowerCase() : null;
  const breaking = !!footer || !!conv?.[3] || squashBreaking || fromBranch.length > 0;
  if (BOOKKEEPING.test(subject) && !breaking) return null;
  if (type && excludedTypes.includes(type) && !breaking) return null;
  const text = conv ? conv[4] : subject;
  const section = type && TYPE_SECTION[type] || VERB_SECTIONS.find(([re]) => re.test(text))?.[1] || "other";
  return { section, line: converterLine(subject, conv, type, breaking), detail, breaking };
}
function commitsToMarkdown(commits, excludedTypes = DEFAULT_EXCLUDED_TYPES) {
  const groups = /* @__PURE__ */ new Map();
  let used = 0;
  let skipped = 0;
  const seen = /* @__PURE__ */ new Set();
  for (const c of commits) {
    const e = commitEntry(c, excludedTypes);
    if (!e) {
      skipped++;
      continue;
    }
    const key2 = e.line.toLowerCase();
    if (seen.has(key2)) {
      skipped++;
      continue;
    }
    seen.add(key2);
    used++;
    const list = groups.get(e.section) ?? [];
    list.push(e);
    groups.set(e.section, list);
  }
  const out = [];
  for (const section of Object.keys(SECTION_HEADINGS)) {
    const list = groups.get(section);
    if (!list?.length) continue;
    out.push(`### ${SECTION_HEADINGS[section]}`, "");
    for (const e of list) {
      out.push(`- ${e.line}`);
      if (e.detail) {
        out.push("", ...e.detail.split("\n").map((l) => l.trim() ? `  ${l}` : ""), "");
      }
    }
    out.push("");
  }
  return { markdown: out.join("\n").trim(), used, skipped };
}
function releaseFromCommits(commits, meta, excludedTypes = DEFAULT_EXCLUDED_TYPES) {
  const { markdown, used, skipped } = commitsToMarkdown(commits, excludedTypes);
  const release = buildRelease(
    {
      version: meta.version,
      title: meta.version ? `Version ${meta.version}` : meta.tag ?? "Release",
      date: meta.date,
      url: meta.url,
      prerelease: meta.prerelease,
      yanked: false
    },
    markdown ? markdown.split("\n") : [],
    // Commits mark breaking changes explicitly ("!" or a BREAKING CHANGE footer).
    { removedIsBreaking: false }
  );
  return { release, used, skipped };
}

// src/git.ts
var import_node_child_process = require("node:child_process");
var RECORD = "";
var FIELD = "";
var LOG_FORMAT = `%H${FIELD}%P${FIELD}%cs${FIELD}%B${RECORD}`;
var RANGE_LIMIT = 2e4;
function parseLog(out) {
  return out.split(RECORD).map((r) => r.replace(/^\n+/, "")).filter((r) => r.trim()).map((r) => {
    const [sha = "", parents = "", date = "", message = ""] = r.split(FIELD);
    const parentShas = parents.trim() ? parents.trim().split(/\s+/) : [];
    return { sha, parents: parentShas.length, parentShas, date: date || null, message: message.trim() };
  });
}
var LocalGit = class {
  run;
  range = null;
  /** `run` replaces the git binary, for tests. */
  constructor(cwd, run2) {
    this.run = run2 ?? ((args) => {
      try {
        return (0, import_node_child_process.execFileSync)("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 256 * 1024 * 1024 });
      } catch {
        return null;
      }
    });
  }
  /** True when git works here and has the whole history (so tags and ranges are complete). */
  usable() {
    if (this.run(["rev-parse", "--is-inside-work-tree"])?.trim() !== "true") return false;
    return this.run(["rev-parse", "--is-shallow-repository"])?.trim() === "false";
  }
  resolves(ref) {
    return this.run(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]) !== null;
  }
  tags() {
    return (this.run(["tag", "--list"]) ?? "").split("\n").map((t) => t.trim()).filter(Boolean);
  }
  /**
   * The commit each tag points at (an annotated tag's commit, not the tag
   * object), so floating tags like v1 and a release's own commit can be told
   * apart. Empty when there are no tags.
   */
  tagCommits() {
    const out = /* @__PURE__ */ new Map();
    for (const line of (this.run(["show-ref", "--tags", "--dereference"]) ?? "").split("\n")) {
      const m = /^([0-9a-f]{40,64}) refs\/tags\/(.+?)(\^\{\})?$/.exec(line.trim());
      if (!m) continue;
      if (m[3] || !out.has(m[2])) out.set(m[2], m[1]);
    }
    return out;
  }
  /** The nearest tag reachable from the commit before `ref`, for tags without a version number. */
  tagBefore(ref) {
    return this.run(["describe", "--tags", "--abbrev=0", `${ref}^`])?.trim() || null;
  }
  /** The range (from, to] as release notes read it (releaseCommits), read once per range. */
  history(from, to) {
    const key2 = `${from ?? ""}..${to}`;
    if (this.range?.key === key2) return this.range.commits;
    const head = this.run(["rev-parse", "--verify", "--quiet", `${to}^{commit}`])?.trim() || null;
    const out = this.run(["log", `--max-count=${RANGE_LIMIT}`, `--format=${LOG_FORMAT}`, from ? `${from}..${to}` : to, "--"]);
    const commits = out === null ? [] : releaseCommits(parseLog(out), head);
    this.range = { key: key2, commits };
    return commits;
  }
  /**
   * Commits in (from, to], newest first, up to `max`: the target branch's own
   * commits and one merge commit per pull or merge request, without the
   * commits on its branch (see releaseCommits).
   */
  commits(from, to, max) {
    return this.history(from, to).slice(0, max);
  }
  /** How many commits commits() lists without the cap, to report when the list was cut. */
  count(from, to) {
    return this.history(from, to).length;
  }
};

// src/github.ts
var GitHubError = class extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    this.name = "GitHubError";
  }
};
var MAX_PAGES = 10;
var GitHub = class {
  constructor(token, apiUrl, owner, repo, fetchImpl = fetch) {
    this.token = token;
    this.owner = owner;
    this.repo = repo;
    this.fetchImpl = fetchImpl;
    this.base = apiUrl.replace(/\/+$/, "");
  }
  base;
  get repoPath() {
    return `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}`;
  }
  async request(method, path, opts = {}) {
    const url = `${this.base}${path}`;
    let attempt = 0;
    for (; ; ) {
      attempt++;
      let res;
      try {
        res = await this.fetchImpl(url, {
          method,
          headers: {
            accept: opts.accept ?? "application/vnd.github+json",
            "x-github-api-version": "2022-11-28",
            "user-agent": "logpulse-release-notes-action",
            ...this.token ? { authorization: `Bearer ${this.token}` } : {},
            ...opts.body !== void 0 ? { "content-type": "application/json" } : {}
          },
          body: opts.body !== void 0 ? JSON.stringify(opts.body) : null,
          signal: AbortSignal.timeout(3e4)
        });
      } catch (e) {
        if (attempt < 3) {
          await sleep(1e3 * attempt);
          continue;
        }
        throw new GitHubError(`Couldn't reach the GitHub API (${e.message}).`, 0);
      }
      const text = await res.text();
      if ((res.status >= 500 || res.status === 429 || res.status === 403 && /rate limit/i.test(text)) && attempt < 3) {
        const wait = Math.min(Number(res.headers.get("retry-after")) || attempt * 2, 20);
        await sleep(wait * 1e3);
        continue;
      }
      if (res.status === 404 && opts.allow404) return { status: 404, data: null, text };
      if (!res.ok) throw new GitHubError(explain(method, path, res.status, text), res.status);
      const isJson = (res.headers.get("content-type") ?? "").includes("json");
      return { status: res.status, data: isJson && text ? JSON.parse(text) : null, text };
    }
  }
  async getRelease(id) {
    const res = await this.request("GET", `${this.repoPath}/releases/${id}`, { allow404: true });
    return res.data;
  }
  /** The published release for a tag, or a draft that uses it, or null. */
  async findRelease(tag) {
    const direct = await this.request("GET", `${this.repoPath}/releases/tags/${encodeURIComponent(tag)}`, { allow404: true });
    if (direct.data) return direct.data;
    const list = await this.request("GET", `${this.repoPath}/releases?per_page=100`);
    return list.data?.find((r) => r.tag_name === tag) ?? null;
  }
  async updateRelease(id, patch) {
    const res = await this.request("PATCH", `${this.repoPath}/releases/${id}`, { body: patch });
    return res.data;
  }
  async createRelease(input) {
    const res = await this.request("POST", `${this.repoPath}/releases`, { body: input });
    return res.data;
  }
  /** Tag names with the commit each points at, newest pages first, up to `max`. */
  async listTags(max = 1e3) {
    const out = [];
    for (let page = 1; page <= MAX_PAGES && out.length < max; page++) {
      const res = await this.request("GET", `${this.repoPath}/tags?per_page=100&page=${page}`);
      const batch = res.data ?? [];
      out.push(...batch.map((t) => ({ name: t.name, sha: typeof t.commit?.sha === "string" ? t.commit.sha : null })));
      if (batch.length < 100) break;
    }
    return out.slice(0, max);
  }
  /**
   * Every commit in base...head, newest first: the whole range, because
   * telling a pull request's branch commits from the target branch's needs all
   * of them. Ranges over MAX_PAGES pages keep their newest commits (the API
   * lists oldest first); `complete` says whether that happened.
   */
  async compare(base, head) {
    const path = (page) => `${this.repoPath}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}?per_page=100&page=${page}`;
    const first = await this.request("GET", path(1));
    const total = first.data?.total_commits ?? 0;
    const pages = Math.max(1, Math.ceil(total / 100));
    const from = pages > MAX_PAGES ? pages - MAX_PAGES + 1 : 1;
    const commits = from === 1 ? (first.data?.commits ?? []).map(toCommit) : [];
    for (let page = Math.max(from, 2); page <= pages; page++) {
      const batch = (await this.request("GET", path(page))).data?.commits ?? [];
      commits.push(...batch.map(toCommit));
      if (batch.length < 100) break;
    }
    return { commits: commits.reverse(), total, complete: from === 1 };
  }
  /** History reachable from `ref`, newest first, a page at a time until `enough` says so (for a first release). */
  async listCommits(ref, enough = () => false) {
    const out = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await this.request("GET", `${this.repoPath}/commits?sha=${encodeURIComponent(ref)}&per_page=100&page=${page}`);
      const batch = res.data ?? [];
      out.push(...batch.map(toCommit));
      if (batch.length < 100 || enough(out)) break;
    }
    return out;
  }
  /** A file's text at a ref, or null when it doesn't exist there. */
  async fileAt(path, ref) {
    const clean = path.replace(/^\.?\/+/, "").split("/").map(encodeURIComponent).join("/");
    const res = await this.request("GET", `${this.repoPath}/contents/${clean}?ref=${encodeURIComponent(ref)}`, {
      accept: "application/vnd.github.raw+json",
      allow404: true
    });
    return res.status === 404 ? null : res.text;
  }
};
function toCommit(c) {
  const date = c.commit.committer?.date ?? c.commit.author?.date ?? null;
  const parentShas = (c.parents ?? []).flatMap((p) => typeof p?.sha === "string" ? [p.sha] : []);
  return { sha: c.sha, message: c.commit.message, parents: c.parents?.length ?? 1, parentShas, date: date ? date.slice(0, 10) : null };
}
function explain(method, path, status, text) {
  let detail = "";
  try {
    detail = JSON.parse(text).message ?? "";
  } catch {
    detail = text.slice(0, 200);
  }
  const what = `${method} ${path.split("?")[0]}`;
  if ((status === 403 || status === 404) && method !== "GET" && /releases/.test(path)) {
    return `GitHub refused to ${method === "POST" ? "create" : "update"} the release (${status}${detail ? `: ${detail}` : ""}). Give the job "permissions: contents: write", or pass a token that can write to this repository.`;
  }
  if (status === 401) return `GitHub rejected the token (401). Check the github-token input.`;
  return `GitHub API error ${status} on ${what}${detail ? `: ${detail}` : ""}.`;
}
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// src/render.ts
var LISTS = [
  ["added", "Added"],
  ["changed", "Changed"],
  ["deprecated", "Deprecated"],
  ["removed", "Removed"],
  ["fixed", "Fixed"],
  ["security", "Security"],
  ["other", "Other changes"]
];
var MAX_BODY_CHARS = 12e4;
var key = (s) => s.split("\n")[0].toLowerCase().replace(/^removed\s+/, "").replace(/[\s.!…]+$/, "").trim();
function isBreakingEntry(entry, release) {
  const e = key(entry);
  if (!e) return false;
  return release.breaking_changes.some((b) => {
    const s = key(b.summary);
    if (!s) return false;
    if (s === e) return true;
    return e.startsWith(s) && (/^[.!?]/.test(e.slice(s.length)) || s.length >= 250);
  });
}
var cap = (s) => s.replace(/^([a-z])/, (m) => m.toUpperCase());
var indent = (md, by = "  ") => md.split("\n").map((l) => l.trim() ? by + l : "").join("\n");
function firstEntry(release) {
  for (const [name] of LISTS) {
    const first = release.changes[name][0];
    if (first) return first;
  }
  return null;
}
function introOf2(release) {
  const s = release.summary?.trim();
  if (!s) return null;
  const first = firstEntry(release);
  if (first && (first === s || first.startsWith(s.replace(/…$/, "")))) return null;
  if (release.breaking_changes.some((b) => b.summary === s)) return null;
  return s;
}
function hasContent(release) {
  return release.breaking_changes.length > 0 || LISTS.some(([name]) => release.changes[name].length > 0) || !!release.migration_guide;
}
function renderReleaseNotes(release, opts = {}) {
  const h = "#".repeat(opts.headingLevel ?? 2);
  const fix = opts.capitalize ? cap : (s) => s;
  const parts = [];
  if (opts.style === "original" && release.notes_markdown.trim()) {
    parts.push(release.notes_markdown.trim());
  } else {
    const intro = introOf2(release);
    if (intro) parts.push(intro);
    if (release.breaking_changes.length) {
      const items = release.breaking_changes.map((b) => {
        const head = `- ${b.affects ? `**${b.affects}:** ` : ""}${fix(b.summary)}`;
        return b.migration ? `${head}

${indent(b.migration)}
` : head;
      });
      parts.push(`${h} ⚠️ Breaking changes

${items.join("\n")}`.trimEnd());
    }
    for (const [name, title] of LISTS) {
      const entries = release.changes[name].filter((e) => !isBreakingEntry(e, release));
      if (entries.length) parts.push(`${h} ${title}

${entries.map((e) => `- ${fix(e)}`).join("\n")}`);
    }
    if (release.migration_guide) parts.push(`${h} Upgrade guide

${release.migration_guide.trim()}`);
    if (!parts.length) parts.push("No user-facing changes in this release.");
  }
  if (opts.compareUrl) parts.push(`**Full changelog:** ${opts.compareUrl}`);
  const md = parts.join("\n\n").trim();
  return md.length > MAX_BODY_CHARS ? `${md.slice(0, MAX_BODY_CHARS).trimEnd()}

_…cut short: GitHub release bodies are limited in size._` : md;
}
var START_MARKER = "<!-- logpulse-release-notes:start -->";
var END_MARKER = "<!-- logpulse-release-notes:end -->";
var wrapNotes = (notes) => `${START_MARKER}
${notes.trim()}
${END_MARKER}`;
function mergeBody(existing, notes, mode) {
  const body = (existing ?? "").replace(/\r\n?/g, "\n");
  const block = wrapNotes(notes);
  if (mode === "replace") return block;
  const start = body.indexOf(START_MARKER);
  const end = start >= 0 ? body.indexOf(END_MARKER, start) : -1;
  if (start >= 0 && end > start) return body.slice(0, start) + block + body.slice(end + END_MARKER.length);
  if (!body.trim()) return block;
  if (mode === "keep") return null;
  return mode === "append" ? `${body.trimEnd()}

${block}` : `${block}

${body.trimStart()}`;
}

// src/toolkit.ts
var import_node_crypto = require("node:crypto");
var import_node_fs = require("node:fs");
var import_node_os = require("node:os");
function getInput(name, env = process.env) {
  return (env[`INPUT_${name.replace(/ /g, "_").toUpperCase()}`] ?? "").trim();
}
var TRUE = ["true", "True", "TRUE"];
var FALSE = ["false", "False", "FALSE"];
function getBooleanInput(name, fallback, env = process.env) {
  const raw = getInput(name, env);
  if (!raw) return fallback;
  if (TRUE.includes(raw)) return true;
  if (FALSE.includes(raw)) return false;
  throw new Error(`Input "${name}" must be true or false, not "${raw}".`);
}
function getChoiceInput(name, choices, fallback, env = process.env) {
  const raw = getInput(name, env).toLowerCase();
  if (!raw) return fallback;
  const hit = choices.find((c) => c === raw);
  if (!hit) throw new Error(`Input "${name}" must be one of ${choices.join(", ")}, not "${raw}".`);
  return hit;
}
function getIntegerInput(name, fallback, range, env = process.env) {
  const raw = getInput(name, env);
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`Input "${name}" must be a whole number, not "${raw}".`);
  const n = Number(raw);
  if (n < range.min || n > range.max) throw new Error(`Input "${name}" must be between ${range.min} and ${range.max}.`);
  return n;
}
function getListInput(name, fallback, env = process.env) {
  const raw = getInput(name, env);
  if (!raw) return fallback;
  if (raw === "-" || raw.toLowerCase() === "none") return [];
  return raw.split(/[\n,]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
}
function escapeData(s) {
  return s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}
function escapeProperty(s) {
  return escapeData(s).replace(/:/g, "%3A").replace(/,/g, "%2C");
}
function formatCommand(command, message, props = {}) {
  const entries = Object.entries(props).filter(([, v]) => v !== void 0 && v !== "");
  const params = entries.length ? ` ${entries.map(([k, v]) => `${k}=${escapeProperty(String(v))}`).join(",")}` : "";
  return `::${command}${params}::${escapeData(message)}`;
}
var write = (line) => process.stdout.write(line + import_node_os.EOL);
var log = {
  info: (message) => write(message),
  debug: (message) => write(formatCommand("debug", message)),
  notice: (message, props) => write(formatCommand("notice", message, props)),
  warning: (message, props) => write(formatCommand("warning", message, props)),
  error: (message, props) => write(formatCommand("error", message, props)),
  group: (title) => write(`::group::${escapeData(title)}`),
  endGroup: () => write("::endgroup::")
};
function formatOutput(name, value, delimiter = `ghadelimiter_${(0, import_node_crypto.randomUUID)()}`) {
  if (name.includes(delimiter) || value.includes(delimiter)) throw new Error(`Output "${name}" contains its own delimiter.`);
  return `${name}<<${delimiter}${import_node_os.EOL}${value}${import_node_os.EOL}${delimiter}${import_node_os.EOL}`;
}
function setOutput(name, value, env = process.env) {
  const file = env["GITHUB_OUTPUT"];
  if (!file) {
    log.debug(`output ${name}=${String(value).slice(0, 200)}`);
    return;
  }
  (0, import_node_fs.appendFileSync)(file, formatOutput(name, String(value)), "utf8");
}
function appendSummary(markdown, env = process.env) {
  const file = env["GITHUB_STEP_SUMMARY"];
  if (!file) return false;
  (0, import_node_fs.appendFileSync)(file, markdown.endsWith("\n") ? markdown : markdown + import_node_os.EOL, "utf8");
  return true;
}

// src/versions.ts
var TRAILING_VERSION = /(\d+(?:\.\d+){1,3}(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?(?:\+[0-9A-Za-z.-]+)?)$/;
function versionFromTag(tag) {
  const t = tag.trim();
  if (!t) return null;
  const v = findVersion(t) ?? TRAILING_VERSION.exec(t)?.[1] ?? null;
  return v ? v.replace(/^[vV](?=\d)/, "") : null;
}
function tagPrefix(tag) {
  const v = versionFromTag(tag);
  if (!v) return null;
  const at = tag.lastIndexOf(v);
  if (at < 0) return null;
  return tag.slice(0, at);
}
var isPrerelease = (version) => /-/.test(version.split("+")[0]);
var norm = (v) => v.trim().replace(/^[vV](?=\d)/, "").toLowerCase();
function findRelease(changelog, version) {
  const want = norm(version);
  const versioned = changelog.releases.filter((r) => !!r.version);
  return versioned.find((r) => norm(r.version) === want) ?? versioned.find((r) => compareVersions(r.version, version) === 0) ?? null;
}
var isShortVersion = (version) => version.split(/[-+]/)[0].split(".").length < 3;
function floatingTags(tags, commits) {
  const fullCommits = /* @__PURE__ */ new Set();
  for (const tag of tags) {
    const v = versionFromTag(tag);
    const sha = commits?.get(tag);
    if (v && sha && !isShortVersion(v)) fullCommits.add(sha);
  }
  const out = /* @__PURE__ */ new Set();
  for (const tag of tags) {
    const v = versionFromTag(tag);
    if (!v || !isShortVersion(v)) continue;
    const sha = commits?.get(tag);
    if (!sha || fullCommits.has(sha)) out.add(tag);
  }
  return out;
}
function previousTag(current, tags, opts = {}) {
  const version = versionFromTag(current);
  if (!version) return null;
  const prefix = tagPrefix(current)?.toLowerCase() ?? "";
  const stable = !isPrerelease(version);
  const head = opts.head ?? opts.commits?.get(current) ?? null;
  const floating = floatingTags(tags, opts.commits);
  let best = null;
  let bestFloating = null;
  for (const tag of tags) {
    if (tag === current) continue;
    const v = versionFromTag(tag);
    if (!v || (tagPrefix(tag)?.toLowerCase() ?? "") !== prefix) continue;
    if (stable && isPrerelease(v)) continue;
    if (compareVersions(v, version) >= 0) continue;
    if (head && opts.commits?.get(tag) === head) continue;
    if (floating.has(tag)) {
      if (!bestFloating || compareVersions(v, bestFloating.version) > 0) bestFloating = { tag, version: v };
    } else if (!best || compareVersions(v, best.version) > 0 || compareVersions(v, best.version) === 0 && isShortVersion(best.version) && !isShortVersion(v)) {
      best = { tag, version: v };
    }
  }
  return (best ?? bestFloating)?.tag ?? null;
}
function latestTag(tags, commits) {
  const floating = floatingTags(tags, commits);
  const versioned = tags.map((tag) => ({ tag, version: versionFromTag(tag) })).filter((t) => !!t.version);
  const full = versioned.filter((t) => !floating.has(t.tag));
  const pool = full.length ? full : versioned;
  const pick = (list) => list.reduce((best, t) => !best || compareVersions(t.version, best.version) > 0 || compareVersions(t.version, best.version) === 0 && isShortVersion(best.version) && !isShortVersion(t.version) ? t : best, null);
  return (pick(pool.filter((t) => !isPrerelease(t.version))) ?? pick(pool))?.tag ?? null;
}
function tagForVersion(version, tags) {
  const want = norm(version);
  const hits = tags.filter((t) => {
    const v = versionFromTag(t);
    return v !== null && norm(v) === want;
  });
  return hits.find((t) => t === `v${version}`) ?? hits.find((t) => t === version) ?? hits[0] ?? null;
}

// src/run.ts
var SOURCES = ["auto", "changelog", "commits"];
var STYLES = ["clean", "original"];
var BODY_MODES = ["replace", "append", "prepend", "keep"];
function readInputs(env = process.env) {
  return {
    token: getInput("github-token", env),
    tag: getInput("tag", env).replace(/^refs\/tags\//, ""),
    version: getInput("version", env).replace(/^[vV](?=\d)/, ""),
    changelogPath: getInput("changelog-path", env) || "CHANGELOG.md",
    source: getChoiceInput("source", SOURCES, "auto", env),
    previousTag: getInput("previous-tag", env).replace(/^refs\/tags\//, ""),
    excludeTypes: getListInput("exclude-types", DEFAULT_EXCLUDED_TYPES, env),
    maxCommits: getIntegerInput("max-commits", 250, { min: 1, max: 1e3 }, env),
    style: getChoiceInput("style", STYLES, "clean", env),
    updateRelease: getBooleanInput("update-release", true, env),
    createRelease: getBooleanInput("create-release", true, env),
    bodyMode: getChoiceInput("body-mode", BODY_MODES, "replace", env),
    summary: getBooleanInput("summary", true, env),
    compareLink: getBooleanInput("compare-link", true, env)
  };
}
function readContext(env = process.env) {
  const [owner = "", repo = ""] = (env["GITHUB_REPOSITORY"] ?? "").split("/");
  if (!owner || !repo) throw new Error("GITHUB_REPOSITORY isn't set. This Action runs inside a GitHub Actions workflow.");
  const eventName = env["GITHUB_EVENT_NAME"] ?? "";
  let eventRelease = null;
  const eventPath = env["GITHUB_EVENT_PATH"];
  if (eventName === "release" && eventPath && (0, import_node_fs2.existsSync)(eventPath)) {
    try {
      const payload = JSON.parse((0, import_node_fs2.readFileSync)(eventPath, "utf8"));
      eventRelease = payload.release ?? null;
    } catch {
      log.warning("Couldn't read the release event payload; looking the release up by tag instead.");
    }
  }
  return {
    eventName,
    eventRelease,
    owner,
    repo,
    ref: env["GITHUB_REF"] ?? "",
    sha: env["GITHUB_SHA"] ?? "",
    serverUrl: (env["GITHUB_SERVER_URL"] || "https://github.com").replace(/\/+$/, ""),
    apiUrl: env["GITHUB_API_URL"] || "https://api.github.com",
    workspace: env["GITHUB_WORKSPACE"] || process.cwd(),
    tempDir: env["RUNNER_TEMP"] || (0, import_node_os2.tmpdir)()
  };
}
async function run(env = process.env, deps = {}) {
  const inputs = readInputs(env);
  const ctx = readContext(env);
  const warnings = [];
  const warn = (message) => {
    warnings.push(message);
    log.warning(message);
  };
  const gh = new GitHub(inputs.token, ctx.apiUrl, ctx.owner, ctx.repo, deps.fetch);
  const git = new LocalGit(ctx.workspace);
  const gitOk = git.usable();
  log.debug(gitOk ? "Using the local git history." : "No full local history; using the GitHub API for tags and commits.");
  let tagCache = null;
  const tagList = async () => {
    if (tagCache) return tagCache;
    try {
      if (gitOk) tagCache = { names: git.tags(), commits: git.tagCommits() };
      else {
        const listed = await gh.listTags();
        tagCache = { names: listed.map((t) => t.name), commits: new Map(listed.flatMap((t) => t.sha ? [[t.name, t.sha]] : [])) };
      }
    } catch (e) {
      warn(`Couldn't list tags (${e.message}).`);
      tagCache = { names: [], commits: /* @__PURE__ */ new Map() };
    }
    return tagCache;
  };
  const tags = async () => (await tagList()).names;
  const eventTag = ctx.eventName === "release" ? ctx.eventRelease?.tag_name ?? null : null;
  const refTag = ctx.ref.startsWith("refs/tags/") ? ctx.ref.slice("refs/tags/".length) : null;
  let tag = inputs.tag || eventTag || refTag;
  let version = inputs.version || (tag ? versionFromTag(tag) : null);
  let changelog = null;
  const changelogLabel = inputs.changelogPath;
  if (inputs.source !== "commits") {
    const text = await readChangelog(inputs.changelogPath, ctx, gh, tag, warn);
    if (text !== null) {
      try {
        changelog = convertMarkdownChangelog(text, {
          source: { kind: "github_file", url: `${ctx.serverUrl}/${ctx.owner}/${ctx.repo}/blob/${encodeURIComponent(tag ?? ctx.sha)}/${inputs.changelogPath.replace(/^\.?\//, "")}` }
        });
        for (const w of changelog.warnings) log.info(`${changelogLabel}: ${w}`);
      } catch (e) {
        if (!(e instanceof ConvertError)) throw e;
        warn(`${changelogLabel}: ${e.message}`);
      }
    } else if (inputs.source === "changelog") {
      throw new Error(`${changelogLabel} wasn't found. Check out the repository first (actions/checkout) or set changelog-path.`);
    } else {
      log.info(`No ${changelogLabel} found; using commits.`);
    }
  }
  if (!tag && !version) {
    if (changelog?.latest_version) {
      version = changelog.latest_version;
      tag = tagForVersion(version, await tags());
      if (!tag) log.notice(`Version ${version} from ${changelogLabel} has no tag yet, so no GitHub release is touched. The notes are in the outputs and job summary.`);
    } else {
      const listed = await tagList();
      tag = latestTag(listed.names, listed.commits);
      version = tag ? versionFromTag(tag) : null;
    }
  } else if (!tag && version) {
    tag = tagForVersion(version, await tags());
  }
  if (!tag && !version) {
    throw new Error("There's no tag to write notes for. Run this on a release or a tag push, or pass the tag input.");
  }
  if (tag && !version) warn(`Tag ${tag} doesn't contain a version number. Pass the version input to match a ${changelogLabel} section.`);
  log.info(`Tag: ${tag ?? "(none yet)"}${version ? ` · version ${version}` : ""}`);
  let release = null;
  let source = "changelog";
  if (changelog && version) {
    const section = findRelease(changelog, version);
    if (section && hasContent(section)) {
      release = section;
      log.info(`Notes from ${changelogLabel}, section ${section.version}.`);
    } else if (section) {
      warn(`${changelogLabel} has a ${section.version} section, but it has no entries.`);
    } else {
      const known = changelog.releases.map((r) => r.version).filter(Boolean).slice(0, 5).join(", ");
      const hint = changelog.unreleased ? ` It has an "Unreleased" section: rename it to "## [${version}] - YYYY-MM-DD" before tagging.` : "";
      warn(`${changelogLabel} has no section for ${version}${known ? ` (newest: ${known})` : ""}.${hint}`);
    }
  }
  if (!release && inputs.source === "changelog") {
    throw new Error(`No usable ${changelogLabel} section for ${version ?? tag}. Add one, or set source: auto to fall back to commits.`);
  }
  let prevTag = inputs.previousTag || null;
  const needPrev = !release || inputs.compareLink;
  if (!prevTag && needPrev) {
    const { names: all, commits } = await tagList();
    prevTag = tag ? previousTag(tag, all, { commits }) : version ? previousTag(`v${version}`, all, { commits, head: ctx.sha || null }) : null;
    if (!prevTag && tag && !versionFromTag(tag) && gitOk) prevTag = git.tagBefore(tag);
  }
  const repoUrl = `${ctx.serverUrl}/${ctx.owner}/${ctx.repo}`;
  const head = tag ?? ctx.sha;
  const compareUrl = inputs.compareLink && tag ? prevTag ? `${repoUrl}/compare/${encodeURIComponent(prevTag)}...${encodeURIComponent(tag)}` : `${repoUrl}/commits/${encodeURIComponent(tag)}` : null;
  if (!release) {
    source = "commits";
    if (!head) throw new Error("No tag or commit to read history from.");
    const { commits, total } = await readCommits(head, prevTag, inputs.maxCommits, git, gitOk, gh);
    const built = releaseFromCommits(commits, { version, tag, date: commits[0]?.date ?? null, url: compareUrl, prerelease: version ? isPrerelease(version) : false }, inputs.excludeTypes);
    release = built.release;
    log.info(`Notes from ${built.used} of ${commits.length} commits ${prevTag ? `since ${prevTag}` : "(no earlier tag found)"}.`);
    if (total > commits.length) warn(`Only the newest ${commits.length} of ${total} commits were read (max-commits).`);
    if (commits.length === 0) warn(`No commits found ${prevTag ? `between ${prevTag} and ${head}` : `up to ${head}`}.`);
    else if (built.used === 0) warn(`None of the ${commits.length} commits look user-facing (types skipped: ${inputs.excludeTypes.join(", ") || "none"}).`);
  }
  const style = source === "commits" ? "clean" : inputs.style;
  const notes = renderReleaseNotes(notesRelease(release, source), {
    style,
    headingLevel: 2,
    compareUrl,
    capitalize: source === "commits"
  });
  const notesFile = writeNotesFile(ctx.tempDir, tag ?? version ?? "release", notes);
  log.group(`Release notes for ${tag ?? version}`);
  log.info(notes);
  log.endGroup();
  const counts = { breaking: release.breaking_changes.length, deprecations: release.deprecations.length };
  setOutput("notes", notes, env);
  setOutput("notes-file", notesFile, env);
  setOutput("json", JSON.stringify(release), env);
  setOutput("source", source, env);
  setOutput("tag", tag ?? "", env);
  setOutput("version", version ?? "", env);
  setOutput("previous-tag", prevTag ?? "", env);
  setOutput("has-breaking-changes", counts.breaking > 0, env);
  setOutput("breaking-change-count", counts.breaking, env);
  setOutput("deprecation-count", counts.deprecations, env);
  let releaseAction = "skipped";
  let target = null;
  if (!inputs.updateRelease) {
    log.info("update-release is off; the release body is left alone.");
  } else if (!tag) {
  } else {
    if (!inputs.token) throw new Error("No github-token, so the release can't be updated. Leave github-token at its default or set update-release: false.");
    const fromEvent = ctx.eventRelease?.id && ctx.eventRelease.tag_name === tag ? await gh.getRelease(ctx.eventRelease.id) : null;
    const existing = fromEvent ?? await gh.findRelease(tag);
    if (existing) {
      const body = mergeBody(existing.body, notes, inputs.bodyMode);
      if (body === null) {
        releaseAction = "unchanged";
        target = existing;
        log.notice(`Release ${tag} already has text and body-mode is keep, so it was left as it is.`);
      } else if (body === (existing.body ?? "").replace(/\r\n?/g, "\n")) {
        releaseAction = "unchanged";
        target = existing;
        log.info(`Release ${tag} already has these notes.`);
      } else {
        target = await gh.updateRelease(existing.id, { body });
        releaseAction = "updated";
        log.info(`Updated release ${tag}: ${target.html_url}`);
      }
    } else if (!inputs.createRelease) {
      log.notice(`There's no GitHub release for ${tag}. Set create-release: true to create one.`);
    } else if (!await tagExists(tag, ctx, git, gitOk, tags)) {
      warn(`Tag ${tag} doesn't exist in the repository, so no release was created (that would create the tag on the default branch).`);
    } else {
      const title = release.title && !/^Version /.test(release.title) && release.title !== tag ? `${tag}: ${release.title}` : tag;
      target = await gh.createRelease({ tag_name: tag, name: title, body: wrapNotes(notes), draft: false, prerelease: version ? isPrerelease(version) : false });
      releaseAction = "created";
      log.info(`Created release ${tag}: ${target.html_url}`);
    }
  }
  setOutput("release-id", target?.id ?? "", env);
  setOutput("release-url", target?.html_url ?? "", env);
  setOutput("release-action", releaseAction, env);
  const result = {
    notes,
    style,
    release,
    source,
    tag,
    version,
    previousTag: prevTag,
    notesFile,
    releaseAction,
    releaseUrl: target?.html_url ?? null,
    releaseId: target?.id ?? null,
    warnings
  };
  if (inputs.summary) appendSummary(renderSummary(result, changelogLabel, compareUrl), env);
  return result;
}
async function readChangelog(path, ctx, gh, tag, warn) {
  const local = (0, import_node_path.isAbsolute)(path) ? path : (0, import_node_path.resolve)(ctx.workspace, path);
  if (!(0, import_node_path.isAbsolute)(path) && (0, import_node_path.relative)(ctx.workspace, local).startsWith("..")) throw new Error(`changelog-path must stay inside the repository (got ${path}).`);
  if ((0, import_node_fs2.existsSync)(local) && (0, import_node_fs2.statSync)(local).isFile()) {
    const size = (0, import_node_fs2.statSync)(local).size;
    if (size > CONVERT_LIMITS.maxInputChars * 4) throw new Error(`${path} is ${(size / 1e6).toFixed(1)} MB; the limit is about 1 MB.`);
    return (0, import_node_fs2.readFileSync)(local, "utf8");
  }
  const ref = tag ?? ctx.sha;
  if (!ref) return null;
  try {
    return await gh.fileAt(path, ref);
  } catch (e) {
    warn(`Couldn't read ${path} from GitHub (${e.message}).`);
    return null;
  }
}
async function readCommits(head, prev, max, git, gitOk, gh) {
  if (gitOk && git.resolves(head) && (!prev || git.resolves(prev))) {
    const commits = git.commits(prev, head, max);
    return { commits, total: git.count(prev, head) ?? commits.length };
  }
  if (prev) {
    const range = await gh.compare(prev, head);
    const all2 = releaseCommits(range.commits);
    return { commits: all2.slice(0, max), total: range.complete ? all2.length : Math.max(all2.length, range.total) };
  }
  const all = releaseCommits(await gh.listCommits(head, (soFar) => releaseCommits(soFar).length > max));
  return { commits: all.slice(0, max), total: all.length };
}
async function tagExists(tag, ctx, git, gitOk, tags) {
  if (ctx.ref === `refs/tags/${tag}`) return true;
  if (gitOk && git.resolves(`refs/tags/${tag}`)) return true;
  return (await tags()).includes(tag);
}
function writeNotesFile(dir, label, notes) {
  (0, import_node_fs2.mkdirSync)(dir, { recursive: true });
  const file = (0, import_node_path.join)(dir, `release-notes-${label.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 80)}.md`);
  (0, import_node_fs2.writeFileSync)(file, notes + "\n", "utf8");
  return file;
}
var notesRelease = (release, source) => source === "commits" ? { ...release, summary: null } : release;
var plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
function renderSummary(r, changelogLabel, compareUrl) {
  const from = r.source === "changelog" ? `\`${changelogLabel}\`, section ${r.release.version}` : `commits ${r.previousTag ? `since \`${r.previousTag}\`` : "(no earlier tag)"}`;
  const releaseLine = r.releaseAction === "updated" ? `[Release updated](${r.releaseUrl})` : r.releaseAction === "created" ? `[Release created](${r.releaseUrl})` : r.releaseAction === "unchanged" ? `[Release unchanged](${r.releaseUrl})` : "Release not touched";
  const facts = [`From ${from}`, plural(r.release.breaking_changes.length, "breaking change"), plural(r.release.deprecations.length, "deprecation"), releaseLine];
  const lines = [`### Release notes for ${r.tag ?? r.version}`, "", facts.join(" · "), ""];
  if (r.warnings.length) lines.push(...r.warnings.map((w) => `> ⚠️ ${w}`), "");
  lines.push(
    "---",
    "",
    renderReleaseNotes(notesRelease(r.release, r.source), { style: r.style, headingLevel: 4, compareUrl, capitalize: r.source === "commits" }),
    ""
  );
  return lines.join("\n");
}

// src/main.ts
run().catch((e) => {
  log.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
