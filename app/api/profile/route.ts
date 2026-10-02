import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentViewer } from "@/lib/auth/viewer";
import { moderate } from "@/lib/moderation";
import { clientIp, hashIp, sameOrigin } from "@/lib/security/request";
import { sendMagicLink } from "@/lib/auth/magic-link";
import { routing } from "@/i18n/routing";
import { verifyHuman } from "@/lib/security/human";
import { withinHourlyLimit } from "@/lib/security/rate-limit";
import { type FieldKey, type SaveOutcome, fieldForDbError, mainLinkUrl, settingsSchema, toUpdateArgs } from "@/lib/profile/settings";
import type { Database } from "@/lib/supabase/database.types";
import { serviceClient } from "@/lib/supabase/service";
import { sessionClient } from "@/lib/supabase/session";
import { deleteAccount } from "@/lib/profile/delete";
import { revalidateHome } from "@/lib/home/cache";

type UpdateArgs = Database["public"]["Functions"]["update_profile"]["Args"];

/** Saves the whole edit profile form for the signed-in player. */
export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return Response.json({ ok: false, error: "failed" } satisfies SaveOutcome, { status: 403 });
  const viewer = await currentViewer();
  if (!viewer) return Response.json({ ok: false, error: "failed" } satisfies SaveOutcome, { status: 401 });

  const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: "failed" } satisfies SaveOutcome, { status: 400 });
  const form = parsed.data;

  // Human check and rate limit first, so moderation (a paid model call) can never run in bulk.
  const ip = clientIp(request.headers);
  if (!(await verifyHuman(form.turnstileToken, ip, "profile"))) {
    return Response.json({ ok: false, error: "failed" } satisfies SaveOutcome, { status: 403 });
  }
  if (!(await withinHourlyLimit(`profile_save:${viewer.profileId}`, "max_profile_saves_per_hour"))) {
    return Response.json({ ok: false, error: "rate_limited" } satisfies SaveOutcome, { status: 429 });
  }

  const db = serviceClient();
  const { data: config } = await db.from("app_config").select("floor_cents").single();
  const floorDollars = Math.ceil((config?.floor_cents ?? 500) / 100);
  const result = toUpdateArgs(viewer.profileId, form, floorDollars);
  if ("problems" in result) {
    const fields = result.problems.map((p) => p.field) as FieldKey[];
    return Response.json({ ok: false, error: "invalid", fields } satisfies SaveOutcome, { status: 422 });
  }

  // The public name and product link go through the same moderation as the throne (SPEC §7), only
  // when one of them changed.
  const link = mainLinkUrl(form.link);
  const { data: current } = await db.from("profiles").select("name, main_link").eq("id", viewer.profileId).single();
  const changed = !current || current.name !== form.name.trim() || current.main_link !== link;
  const verdict = changed ? await moderate({ name: form.name.trim(), message: null, link }) : ({ verdict: "allow" } as const);
  if (verdict.verdict === "reject") {
    const field = verdict.field === "name" ? "name" : "link";
    return Response.json({ ok: false, error: "rejected", field, reason: verdict.reason } satisfies SaveOutcome, { status: 422 });
  }
  if (verdict.verdict === "unavailable") {
    return Response.json({ ok: false, error: "moderation_unavailable" } satisfies SaveOutcome, { status: 503 });
  }

  // SQL parameters accept null; the generated types do not say so.
  const { data: saved, error } = await db.rpc("update_profile", result.args as unknown as UpdateArgs);
  if (error) {
    const mapped = fieldForDbError(error.message);
    if (mapped) {
      return Response.json(
        { ok: false, error: "invalid", fields: [mapped.field], nameProblem: mapped.nameProblem } satisfies SaveOutcome,
        { status: 422 },
      );
    }
    console.error("update_profile failed", error.message);
    return Response.json({ ok: false, error: "failed" } satisfies SaveOutcome, { status: 500 });
  }

  const name = (saved as { name?: string } | null)?.name?.toLowerCase();
  if (name) revalidatePath(`/[locale]/u/${name}`, "page");
  revalidateHome();
  return Response.json({ ok: true } satisfies SaveOutcome);
}

const deleteSchema = z.object({ confirmName: z.string().max(64), locale: z.enum(routing.locales).default(routing.defaultLocale) });

/**
 * Deletes the signed-in player's account. The player types their public name to confirm, so a
 * stray click or a forged request cannot do it.
 */
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return Response.json({ ok: false }, { status: 403 });
  const viewer = await currentViewer();
  if (!viewer) return Response.json({ ok: false }, { status: 401 });
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: "confirm" }, { status: 400 });

  const db = serviceClient();
  const { data: profile } = await db.from("profiles").select("name").eq("id", viewer.profileId).single();
  if (!profile || profile.name.toLowerCase() !== parsed.data.confirmName.trim().toLowerCase()) {
    return Response.json({ ok: false, error: "confirm" }, { status: 400 });
  }

  // A recent sign-in proves the player is at the keyboard; otherwise email a sign-in link that
  // brings them back to this dialog.
  const { data: config } = await db.from("app_config").select("delete_reauth_seconds").single();
  const reauthMs = (config?.delete_reauth_seconds ?? 600) * 1000;
  const signedInAt = viewer.lastSignInAt ? Date.parse(viewer.lastSignInAt) : 0;
  if (!(Date.now() - signedInAt < reauthMs)) {
    if (await withinHourlyLimit(`magic_link_email:${hashIp(viewer.email.toLowerCase())}`, "max_magic_links_per_hour")) {
      await sendMagicLink(viewer.email, `/${parsed.data.locale}/settings/profile?delete=1`);
    }
    return Response.json({ ok: false, error: "reauth" }, { status: 403 });
  }
  if (!(await deleteAccount(viewer.profileId))) return Response.json({ ok: false }, { status: 500 });

  // The session belongs to a user that no longer exists; clear its cookies.
  await (await sessionClient()).auth.signOut({ scope: "local" }).catch(() => undefined);
  revalidatePath(`/[locale]/u/${profile.name.toLowerCase()}`, "page");
  revalidateHome();
  return Response.json({ ok: true });
}
