"use client";

import { useEffect, useState } from "react";
import { PLANS, type PlanId } from "@/lib/plans";
import CopyButton from "@/components/CopyButton";
import { SectionTitle, EmptyState } from "@/components/ui";

type SettingsInfo = {
  signedIn: boolean;
  isOwner: boolean;
  plan: string;
  referralCode: string | null;
  easypaisaNumber: string;
  jazzcashNumber: string;
  easypaisaSet: boolean;
  jazzcashSet: boolean;
  paymentNote: string;
  email: string | null;
};

type PaymentRow = {
  id: number;
  user_id?: string;
  email?: string | null;
  plan: string;
  method: string;
  transaction_id: string;
  status: string;
  submitted_at: string;
  reviewed_at?: string | null;
};

export default function PlansPage() {
  const [info, setInfo] = useState<SettingsInfo | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [isOwnerView, setIsOwnerView] = useState(false);
  const [plan, setPlan] = useState<PlanId>("pro");
  const [method, setMethod] = useState("easypaisa");
  const [transactionId, setTransactionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const [sRes, pRes] = await Promise.all([
      fetch("/api/settings").then((r) => r.json()),
      fetch("/api/payments").then((r) => r.json()),
    ]);
    setInfo(sRes as SettingsInfo);
    // If the currently selected method is not set up (e.g. JazzCash with
    // no receiving number), move to the first available method.
    const s = sRes as SettingsInfo;
    const available = [
      ...(s.easypaisaSet ? ["easypaisa"] : []),
      ...(s.jazzcashSet ? ["jazzcash"] : []),
      "stripe",
    ];
    setMethod((m) => (available.includes(m) ? m : available[0]));
    if (Array.isArray((pRes as { payments?: PaymentRow[] }).payments)) {
      setPayments((pRes as { payments: PaymentRow[] }).payments);
      setIsOwnerView(Boolean((pRes as { isOwner?: boolean }).isOwner));
    }
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  async function submitPayment(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, method, transactionId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not submit payment.");
      setMsg("Payment submitted — the owner will review it and activate your plan. You will see the status below.");
      setTransactionId("");
      await load();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not submit payment.");
    } finally {
      setBusy(false);
    }
  }

  async function review(id: number, action: "approve" | "reject") {
    setErr(null);
    try {
      const res = await fetch("/api/payments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Review failed.");
      await load();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Review failed.");
    }
  }

  const currentPlan = info?.plan ?? "free";
  // Only offer wallet methods the owner has actually set up. Stripe is
  // always available.
  const availableMethods = [
    ...(info?.easypaisaSet ? ["easypaisa"] : []),
    ...(info?.jazzcashSet ? ["jazzcash"] : []),
    "stripe",
  ];
  const methodsLabel = !info
    ? "Easypaisa, JazzCash or Stripe"
    : availableMethods
        .map((m) => (m === "easypaisa" ? "Easypaisa" : m === "jazzcash" ? "JazzCash" : "Stripe"))
        .join(", ")
        .replace(/, ([^,]*)$/, " or $1");
  const pending = payments.filter((p) => p.status === "pending");

  return (
    <>
      <section className="hero">
        <div className="kicker">Plans &amp; billing</div>
        <h1>Choose a plan</h1>
        <p className="muted">
          Start free. Upgrade when you are ready — pay with {methodsLabel},
          and the owner activates your plan after checking the payment.
        </p>
        {info?.signedIn ? (
          <p>
            <span className="badge badge-teal">Your plan: {currentPlan}</span>{" "}
            {info.referralCode ? (
              <span className="badge badge-gold">Referral code: {info.referralCode}</span>
            ) : null}
          </p>
        ) : (
          <p className="muted">Sign in with Google to upgrade and to keep your referral code.</p>
        )}
      </section>

      <section className="section">
        <div className="grid grid-3">
          {PLANS.map((p) => (
            <article
              className="card"
              key={p.id}
              style={currentPlan === p.id ? { borderColor: "var(--gold)", borderWidth: 2 } : undefined}
            >
              <h2>{p.name}</h2>
              <p className="stat-num" style={{ margin: "4px 0" }}>
                {p.pricePkr === 0 ? "Free" : `Rs ${p.pricePkr.toLocaleString()}`}
              </p>
              <p className="small muted">
                {p.pricePkr === 0 ? "Forever free" : `≈ $${p.priceUsd} / month`}
              </p>
              <p>{p.tagline}</p>
              <ul style={{ margin: "0 0 14px", paddingInlineStart: 18 }}>
                {p.features.map((f) => (
                  <li key={f} className="small" style={{ marginBottom: 4 }}>{f}</li>
                ))}
              </ul>
              {p.id === "free" ? (
                <span className="badge badge-teal">{currentPlan === "free" ? "Your current plan" : "Included for everyone"}</span>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setPlan(p.id);
                    document.getElementById("pay-form")?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  {currentPlan === p.id ? "Your current plan" : `Upgrade to ${p.name}`}
                </button>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="section" id="pay-form">
        <SectionTitle title="Pay for Pro or Team" sub="Send the payment, then submit the transaction ID below." />
        <div className="grid grid-2">
          <div className="card">
            <h3>Where to send the payment</h3>
            <p className="small">
              <strong>Easypaisa:</strong>{" "}
              {info ? (info.easypaisaSet ? info.easypaisaNumber : "not set yet") : "Loading…"}
              {info?.easypaisaSet ? <CopyButton text={info.easypaisaNumber} /> : null}
            </p>
            <p className="small">
              <strong>JazzCash:</strong>{" "}
              {info ? (info.jazzcashSet ? info.jazzcashNumber : "not set yet") : "Loading…"}
              {info?.jazzcashSet ? <CopyButton text={info.jazzcashNumber} /> : null}
            </p>
            {info?.paymentNote ? <p className="small muted">{info.paymentNote}</p> : null}
            <p className="small muted">
              Stripe payments are reviewed the same way — use the card option
              in the form and paste the Stripe transaction ID.
            </p>
          </div>
          <div className="card">
            <h3>Submit your payment</h3>
            {!info?.signedIn ? (
              <p className="muted">Sign in with Google first — payments are tied to your account.</p>
            ) : (
              <form onSubmit={submitPayment} style={{ display: "grid", gap: 12 }}>
                <div>
                  <label className="label" htmlFor="pay-plan">Plan</label>
                  <select id="pay-plan" className="input" value={plan} onChange={(e) => setPlan(e.target.value as PlanId)}>
                    <option value="pro">Pro — Rs 1,500 / month</option>
                    <option value="team">Team — Rs 7,499 / month</option>
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="pay-method">Payment method</label>
                  <select id="pay-method" className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
                    <option value="easypaisa" disabled={info ? !info.easypaisaSet : false}>
                      Easypaisa{info && !info.easypaisaSet ? " (not set up yet)" : ""}
                    </option>
                    <option value="jazzcash" disabled={info ? !info.jazzcashSet : false}>
                      JazzCash{info && !info.jazzcashSet ? " (not set up yet)" : ""}
                    </option>
                    <option value="stripe">Stripe</option>
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="pay-txid">Transaction ID</label>
                  <input
                    id="pay-txid"
                    className="input"
                    value={transactionId}
                    onChange={(e) => setTransactionId(e.target.value)}
                    placeholder="From your payment receipt"
                    required
                    minLength={4}
                    maxLength={100}
                  />
                </div>
                <button type="submit" className="btn btn-gold" disabled={busy}>
                  {busy ? "Submitting…" : "Submit payment"}
                </button>
              </form>
            )}
            {msg ? <p className="notice" style={{ marginTop: 12 }}>{msg}</p> : null}
            {err ? <p className="error" style={{ marginTop: 12 }}>{err}</p> : null}
          </div>
        </div>
      </section>

      {info?.signedIn && payments.length > 0 ? (
        <section className="section">
          <SectionTitle title="Your payments" sub="Status of every payment you submitted." />
          <div className="card" style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr><th>Plan</th><th>Method</th><th>Transaction ID</th><th>Status</th><th>Submitted</th></tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>{p.plan}</td>
                    <td>{p.method}</td>
                    <td style={{ wordBreak: "break-all" }}>{p.transaction_id}</td>
                    <td>
                      <span className={`badge ${p.status === "approved" ? "badge-teal" : p.status === "rejected" ? "badge-red" : "badge-gold"}`}>
                        {p.status}
                      </span>
                    </td>
                    <td>{new Date(p.submitted_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {isOwnerView ? (
        <section className="section">
          <SectionTitle title="Owner review — pending payments" sub="Approving a payment activates that user's plan immediately." />
          {pending.length === 0 ? (
            <EmptyState title="No pending payments" body="New payment submissions will appear here for review." />
          ) : (
            <div className="card" style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr><th>User</th><th>Plan</th><th>Method</th><th>Transaction ID</th><th>Submitted</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {pending.map((p) => (
                    <tr key={p.id}>
                      <td style={{ wordBreak: "break-all" }}>{p.email ?? p.user_id ?? "—"}</td>
                      <td>{p.plan}</td>
                      <td>{p.method}</td>
                      <td style={{ wordBreak: "break-all" }}>{p.transaction_id}</td>
                      <td>{new Date(p.submitted_at).toLocaleString()}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => review(p.id, "approve")}>
                          Approve
                        </button>{" "}
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => review(p.id, "reject")}>
                          Reject
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </>
  );
}
