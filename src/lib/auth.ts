// Auth helpers: current user + owner check.
// Owner = the workspace owner email (env OWNER_EMAIL). Payment review and
// owner settings are owner-only; everyone else sees their own data only.
import { createSupabaseServer } from "./supabase-server";

export type SessionUser = {
  id: string;
  email: string | undefined;
};

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
