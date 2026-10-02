import { randomUUID } from "node:crypto";
import { currentViewer } from "@/lib/auth/viewer";
import { AVATAR_BUCKET, AVATAR_FILES, avatarFileUrl } from "@/lib/profile/avatar";
import { MAX_UPLOAD_BYTES, processAvatar } from "@/lib/profile/avatar-image";
import { withinHourlyLimit } from "@/lib/security/rate-limit";
import { sameOrigin } from "@/lib/security/request";
import { serviceClient } from "@/lib/supabase/service";

/**
 * Stores an uploaded photo or logo under the player's folder. The profile only points at it once
 * edit profile is saved (update_profile checks the folder belongs to the profile).
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ ok: false, error: "failed" }, { status: 403 });
  const viewer = await currentViewer();
  if (!viewer) return Response.json({ ok: false, error: "failed" }, { status: 401 });
  if (!(await withinHourlyLimit(`avatar_upload:${viewer.profileId}`, "max_avatar_uploads_per_hour"))) {
    return Response.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ ok: false, error: "type" }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return Response.json({ ok: false, error: "size" }, { status: 413 });

  const processed = await processAvatar(Buffer.from(await file.arrayBuffer()));
  if ("error" in processed) return Response.json({ ok: false, error: processed.error }, { status: 422 });

  const path = `${viewer.profileId}/${randomUUID()}`;
  const storage = serviceClient().storage.from(AVATAR_BUCKET);
  const uploads = await Promise.all([
    storage.upload(`${path}/${AVATAR_FILES.original}`, processed.original, { contentType: "image/webp", cacheControl: "31536000" }),
    storage.upload(`${path}/${AVATAR_FILES.pixel}`, processed.pixel, { contentType: "image/png", cacheControl: "31536000" }),
  ]);
  const failed = uploads.find((u) => u.error);
  if (failed) {
    console.error("avatar upload failed", failed.error?.message);
    return Response.json({ ok: false, error: "failed" }, { status: 500 });
  }

  return Response.json({
    ok: true,
    path,
    pixelUrl: avatarFileUrl(path, "pixel"),
    originalUrl: avatarFileUrl(path, "original"),
  });
}
