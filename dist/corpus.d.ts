export type Corpus = "charter";
export interface Section {
    corpus: Corpus;
    id: string;
    citation: string;
    heading: string;
    text: string;
}
export interface CorpusVersion {
    currentThrough: string;
    indexedAt: string;
    sectionCount: number;
}
export type Versions = Record<Corpus, CorpusVersion>;
export declare function getVersions(): Versions;
export declare function searchCorpus(query: string, corpus?: Corpus | "all", limit?: number): Section[];
export declare function normalizeCitation(input: string): string;
export type GetSectionResult = {
    kind: "match";
    section: Section;
} | {
    kind: "ambiguous";
    candidates: Section[];
} | {
    kind: "none";
};
export declare function getSection(citation: string, corpus?: Corpus): GetSectionResult;
export declare function listTitles(corpus: Corpus): {
    citation: string;
    heading: string;
}[];
export declare function getTitle(corpus: Corpus, title: string): Section[];
//# sourceMappingURL=corpus.d.ts.map