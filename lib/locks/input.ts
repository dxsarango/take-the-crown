import { z } from "zod";

export const NAME_PATTERN = /^[A-Za-z0-9._-]{3,24}$/;
export const LINK_MAX_LENGTH = 200;

/** "turno.app" → "https://turno.app". Anything that is not https ends up invalid. */
export function normalizeLink(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  return /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.includes(".") && !/\s/.test(value);
  } catch {
    return false;
  }
}

/** Buyer's local hour for Night Owl, from the IANA zone the browser reports. */
export function localHour(timeZone: string | null | undefined, now = new Date()): number | null {
  if (!timeZone) return null;
  try {
    const hour = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(now);
    const value = Number(hour);
    return Number.isInteger(value) && value >= 0 && value <= 23 ? value : null;
  } catch {
    return null;
  }
}

const optionalText = z
  .string()
  .max(1000)
  .optional()
  .transform((v) => {
    const value = v?.replace(/\s+/g, " ").trim();
    return value ? value : null;
  });

export const lockRequestSchema = z.object({
  name: z.string().trim().regex(NAME_PATTERN),
  email: z.email().max(254).optional(),
  link: z
    .string()
    .max(LINK_MAX_LENGTH)
    .optional()
    .transform((v) => (v ? normalizeLink(v) : ""))
    .refine((v) => v === "" || (isHttpsUrl(v) && v.length <= LINK_MAX_LENGTH))
    .transform((v) => v || null),
  message: optionalText,
  country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  timeZone: z.string().max(64).optional(),
  avatarSeed: z
    .string()
    .regex(/^[0-9a-f]{32}$/)
    // The all-zero seed is the deleted accounts' silhouette.
    .refine((v) => /[1-9a-f]/.test(v))
    .optional(),
  locale: z.enum(["en", "es"]),
  turnstileToken: z.string().max(4096).optional(),
  // Terms §5: immediate delivery and no withdrawal once delivered, accepted before every checkout.
  acceptWithdrawal: z.literal(true),
});

export type LockRequest = z.infer<typeof lockRequestSchema>;
