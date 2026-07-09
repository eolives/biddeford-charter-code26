#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  searchCorpus,
  getSection,
  listTitles,
  getTitle,
  getVersions,
} from "./corpus.js";

const CAVEAT =
  "For informational purposes only. Not legal advice. Verify against the official source at https://ecode360.com/BI3074 before relying on any result.";

const FOOTER = `
---
⚠️ **This information is for research and informational purposes only and does not constitute legal advice.** City charters are amended by referendum from time to time — always verify the current text at https://ecode360.com/BI3074 before acting on any information. For legal matters, consult a licensed attorney.

**Data quality note:** This corpus was hand-transcribed from a PDF export of the charter (eCode360 / General Code), not pulled from a live feed — eCode360 does not offer a public bulk-download API the way American Legal Publishing does for some other municipalities. Some sub-lists in the source PDF were displaced from their section by a two-column layout artifact and have been manually reattached; see each section's "reassembled" note in data/source/charter.json for what was moved and why. Run \`get_version\` to see when this index was last built, and cross-check anything load-bearing against the live page.

Adapted from BetaNYC's nyc-charter-laws-rules (https://github.com/BetaNYC/nyc-charter-laws-rules). Not affiliated with the City of Biddeford, General Code, or eCode360.`.trim();

function withFooter(text: string): string {
  return `${text}\n\n${FOOTER}`;
}

const server = new Server(
  {
    name: "biddeford-charter-code",
    version: "0.1.0",
  },
  {
    capabilities: { tools: {} },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "search",
      description: `Search the City of Biddeford, ME City Charter by keyword or phrase. Results are relevance-ranked: heading matches rank above citation matches, which rank above body-text matches, and whole-word matches rank above substring matches. ${CAVEAT}`,
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search term or phrase" },
          corpus: {
            type: "string",
            enum: ["charter", "all"],
            description: "Which document to search (only 'charter' is indexed today; default: all)",
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
      description: `Retrieve a specific section by its citation (e.g. 'Art. II, Sec. 4', 'Article 2 Section 4', 'Art. X, Sec. 3'). Input is normalized (Art./Article, Sec./Section, '§', punctuation, case all accepted). If multiple sections match (e.g. a bare heading search), a disambiguation list is returned. ${CAVEAT}`,
      inputSchema: {
        type: "object",
        properties: {
          citation: { type: "string", description: "Section citation or heading" },
          corpus: {
            type: "string",
            enum: ["charter"],
            description: "Which document to look in (only 'charter' is indexed today)",
          },
        },
        required: ["citation"],
      },
    },
    {
      name: "list_titles",
      description: `List all 12 Articles of the Charter (Grant of Powers, Office of the Mayor, City Council, City Manager, School Committee, Police Advisory Committee, Fire Advisory Committee, Elections, Recall, Departments/Offices/Agencies, Business and Financial Provisions, Miscellaneous Provisions). ${CAVEAT}`,
      inputSchema: {
        type: "object",
        properties: {
          corpus: {
            type: "string",
            enum: ["charter"],
            description: "Which document to list",
          },
        },
        required: ["corpus"],
      },
    },
    {
      name: "get_title",
      description: `Retrieve the full contents of an Article — every section within it — by Article identifier (e.g. 'Art. II', 'Article 3'). Unlike a flat chapter index, this returns the complete article text, not just a heading stub. ${CAVEAT}`,
      inputSchema: {
        type: "object",
        properties: {
          corpus: {
            type: "string",
            enum: ["charter"],
            description: "Which document",
          },
          title: {
            type: "string",
            description: "Article identifier (e.g. 'Art. II')",
          },
        },
        required: ["corpus", "title"],
      },
    },
    {
      name: "get_version",
      description: `Return the currency date for the Charter index — when it was transcribed and from what source. Always call this tool before answering legal questions so responses are grounded in a known-dated version of the charter. ${CAVEAT}`,
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
            corpus: z.enum(["charter", "all"]).optional(),
            limit: z.number().int().min(1).max(50).optional(),
          })
          .parse(args);
        const results = searchCorpus(
          query,
          corpus === "all" || !corpus ? "all" : "charter",
          limit ?? 10
        );
        if (results.length === 0) {
          return { content: [{ type: "text", text: withFooter(`No results found for "${query}".`) }] };
        }
        const text = results
          .map(
            (s) =>
              `${s.citation} — ${s.heading}\n${s.text.slice(0, 400)}${s.text.length > 400 ? "…" : ""}`
          )
          .join("\n\n---\n\n");
        return { content: [{ type: "text", text: withFooter(text) }] };
      }

      case "get_section": {
        const { citation, corpus } = z
          .object({
            citation: z.string(),
            corpus: z.enum(["charter"]).optional(),
          })
          .parse(args);
        const result = getSection(citation, corpus);
        if (result.kind === "none") {
          return { content: [{ type: "text", text: withFooter(`Section not found: "${citation}".`) }] };
        }
        if (result.kind === "ambiguous") {
          const list = result.candidates
            .map((s) => `${s.citation} — ${s.heading}`)
            .join("\n");
          return {
            content: [
              {
                type: "text",
                text: withFooter(
                  `Multiple sections match "${citation}". Re-run get_section with a more specific citation:\n\n${list}`
                ),
              },
            ],
          };
        }
        const section = result.section;
        const text = `${section.citation}\n${section.heading}\n\n${section.text}`;
        return { content: [{ type: "text", text: withFooter(text) }] };
      }

      case "list_titles": {
        const { corpus } = z.object({ corpus: z.enum(["charter"]) }).parse(args);
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
            corpus: z.enum(["charter"]),
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
        const v = versions.charter;
        const text = `Biddeford City Charter: ${v?.currentThrough ?? "unknown"} (${v?.sectionCount ?? 0} records; indexed ${v?.indexedAt ?? "unknown"})`;
        return { content: [{ type: "text", text: withFooter(text) }] };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
