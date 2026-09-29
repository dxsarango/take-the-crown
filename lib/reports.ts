/** The reasons a visitor can pick when reporting a reign's message (decision 32). */
export const REPORT_REASONS = ["offensive", "scam", "spam"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
