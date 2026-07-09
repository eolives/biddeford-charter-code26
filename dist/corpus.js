import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX_DIR = join(__dirname, "..", "data", "index", "json");
const ALL_CORPORA = ["charter"];
// Lazy-loaded per-corpus index.
const cache = {};
let versionsCache = null;
function loadCorpus(corpus) {
    if (cache[corpus])
        return cache[corpus];
    const path = join(INDEX_DIR, `${corpus}.json`);
    if (!existsSync(path)) {
        throw new Error(`Index for "${corpus}" not found. Run: npm run build-index`);
    }
    cache[corpus] = JSON.parse(readFileSync(path, "utf8"));
    return cache[corpus];
}
function loadVersions() {
    if (versionsCache)
        return versionsCache;
    const path = join(INDEX_DIR, "versions.json");
    if (!existsSync(path)) {
        throw new Error("Version index not found. Run: npm run build-index");
    }
    versionsCache = JSON.parse(readFileSync(path, "utf8"));
    return versionsCache;
}
export function getVersions() {
    return loadVersions();
}
function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
// Relevance-ranked search. Scoring: heading match > citation match > body
// match; whole-word > substring. Same algorithm as nyc-charter-laws-rules.
export function searchCorpus(query, corpus = "all", limit = 10) {
    const corpora = corpus === "all" ? ALL_CORPORA : [corpus];
    const q = query.toLowerCase();
    const wordRe = new RegExp(`\\b${escapeRegExp(q)}\\b`, "i");
    const scored = [];
    for (const c of corpora) {
        const sections = loadCorpus(c);
        for (const s of sections) {
            const inHeading = s.heading.toLowerCase().includes(q);
            const inCitation = s.citation.toLowerCase().includes(q);
            const inText = s.text.toLowerCase().includes(q);
            if (!inHeading && !inCitation && !inText)
                continue;
            let score = 0;
            if (inHeading)
                score += 100 + (wordRe.test(s.heading) ? 30 : 0);
            if (inCitation)
                score += 50 + (wordRe.test(s.citation) ? 15 : 0);
            if (inText)
                score += 10 + (wordRe.test(s.text) ? 5 : 0);
            scored.push({ s, score });
        }
    }
    scored.sort((a, b) => b.score - a.score); // Array.sort is stable
    return scored.slice(0, limit).map((r) => r.s);
}
const ARABIC_TO_ROMAN = [
    [12, "xii"], [11, "xi"], [10, "x"], [9, "ix"], [8, "viii"], [7, "vii"],
    [6, "vi"], [5, "v"], [4, "iv"], [3, "iii"], [2, "ii"], [1, "i"],
];
// Normalize a citation for comparison: strip "Art."/"Sec."/"§" prefixes,
// lowercase, collapse whitespace, and convert an arabic article number to
// its roman-numeral form. Biddeford's charter cites Articles in roman
// numerals ("Art. II, Sec. 4") but people will type "Article 2 Section 4",
// "Art II Sec 4", "2-4", "Sec. 4" (ambiguous across articles), etc.
export function normalizeCitation(input) {
    let s = input
        .toLowerCase()
        .replace(/§§?\s*/g, "")
        .replace(/\barticle\b\.?/g, "art")
        .replace(/\bsection\b\.?/g, "sec")
        .replace(/\bart\.?\s*/g, "art ")
        .replace(/\bsec\.?\s*/g, "sec ")
        .replace(/,/g, "")
        .replace(/\s+/g, " ")
        .trim();
    // "art 2 sec 4" -> "art ii sec 4" (only converts a plain arabic numeral
    // immediately after "art "; already-roman input like "art ii" is untouched
    // since \d+ won't match letters).
    s = s.replace(/^art (\d+)\b/, (_, num) => {
        const n = parseInt(num, 10);
        const roman = ARABIC_TO_ROMAN.find(([v]) => v === n)?.[1];
        return roman ? `art ${roman}` : `art ${num}`;
    });
    return s;
}
// Exact-citation lookup with normalization and disambiguation.
// - Input is normalized (Art./Article, Sec./Section, "§", case, punctuation).
// - Exact citation matches are preferred over heading substring matches.
// - If `corpus` is given, only that corpus is consulted (today there's only
//   one corpus, but this keeps parity with nyc-charter-laws-rules' API shape
//   so it's a drop-in fit if you add ordinances/land-dev corpora later).
// - If multiple sections tie, a disambiguation list is returned instead of
//   silently picking the first hit.
export function getSection(citation, corpus) {
    const corpora = corpus ? [corpus] : ALL_CORPORA;
    const q = normalizeCitation(citation);
    if (!q)
        return { kind: "none" };
    // Pass 1: exact (normalized) citation match across the corpora in scope.
    const exact = [];
    for (const c of corpora) {
        for (const s of loadCorpus(c)) {
            if (normalizeCitation(s.citation) === q)
                exact.push(s);
        }
    }
    if (exact.length === 1)
        return { kind: "match", section: exact[0] };
    if (exact.length > 1)
        return { kind: "ambiguous", candidates: exact };
    // Pass 2: heading substring fallback (e.g. "City Clerk" or "Veto power").
    const raw = citation.toLowerCase().trim();
    const loose = [];
    for (const c of corpora) {
        for (const s of loadCorpus(c)) {
            if (s.heading.toLowerCase().includes(raw)) {
                loose.push(s);
                if (loose.length > 10)
                    break; // cap the disambiguation list
            }
        }
    }
    if (loose.length === 1)
        return { kind: "match", section: loose[0] };
    if (loose.length > 1)
        return { kind: "ambiguous", candidates: loose };
    return { kind: "none" };
}
export function listTitles(corpus) {
    const sections = loadCorpus(corpus);
    return sections
        .filter((s) => s.heading.toLowerCase().startsWith("article"))
        .map(({ citation, heading }) => ({ citation, heading }));
}
// Whole-token prefix match on an Article identifier: "Art. II" matches every
// section within Article II (both the divider record and its Sec. N
// entries), keyed off the citation prefix "Art. II" / "Art. II, Sec. ...".
// Unlike nyc-charter-laws-rules (whose index is flat with no deep hierarchy),
// this corpus IS fully hierarchical — every section belongs to exactly one
// article record — so get_title returns the complete article, not just a
// chapter-level stub.
export function getTitle(corpus, title) {
    const sections = loadCorpus(corpus);
    const q = title.trim();
    if (!q)
        return [];
    const normQ = normalizeCitation(q);
    return sections.filter((s) => {
        const normCitation = normalizeCitation(s.citation);
        return normCitation === normQ || normCitation.startsWith(`${normQ} sec`);
    });
}
//# sourceMappingURL=corpus.js.map