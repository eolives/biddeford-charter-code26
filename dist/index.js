#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { searchCorpus, getSection, listTitles, getTitle, getVersions, } from "./corpus.js";
const CAVEAT = "For informational purposes only. Not legal advice. Verify against the official source at https://ecode360.com/BI3074 before relying on any result.";
const FOOTER = `
---
⚠️ **This information is for research and informational purposes only and does not constitute legal advice.** City ordinances, the Charter, and land use regulations are amended over time — always verify the current text at https://ecode360.com/BI3074 before acting on any information. For legal, permitting, or zoning matters, consult a licensed attorney or the City of Biddeford directly.

**Data quality note:** The Charter corpus was hand-transcribed and every displaced sub-list manually traced and reattached (see each section's "reassembled" note in data/source/charter.json). The Code of Ordinances and Land Development Regulations corpora — over 1,000 pages combined — were parsed **automatically** and were not hand-verified section by section; the parser strips repeated page headers and splits on citation markers, occasionally missing a heading boundary or leaving a stray fragment on a "(Reserved)" placeholder section. Run \`get_version\` to see each corpus's data-quality status and when it was indexed, and cross-check anything load-bearing — especially setbacks, fees, deadlines, and permitting requirements — against the live source.

Adapted from BetaNYC's nyc-charter-laws-rules (https://github.com/BetaNYC/nyc-charter-laws-rules). Not affiliated with the City of Biddeford, General Code, or eCode360.`.trim();
function withFooter(text) {
    return `${text}\n\n${FOOTER}`;
}
const CORPUS_ENUM = ["charter", "ordinances", "land_dev"];
const CORPUS_LABELS = {
    charter: "City Charter",
    ordinances: "Code of Ordinances",
    land_dev: "Land Development Regulations",
};
const server = new Server({
    name: "biddeford-charter-code",
    version: "0.2.0",
}, {
    capabilities: { tools: {} },
});
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: "search",
            description: `Search the City of Biddeford, ME municipal code by keyword or phrase, across the City Charter, Code of Ordinances, and/or Land Development Regulations (zoning/subdivision/shoreland code). Results are relevance-ranked: heading matches rank above citation matches, which rank above body-text matches, and whole-word matches rank above substring matches. ${CAVEAT}`,
            inputSchema: {
                type: "object",
                properties: {
                    query: { type: "string", description: "Search term or phrase" },
                    corpus: {
                        type: "string",
                        enum: [...CORPUS_ENUM, "all"],
                        description: "Which document to search: 'charter', 'ordinances', 'land_dev', or 'all' (default: all)",
                    },
                    limit: {
                        type: "number",
                        description: "Max results to return (default 10, max 50)",
                    },
                },
                required: ["query"],
            },
        },
        {
            name: "get_section",
            description: `Retrieve a specific section by its citation. Citation formats vary by document: Charter uses 'Art. II, Sec. 4'; Code of Ordinances uses 'Sec. 18-1' (chapter-dash-section) or 'Ch. 18' for a whole chapter; Land Development Regulations uses 'App. A, Sec. A-1' (Rules of City Council) or 'LDR Art. VI, Sec. 7' (zoning). Natural-language forms are also accepted ('Article 2 Section 4', 'Chapter 18', 'Appendix A'). If multiple sections match (e.g. a bare heading search), a disambiguation list is returned. ${CAVEAT}`,
            inputSchema: {
                type: "object",
                properties: {
                    citation: { type: "string", description: "Section citation or heading" },
                    corpus: {
                        type: "string",
                        enum: CORPUS_ENUM,
                        description: "Which document to look in (searches all three if omitted)",
                    },
                },
                required: ["citation"],
            },
        },
        {
            name: "list_titles",
            description: `List the top-level divisions of a document: the 12 Articles of the Charter, the 23 Chapters of the Code of Ordinances, or Appendix A + the 15 Articles of the Land Development Regulations. ${CAVEAT}`,
            inputSchema: {
                type: "object",
                properties: {
                    corpus: {
                        type: "string",
                        enum: CORPUS_ENUM,
                        description: "Which document to list",
                    },
                },
                required: ["corpus"],
            },
        },
        {
            name: "get_title",
            description: `Retrieve the full contents of a top-level division — every section within it — by identifier (e.g. 'Art. II' for the Charter, 'Ch. 18' for Ordinances, 'App. A' or 'LDR Art. VI' for Land Development Regulations). Returns the complete text, not just a heading stub. ${CAVEAT}`,
            inputSchema: {
                type: "object",
                properties: {
                    corpus: {
                        type: "string",
                        enum: CORPUS_ENUM,
                        description: "Which document",
                    },
                    title: {
                        type: "string",
                        description: "Division identifier (e.g. 'Art. II', 'Ch. 18', 'LDR Art. VI')",
                    },
                },
                required: ["corpus", "title"],
            },
        },
        {
            name: "get_version",
            description: `Return the currency/data-quality status for each of the three corpora (Charter, Code of Ordinances, Land Development Regulations) — when each was indexed, from what source, and whether it was hand-verified or automatically parsed. Always call this tool before answering legal questions so responses are grounded in a known-dated, known-quality version. ${CAVEAT}`,
            inputSchema: { type: "object", properties: {} },
        },
    ],
}));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        switch (name) {
            case "search": {
                const { query, corpus, limit } = z
                    .object({
                    query: z.string(),
                    corpus: z.enum([...CORPUS_ENUM, "all"]).optional(),
                    limit: z.number().int().min(1).max(50).optional(),
                })
                    .parse(args);
                const results = searchCorpus(query, corpus ?? "all", limit ?? 10);
                if (results.length === 0) {
                    return { content: [{ type: "text", text: withFooter(`No results found for "${query}".`) }] };
                }
                const text = results
                    .map((s) => `[${CORPUS_LABELS[s.corpus]}] ${s.citation} — ${s.heading}\n${s.text.slice(0, 400)}${s.text.length > 400 ? "…" : ""}`)
                    .join("\n\n---\n\n");
                return { content: [{ type: "text", text: withFooter(text) }] };
            }
            case "get_section": {
                const { citation, corpus } = z
                    .object({
                    citation: z.string(),
                    corpus: z.enum(CORPUS_ENUM).optional(),
                })
                    .parse(args);
                const result = getSection(citation, corpus);
                if (result.kind === "none") {
                    return { content: [{ type: "text", text: withFooter(`Section not found: "${citation}".`) }] };
                }
                if (result.kind === "ambiguous") {
                    const list = result.candidates
                        .map((s) => `[${CORPUS_LABELS[s.corpus]}] ${s.citation} — ${s.heading}`)
                        .join("\n");
                    return {
                        content: [
                            {
                                type: "text",
                                text: withFooter(`Multiple sections match "${citation}". Re-run get_section with a more specific citation (and a corpus, if searching across documents):\n\n${list}`),
                            },
                        ],
                    };
                }
                const section = result.section;
                const text = `[${CORPUS_LABELS[section.corpus]}] ${section.citation}\n${section.heading}\n\n${section.text}`;
                return { content: [{ type: "text", text: withFooter(text) }] };
            }
            case "list_titles": {
                const { corpus } = z.object({ corpus: z.enum(CORPUS_ENUM) }).parse(args);
                const titles = listTitles(corpus);
                if (titles.length === 0) {
                    return { content: [{ type: "text", text: withFooter(`No titles found for ${corpus}.`) }] };
                }
                const text = titles.map((t) => `${t.citation} — ${t.heading}`).join("\n");
                return { content: [{ type: "text", text: withFooter(text) }] };
            }
            case "get_title": {
                const { corpus, title } = z
                    .object({
                    corpus: z.enum(CORPUS_ENUM),
                    title: z.string(),
                })
                    .parse(args);
                const sections = getTitle(corpus, title);
                if (sections.length === 0) {
                    return { content: [{ type: "text", text: withFooter(`No sections found for "${title}" in ${corpus}.`) }] };
                }
                const text = sections
                    .map((s) => (s.text ? `${s.citation} — ${s.heading}\n\n${s.text}` : `${s.citation} — ${s.heading}`))
                    .join("\n\n---\n\n");
                return { content: [{ type: "text", text: withFooter(text) }] };
            }
            case "get_version": {
                const versions = getVersions();
                const text = CORPUS_ENUM.map((c) => {
                    const v = versions[c];
                    return `${CORPUS_LABELS[c]}: ${v?.currentThrough ?? "unknown"} — ${v?.sectionCount ?? 0} sections, ${v?.dataQuality ?? "unknown"} (indexed ${v?.indexedAt ?? "unknown"})`;
                }).join("\n");
                return { content: [{ type: "text", text: withFooter(text) }] };
            }
            default:
                return {
                    content: [{ type: "text", text: `Unknown tool: ${name}` }],
                    isError: true,
                };
        }
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
    }
});
const transport = new StdioServerTransport();
await server.connect(transport);
//# sourceMappingURL=index.js.map