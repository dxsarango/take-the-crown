"use server";

import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { readAlertOffToken } from "@/lib/email/links";
import { serviceClient } from "@/lib/supabase/service";

/** Turns off the alert the signed link names, then shows the confirmation. */
export async function turnOffAlert(form: FormData) {
  const token = String(form.get("token") ?? "");
  const locale = routing.locales.find((l) => l === form.get("locale")) ?? routing.defaultLocale;
  const alert = readAlertOffToken(token);
  if (!alert) return redirect({ href: "/alerts/off", locale });
  const { error } = await serviceClient().rpc("turn_off_alert", { p_profile_id: alert.profileId, p_kind: alert.kind });
  if (error) throw new Error(`turn_off_alert failed: ${error.message}`);
  return redirect({ href: `/alerts/off?done=${alert.kind}`, locale });
}
