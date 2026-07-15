# biddeford-charter-code

An MCP (Model Context Protocol) server *and* web explorer for the **City of Biddeford, ME** municipal code — the City Charter, Code of Ordinances, and Land Development Regulations — adapted from [BetaNYC's nyc-charter-laws-rules](https://github.com/BetaNYC/nyc-charter-laws-rules) and [nyc-charter-explorer](https://github.com/joshgreenman1973/nyc-charter-explorer).

Not affiliated with the City of Biddeford, General Code, or eCode360.

## Three corpora, two different levels of confidence

| Corpus | Source | Size | How it was built |
|---|---|---|---|
| `charter` | PDF export, ecode360.com/BI3074 | 12 Articles, 74 sections | **Hand-transcribed.** Every section read, and all 15 sections whose sub-lists were displaced by the PDF's two-column layout manually traced and reattached. See `data/source/charter.json`'s `reassembled` fields. |
| `ordinances` | PDF export, ecode360.com/BI3074 | 23 Chapters, 1,374 sections | **Automated parse.** ~688 pages — not feasible to hand-verify. See "Automated parsing" below. |
| `land_dev` | PDF export, ecode360.com/BI3074 | Appendix A + 15 Articles, 209 sections | **Automated parse.** ~346 pages (Rules of City Council + the zoning/subdivision/shoreland/historic-preservation code). |

This distinction is surfaced everywhere: each corpus's `dataQualityNote` flows into the MCP server's tool output and `get_version`, and into the web explorer's document tabs (a "verified" vs "auto" badge) and footer.

## Automated parsing (`scripts/parse-large-docs.js`)

Given the scale (~1,000 pages combined), `ordinances` and `land_dev` are parsed programmatically from `pdftotext` output (`data/raw/*.txt`) rather than transcribed by hand:

1. Strip repeated page headers/footers (page-break characters, "City of Biddeford, ME", "Downloaded from ecode360.com...", and the running section-reference/title triplet printed on every page).
2. Split on citation markers — `Chapter N` for Ordinances; `APPENDIX A`, `Chapter LDR`, then `Article I–XV` for Land Development Regulations.
3. Within each chapter/article, find every occurrence of a section citation (e.g. `Sec. 18-1.`). Each appears twice — once in that chapter's table of contents (a bare heading with no real body), once as actual content — so the parser keeps whichever occurrence has more trailing text before the next citation marker.
4. Split each section's raw text into a heading (up to the first sentence-ending period) and body.

**Known limitations**, disclosed in the data itself: a handful of `(Reserved)` placeholder sections pick up a trailing title fragment from the next division; the heading/body split can occasionally cut a heading short around an abbreviation (spot-checked at ~1 in 1,580 sections). Always verify anything load-bearing — setbacks, fees, deadlines, permitting requirements — against the live source.

To regenerate `data/raw/*.txt` from fresh PDFs (requires poppler's `pdftotext`):
```bash
pdftotext Code_of_Ordinances.pdf data/raw/ordinances.txt
pdftotext Land_Development_Regulations.pdf data/raw/land-development.txt
node scripts/parse-large-docs.js   # -> data/source/ordinances.json, land_dev.json
```

## Tools

| Tool | Example |
|---|---|
| `search` | `search({ query: "setback", corpus: "land_dev" })` — omit `corpus` to search all three |
| `get_section` | `get_section({ citation: "Sec. 18-1" })` (Ordinances) · `get_section({ citation: "LDR Art. VI, Sec. 7" })` (Land Dev) · `get_section({ citation: "Art. II, Sec. 4" })` (Charter) |
| `list_titles` | `list_titles({ corpus: "ordinances" })` — lists all 23 Chapters |
| `get_title` | `get_title({ corpus: "land_dev", title: "App. A" })` — full text of a Chapter/Article/Appendix |
| `get_version` | `get_version()` — currency date **and data-quality status** for all 3 corpora |

Each corpus has its own citation convention (see table above); natural-language forms are also accepted — "Chapter 18", "Article 2 Section 4", "Appendix A" — see `normalizeCitation` in `src/corpus.ts`.

## Setup

```bash
npm install            # installs deps and runs the TypeScript build (via `prepare`)
npm run build-index    # regenerates data/index/ from data/source/*.json
npm start               # runs the MCP server over stdio
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

## Web explorer (`docs/index.html`)

A single-file, searchable/sortable web explorer, adapted from [nyc-charter-explorer](https://github.com/joshgreenman1973/nyc-charter-explorer). Document tabs to filter to Charter / Code of Ordinances / Land Development Regulations / All (each tab shows its section count and a hand-verified/auto-parsed badge); a chapter/article sidebar scoped to whichever document is selected; full-text search with relevance ranking across one or all documents; sort (document order / A–Z / longest first); a toggle for the Charter's 15 "reassembled" sections; pagination (results load 40 at a time, since the combined corpus is ~1,700 sections); light/dark/auto theme; shareable URLs; keyboard shortcuts (`/` to search, `Esc` to clear).

```bash
npm run build-index          # must run first — the site reads data/index/json/*.json
node scripts/build-site.js   # regenerates docs/index.html
```

**To use it right now:** open `docs/index.html` directly in a browser — it's fully self-contained (~2.7 MB, all three corpora embedded inline), no server required.

**To get a public URL:** push this repo to GitHub, then in the repo's **Settings → Pages**, set Source to "Deploy from a branch", branch `main`, folder `/docs`, and save. GitHub will publish it at `https://<your-username>.github.io/<repo-name>/` within a minute or two.

## Updating the data

There's no automated refresh here — eCode360 has no public bulk feed (see "Automated parsing" above). When the code is amended:

1. Download a fresh PDF export from ecode360.com/BI3074, or request eCode360 API credentials from the City of Biddeford for a cleaner JSON source going forward.
2. For the Charter: update `data/source/charter.json` directly, watching for the sub-list displacement issue described in its `dataQualityNote`.
3. For Ordinances/Land Development Regs: re-run `pdftotext` and `node scripts/parse-large-docs.js` (spot-check the diff — the parser is good but not infallible at this scale).
4. Bump each file's `asOf` field.
5. Run `npm run build-index && node scripts/build-site.js` and commit the regenerated `data/index/` and `docs/` files.

## Adding more corpora

The three corpora above cover everything currently on ecode360.com/BI3074. If Biddeford publishes something else under the same site (e.g. a separate Personnel Policy manual), the pattern is:

1. Add it to the `Corpus` union and `ALL_CORPORA` in `src/corpus.ts`.
2. Add a `data/source/<corpus>.json` (hand-curated like `charter.json`, or parsed like the other two).
3. Add a `build<Corpus>()` function to `scripts/build-index.js` producing the same flat record shape (`corpus`, `id`, `group`, `groupLabel`, `citation`, `heading`, `text`, `isDivider`).
4. Update the `enum` lists in each tool's `inputSchema` in `src/index.ts`, and `CORPUS_META` in `scripts/build-site.js`.

## License

MIT, same as the upstream nyc-charter-laws-rules project.
