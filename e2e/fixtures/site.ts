// The app builds absolute URLs from NEXT_PUBLIC_SITE_URL; the specs expect the same origin.
export const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const SITE_HOST = new URL(SITE).host;
