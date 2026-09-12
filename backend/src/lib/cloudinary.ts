import crypto from "crypto";
import { env } from "../config/env";

export function isCloudinaryConfigured(): boolean {
  return Boolean(env.cloudinaryCloudName && env.cloudinaryApiKey && env.cloudinaryApiSecret);
}

/**
 * Uploads a buffer to Cloudinary and returns its public https URL. Used for avatars so they
 * survive redeploys - Render's free-tier disk is ephemeral, but this is plain image hosting with
 * no per-tenant data in it, so there's nothing tenant-isolation-sensitive about using one shared
 * external bucket for it.
 */
export async function uploadImage(buffer: Buffer, publicId: string): Promise<string> {
  if (!isCloudinaryConfigured()) {
    throw new Error("Cloudinary is not configured (CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET)");
  }

  const timestamp = Math.floor(Date.now() / 1000);
  // invalidate=true so a re-uploaded avatar busts Cloudinary's CDN cache at the same public_id/
  // URL instead of continuing to serve the old image. overwrite=true makes that re-upload replace
  // the previous asset rather than erroring on a duplicate public_id.
  // Cloudinary's signing scheme: sha1 of every request param it should verify, alphabetically
  // sorted and joined as "key=value&key2=value2", with the API secret appended - see
  // https://cloudinary.com/documentation/authentication_signatures
  const paramsToSign = `invalidate=true&overwrite=true&public_id=${publicId}&timestamp=${timestamp}`;
  const signature = crypto
    .createHash("sha1")
    .update(paramsToSign + env.cloudinaryApiSecret)
    .digest("hex");

  const form = new FormData();
  form.append("file", new Blob([buffer]));
  form.append("public_id", publicId);
  form.append("timestamp", String(timestamp));
  form.append("invalidate", "true");
  form.append("overwrite", "true");
  form.append("api_key", env.cloudinaryApiKey!);
  form.append("signature", signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${env.cloudinaryCloudName}/image/upload`, {
    method: "POST",
    body: form,
  });

  const data = (await response.json()) as { secure_url?: string; error?: { message: string } };
  if (!response.ok || !data.secure_url) {
    throw new Error(data.error?.message ?? "Cloudinary upload failed");
  }
  return data.secure_url;
}
