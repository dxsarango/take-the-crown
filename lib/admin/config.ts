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
});

export const CONFIG_FIELDS = Object.keys(configSchema.shape) as (keyof z.infer<typeof configSchema>)[];
