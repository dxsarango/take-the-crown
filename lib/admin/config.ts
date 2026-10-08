import { z } from "zod";

/** Editable game rules (app_config), with ranges the admin form enforces on top of the table checks. */
export const configSchema = z.object({
  floor_cents: z.coerce.number().int().min(100).max(100_000),
  step_bps: z.coerce.number().int().min(1).max(100_000),
  decay_bps_per_hour: z.coerce.number().int().min(0).max(9_999),
  lock_seconds: z.coerce.number().int().min(60).max(3_600),
  late_payment_grace_seconds: z.coerce.number().int().min(0).max(86_400),
  max_message_length: z.coerce.number().int().min(10).max(280),
  max_locks_per_ip_per_hour: z.coerce.number().int().min(1).max(1_000),
  name_change_days: z.coerce.number().int().min(0).max(365),
  max_email_attempts: z.coerce.number().int().min(1).max(20),
  max_moderations_per_ip_per_hour: z.coerce.number().int().min(1).max(1_000),
  max_profile_saves_per_hour: z.coerce.number().int().min(1).max(1_000),
  max_magic_links_per_hour: z.coerce.number().int().min(1).max(100),
  max_avatar_uploads_per_hour: z.coerce.number().int().min(1).max(100),
  max_reports_per_ip_per_hour: z.coerce.number().int().min(1).max(1_000),
  max_name_checks_per_ip_per_hour: z.coerce.number().int().min(1).max(10_000),
  min_first_season_days: z.coerce.number().int().min(1).max(90),
  delete_reauth_seconds: z.coerce.number().int().min(60).max(86_400),
  refund_retry_base_seconds: z.coerce.number().int().min(10).max(3_600),
  refund_retry_max_seconds: z.coerce.number().int().min(60).max(86_400),
  refund_alert_interval_seconds: z.coerce.number().int().min(300).max(86_400),
});

export const CONFIG_FIELDS = Object.keys(configSchema.shape) as (keyof z.infer<typeof configSchema>)[];

const optional = (inner: z.ZodType<string>) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : typeof v === "string" ? v.trim() : v), inner.nullable());

/** The legal pages' details (docs/legal placeholders). Empty leaves the placeholder showing. */
export const legalSchema = z.object({
  legal_contact_email: optional(z.email().max(254)),
  legal_city: optional(z.string().min(1).max(80)),
  legal_payment_provider: optional(z.string().min(1).max(80)),
  legal_effective_date: optional(z.iso.date()),
});

export const LEGAL_FIELDS = Object.keys(legalSchema.shape) as (keyof z.infer<typeof legalSchema>)[];
