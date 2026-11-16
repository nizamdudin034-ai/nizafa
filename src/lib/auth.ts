// Auth helpers: current user + owner check.
// Owner = the workspace owner email (env OWNER_EMAIL). Payment review and
// owner settings are owner-only; everyone else sees their own data only.
import { createSupabaseAdmin, createSupabaseServer } from "./supabase-server";

export type SessionUser = {
  id: string;
  email: string | undefined;
};

// Make sure the signed-in user has a row in app_users (id = Supabase Auth
// UID). Without it, every insert into a user-scoped table (packages,
// channels, api_keys, ...) fails on the packages_user_id_fkey-style foreign
// key. Idempotent: only inserts when the row is missing.
export async function ensureAppUser(
  admin: ReturnType<typeof createSupabaseAdmin>,
  user: { id: string; email: string | undefined }
): Promise<void> {
  const { data } = await admin
    .from("app_users")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (!data) {
    await admin.from("app_users").insert({
      id: user.id,
      google_sub: user.id,
      email: user.email ?? "unknown@nizafa.app",
      plan: "free",
    });
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const supabase = createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    return { id: user.id, email: user.email };
  } catch {
    return null;
  }
}

export function ownerEmail(): string {
  return process.env.OWNER_EMAIL || "nizamdudin034@gmail.com";
}

export function isOwner(user: SessionUser | null): boolean {
  return !!user?.email && user.email.toLowerCase() === ownerEmail().toLowerCase();
}
