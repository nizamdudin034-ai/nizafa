import { NextResponse } from "next/server";
import { createSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase-server";
import { getSessionUser, isOwner } from "@/lib/auth";
import { planById } from "@/lib/plans";

// Payments — manual Easypaisa / JazzCash / Stripe proofs.
// POST { plan, method, transactionId } → payments row (status 'pending').
// GET: owner sees all pending (+ recent reviewed); a user sees their own.
// PATCH { id, action: 'approve' | 'reject' } — owner only. Approve sets
// the user's plan on app_users (creating the row if it does not exist yet).

const METHODS = ["easypaisa", "jazzcash", "stripe"] as const;

async function ensureAppUser(
  admin: ReturnType<typeof createSupabaseAdmin>,
  userId: string,
  email?: string
) {
  const { data } = await admin.from("app_users").select("id").eq("id", userId).maybeSingle();
  if (!data) {
    let resolvedEmail = email;
    if (!resolvedEmail) {
      try {
        const { data: authUser } = await admin.auth.admin.getUserById(userId);
        resolvedEmail = authUser.user?.email ?? undefined;
      } catch {
        resolvedEmail = undefined;
      }
    }
    await admin.from("app_users").insert({
      id: userId,
      google_sub: userId,
      email: resolvedEmail ?? "unknown@nizafa.app",
      plan: "free",
    });
  }
}

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured yet." }, { status: 503 });
  }
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in with Google first." }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    plan?: string;
    method?: string;
    transactionId?: string;
  };
  const plan = (body.plan ?? "").toLowerCase();
  if (plan !== "pro" && plan !== "team") {
    return NextResponse.json({ error: "Choose the Pro or Team plan to pay for." }, { status: 400 });
  }
  const method = (body.method ?? "").toLowerCase();
  if (!(METHODS as readonly string[]).includes(method)) {
    return NextResponse.json({ error: "Choose Easypaisa, JazzCash or Stripe." }, { status: 400 });
  }
  const transactionId = (body.transactionId ?? "").trim();
  if (transactionId.length < 4 || transactionId.length > 100) {
    return NextResponse.json(
      { error: "Enter the transaction ID from your payment receipt." },
      { status: 400 }
    );
  }
  const admin = createSupabaseAdmin();
  // Reject a wallet method whose receiving number the owner has not set
  // up yet (e.g. JazzCash) — the customer would otherwise pay nowhere.
  if (method === "easypaisa" || method === "jazzcash") {
    const key = method === "easypaisa" ? "easypaisa_number" : "jazzcash_number";
    const { data: rows } = await admin
      .from("settings")
      .select("key,value")
      .in("key", ["easypaisa_number", "jazzcash_number"]);
    const setUp = new Set((rows ?? []).filter((r) => r.value).map((r) => r.key as string));
    if (!setUp.has(key)) {
      const label = method === "easypaisa" ? "Easypaisa" : "JazzCash";
      const alternatives: string[] = (["easypaisa_number", "jazzcash_number"] as const)
        .filter((k) => k !== key && setUp.has(k))
        .map((k) => (k === "easypaisa_number" ? "Easypaisa" : "JazzCash"));
      alternatives.push("Stripe");
      return NextResponse.json(
        { error: `${label} is not set up yet — please pay with ${alternatives.join(" or ")}.` },
        { status: 400 }
      );
    }
  }
  await ensureAppUser(admin, user.id, user.email);
  const { data, error } = await admin
    .from("payments")
    .insert({
      user_id: user.id,
      plan,
      method,
      transaction_id: transactionId,
      status: "pending",
    })
    .select("id,plan,method,transaction_id,status,submitted_at")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Could not save payment." }, { status: 500 });
  }
  return NextResponse.json({ payment: data, plan: planById(plan) });
}

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ payments: [], configured: false });
  }
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in with Google first." }, { status: 401 });
  }
  const admin = createSupabaseAdmin();
  if (isOwner(user)) {
    const { data, error } = await admin
      .from("payments")
      .select("id,user_id,plan,method,transaction_id,status,submitted_at,reviewed_at")
      .order("submitted_at", { ascending: false })
      .limit(50);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const rows = data ?? [];
    // Attach payer emails for the review list.
    const userIds = [...new Set(rows.map((r) => r.user_id as string))];
    const emails = new Map<string, string>();
    for (const uid of userIds) {
      const { data: u } = await admin.from("app_users").select("email").eq("id", uid).maybeSingle();
      if (u?.email) emails.set(uid, u.email as string);
    }
    return NextResponse.json({
      payments: rows.map((r) => ({ ...r, email: emails.get(r.user_id as string) ?? null })),
      isOwner: true,
    });
  }
  const { data, error } = await admin
    .from("payments")
    .select("id,plan,method,transaction_id,status,submitted_at,reviewed_at")
    .eq("user_id", user.id)
    .order("submitted_at", { ascending: false })
    .limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ payments: data ?? [], isOwner: false });
}

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user || !isOwner(user)) {
    return NextResponse.json({ error: "Only the workspace owner can review payments." }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { id?: number; action?: string };
  const id = Number(body.id);
  if (!id) return NextResponse.json({ error: "Missing payment id." }, { status: 400 });
  if (body.action !== "approve" && body.action !== "reject") {
    return NextResponse.json({ error: "Action must be approve or reject." }, { status: 400 });
  }
  const admin = createSupabaseAdmin();
  const { data: payment, error: fetchError } = await admin
    .from("payments")
    .select("id,user_id,plan,status")
    .eq("id", id)
    .maybeSingle();
  if (fetchError || !payment) {
    return NextResponse.json({ error: "Payment not found." }, { status: 404 });
  }
  if (payment.status !== "pending") {
    return NextResponse.json({ error: "This payment was already reviewed." }, { status: 409 });
  }
  const status = body.action === "approve" ? "approved" : "rejected";
  const { error } = await admin
    .from("payments")
    .update({ status, reviewed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (body.action === "approve") {
    await ensureAppUser(admin, payment.user_id as string);
    await admin
      .from("app_users")
      .update({ plan: payment.plan as string })
      .eq("id", payment.user_id as string);
  }
  return NextResponse.json({ ok: true, status });
}
