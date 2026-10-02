export const LEGAL_DOCS = ["rules", "faq", "terms", "privacy"] as const;
export type LegalDoc = (typeof LEGAL_DOCS)[number];
