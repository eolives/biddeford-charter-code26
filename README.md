# biddeford-charter-code

An MCP (Model Context Protocol) server for the **City of Biddeford, ME City Charter**, adapted from [BetaNYC's nyc-charter-laws-rules](https://github.com/BetaNYC/nyc-charter-laws-rules).

Not affiliated with the City of Biddeford, General Code, or eCode360.

## How this differs from the NYC original

NYC's repo works out of the box because its source, American Legal Publishing, publishes free bulk XML downloads. Biddeford's charter is hosted on **eCode360** (General Code), which has no public bulk-download feed. So instead of an automated `fetch-data` → `build-index` pipeline over XML, this repo has:

- **`data/source/charter.json`** — a hand-transcribed, human-reviewed source of truth, built from a PDF export downloaded from [ecode360.com/BI3074](https://ecode360.com/BI3074) on 2026-07-09. This is the thing you re-do (in whole or in part) when the charter is amended.
- **`scripts/build-index.js`** — reshapes that source file into the same `data/index/json/*.json` + `data/index/markdown/*.md` output format the MCP server reads, so `src/corpus.ts` and `src/index.ts` are structurally close to the NYC original.

### Known data-quality issue in the source PDF

eCode360's PDF export uses a layout where some lettered sub-lists — e.g. `(a) ... (b) ... (c) ...` — get separated from the paragraph that introduces them and end up printed after later, unrelated sections in the same Article (a two-column-layout artifact, not a charter drafting issue). Fifteen of this charter's 74 sections had this problem. Each was manually traced back to its correct section by content and cross-reference and reattached — see the `"reassembled"` field on the affected sections in `data/source/charter.json` for exactly what was moved and why.

**If you re-transcribe from a fresh PDF export, check for this again** — don't assume a straight top-to-bottom read of the PDF text layer is safe.

## Tools

Same five tools as the NYC original, scoped to Biddeford's single `charter` corpus (Biddeford's Code of Ordinances and Land Development Regulations aren't indexed yet — see "Adding more corpora" below):

| Tool | Example |
|---|---|
| `search` | `search({ query: "veto" })` |
| `get_section` | `get_section({ citation: "Art. II, Sec. 4" })` — also accepts `"Article 2 Section 4"`, `"Art II Sec 4"`, etc. |
| `list_titles` | `list_titles({ corpus: "charter" })` — lists all 12 Articles |
| `get_title` | `get_title({ corpus: "charter", title: "Art. VI" })` — returns the full text of an Article |
| `get_version` | `get_version()` — when the index was built and from what source |

Citations use Biddeford's own numbering: `Art. <roman numeral>, Sec. <n>` (e.g. `Art. X, Sec. 4`), since section numbers restart in each Article and aren't unique on their own.

## Setup

```bash
npm install       # installs deps and runs the TypeScript build (via `prepare`)
npm run build-index   # regenerates data/index/ from data/source/charter.json
npm start         # runs the MCP server over stdio
```

## Using it as an MCP server

```json
{
  "mcpServers": {
    "biddeford-charter-code": {
      "command": "node",
      "args": ["/path/to/biddeford-charter-code/dist/index.js"]
    }
  }
}
```

## Updating the charter

There's no automated refresh here — when the charter is amended:

1. Download a fresh PDF/HTML export from [ecode360.com/BI3074](https://ecode360.com/BI3074), or request eCode360 API credentials from the City of Biddeford for a cleaner JSON source going forward.
2. Update the relevant section(s) in `data/source/charter.json`, watching for the sub-list displacement issue described above.
3. Bump `asOf` in that file.
4. Run `npm run build-index` and commit the regenerated `data/index/` files.

## Web explorer (`docs/index.html`)

A single-file, searchable/sortable web explorer, adapted from [nyc-charter-explorer](https://github.com/joshgreenman1973/nyc-charter-explorer). Full text search with relevance ranking, sort (charter order / A–Z / longest first), filter by Article, a toggle to show just the 15 sections whose text was repositioned during transcription (each with its "reassembled" note on hover/tap), light/dark/auto theme, deep-linkable/shareable URLs, and keyboard shortcuts (`/` to search, `Esc` to clear).

```bash
npm run build-site   # regenerates docs/index.html from data/source/charter.json
```

**To use it right now:** open `docs/index.html` directly in a browser — it's fully self-contained (data is embedded inline), no server required.

**To get a public URL:** push this repo to GitHub, then in the repo's **Settings → Pages**, set Source to "Deploy from a branch", branch `main`, folder `/docs`, and save. GitHub will publish it at `https://<your-username>.github.io/<repo-name>/` within a minute or two. Re-run `npm run build-site` and push whenever `data/source/charter.json` changes.

## Adding more corpora (Code of Ordinances, Land Development Regulations)

The type system currently hard-codes `Corpus = "charter"` in `src/corpus.ts` on purpose — it shouldn't claim to search documents that aren't actually indexed. To add another Biddeford corpus:

1. Widen `export type Corpus = "charter" | "ordinances" | "land_dev";` and `ALL_CORPORA` in `src/corpus.ts`.
2. Add a matching source file (`data/source/ordinances.json`, etc.) in the same shape as `charter.json`.
3. Extend `scripts/build-index.js` to loop over multiple source files instead of one.
4. Update the `enum` lists in each tool's `inputSchema` in `src/index.ts`.

## License

MIT, same as the upstream nyc-charter-laws-rules project.
