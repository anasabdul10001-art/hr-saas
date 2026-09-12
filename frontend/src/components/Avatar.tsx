import { backendOrigin } from "../lib/api";

function initialsFrom(name?: string | null, email?: string) {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    return `${parts[0][0]}${parts[1]?.[0] ?? ""}`.toUpperCase();
  }
  return (email?.[0] ?? "?").toUpperCase();
}

const SIZES = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-20 w-20 text-2xl" } as const;

export function Avatar({
  name,
  email,
  avatarUrl,
  size = "md",
}: {
  name?: string | null;
  email?: string;
  avatarUrl?: string | null;
  size?: keyof typeof SIZES;
}) {
  if (avatarUrl) {
    // Cloudinary-hosted avatars are already-absolute URLs; only the local-disk fallback
    // (/uploads/avatars/...) needs the backend origin prepended.
    const src = /^https?:\/\//.test(avatarUrl) ? avatarUrl : `${backendOrigin}${avatarUrl}`;
    return (
      <img
        src={src}
        alt={name ?? email ?? "Avatar"}
        className={`${SIZES[size]} shrink-0 rounded-full object-cover`}
      />
    );
  }
  return (
    <div className={`flex ${SIZES[size]} shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700`}>
      {initialsFrom(name, email)}
    </div>
  );
}
