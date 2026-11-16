"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase";
import CopyButton from "@/components/CopyButton";
import { SectionTitle, StatCard, EmptyState } from "@/components/ui";

type SettingsInfo = {
  configured: boolean;
  youtubeApiKeySet: boolean;
  googleOAuthSet: boolean;
  signedIn: boolean;
  email: string | null;
  isOwner: boolean;
  ownerEmail: string;
  plan: string;
  referralCode: string | null;
  easypaisaNumber: string;
  jazzcashNumber: string;
  easypaisaSet: boolean;
  jazzcashSet: boolean;
  paymentNote: string;
};

type ApiKeyRow = { id: number; prefix: string; created_at: string; revoked_at: string | null };
type MemberRow = { id: number; name: string; email: string; role: string; created_at: string };

function StatusBadge({ ok }: { ok: boolean }) {
  return <span className={`badge ${ok ? "badge-teal" : "badge-red"}`}>{ok ? "Set" : "Not set"}</span>;
}

export default function SettingsPage() {
  const [info, setInfo] = useState<SettingsInfo | null>(null);
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [easypaisa, setEasypaisa] = useState("");
  const [jazzcash, setJazzcash] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [memberName, setMemberName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState("editor");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const s = (await fetch("/api/settings").then((r) => r.json())) as SettingsInfo;
    setInfo(s);
    setEasypaisa(s.easypaisaNumber ?? "");
    setJazzcash(s.jazzcashNumber ?? "");
    setPaymentNote(s.paymentNote ?? "");
    if (s.signedIn) {
      const k = (await fetch("/api/keys").then((r) => r.json())) as { keys?: ApiKeyRow[] };
      setKeys(k.keys ?? []);
    }
    if (s.isOwner) {
      const t = (await fetch("/api/team").then((r) => r.json())) as { members?: MemberRow[] };
      setMembers(t.members ?? []);
    }
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  async function savePaymentSettings(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ easypaisaNumber: easypaisa, jazzcashNumber: jazzcash, paymentNote }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save settings.");
      setMsg("Payment settings saved.");
      await load();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not save settings.");
    } finally {
      setBusy(false);
    }
  }

  async function createKey() {
    setBusy(true);
    setErr(null);
    setNewKey(null);
    try {
      const res = await fetch("/api/keys", { method: "POST" });
      const data = (await res.json()) as { key?: string; error?: string };
      if (!res.ok || !data.key) throw new Error(data.error ?? "Could not create key.");
      setNewKey(data.key);
      await load();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not create key.");
    } finally {
      setBusy(false);
    }
  }

  async function revokeKey(id: number) {
    setErr(null);
    try {
      const res = await fetch(`/api/keys?id=${id}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not revoke key.");
      await load();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not revoke key.");
    }
  }

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: memberName, email: memberEmail, role: memberRole }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not add member.");
      setMemberName("");
      setMemberEmail("");
      await load();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not add member.");
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(id: number) {
    setErr(null);
    try {
      const res = await fetch(`/api/team?id=${id}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not remove member.");
      await load();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not remove member.");
    }
  }

  async function signOut() {
    try {
      const supabase = createSupabaseBrowser();
      await supabase.auth.signOut();
    } catch {
      // Fall through to reload either way.
    }
    window.location.href = "/";
  }

  return (
    <>
      <section className="hero">
        <div className="kicker">Settings</div>
        <h1>Your account &amp; setup</h1>
        <p className="muted">
          Service status, sign-in, channel connect, API keys and — for the
          owner — payment details and team members.
        </p>
      </section>

      {err ? <p className="error">{err}</p> : null}
      {msg ? <p className="notice">{msg}</p> : null}

      <section className="section">
        <SectionTitle title="Service status" sub="Only set / not set is shown here — values are never displayed." />
        <div className="grid grid-4">
          <StatCard label="Supabase database" value={info ? (info.configured ? "Connected" : "Not set") : "…"} sub="Stores your channels, packs and chats." />
          <StatCard label="YouTube Data API key" value={info ? (info.youtubeApiKeySet ? "Set" : "Not set") : "…"} sub="Powers channel stats and video data." />
          <StatCard label="Google OAuth client" value={info ? (info.googleOAuthSet ? "Set" : "Not set") : "…"} sub="Needed for YouTube channel connect." />
          <StatCard label="Your plan" value={info ? info.plan : "…"} sub={info?.referralCode ? `Referral: ${info.referralCode}` : "Sign in to see your plan."} />
        </div>
      </section>

      <section className="section">
        <div className="grid grid-2">
          <div className="card">
            <SectionTitle title="Google sign-in" sub="Nizafa signs you in with Google — no password is stored here." />
            {info?.signedIn ? (
              <>
                <p>
                  Signed in as <strong>{info.email ?? "your Google account"}</strong>
                  {info.isOwner ? " (workspace owner)" : ""}
                </p>
                <button type="button" className="btn btn-ghost" onClick={signOut}>
                  Disconnect / sign out
                </button>
              </>
            ) : (
              <p className="muted">
                You are not signed in. Use “Sign in with Google” in the top
                navigation to sign in.
              </p>
            )}
          </div>
          <div className="card">
            <SectionTitle title="Channel connect" sub="How your YouTube channel links to Nizafa." />
            <p className="small">
              Connecting a channel uses official Google / YouTube OAuth and
              reads only your channel&apos;s public stats and videos through
              the YouTube Data API. At public launch this is{" "}
              <strong>owner-only</strong>: YouTube requires a sensitive-scope
              verification before any app may ask every user to connect a
              channel, and that verification is still pending. Once it is
              approved, channel connect opens for everyone — until then, you
              can still sign in and use the generator, research and Academy.
            </p>
            <p className="small" style={{ marginBottom: 0 }}>
              Owner: connect from the dashboard, or finish the flow at{" "}
              <a href="/nizafa-auth">/nizafa-auth</a> after Google redirects
              you back here.
            </p>
          </div>
        </div>
      </section>

      {info?.isOwner ? (
        <section className="section">
          <SectionTitle title="Owner — payment receiving details" sub="Shown to signed-in users on the Plans page so they can pay you." />
          <div className="card">
            <form onSubmit={savePaymentSettings} style={{ display: "grid", gap: 12 }}>
              <div>
                <label className="label" htmlFor="set-easypaisa">Easypaisa number</label>
                <input id="set-easypaisa" className="input" value={easypaisa} onChange={(e) => setEasypaisa(e.target.value)} placeholder="e.g. 03xx-xxxxxxx" inputMode="tel" />
              </div>
              <div>
                <label className="label" htmlFor="set-jazzcash">JazzCash number</label>
                <input id="set-jazzcash" className="input" value={jazzcash} onChange={(e) => setJazzcash(e.target.value)} placeholder="e.g. 03xx-xxxxxxx" inputMode="tel" />
              </div>
              <div>
                <label className="label" htmlFor="set-note">Payment note (shown on Plans)</label>
                <textarea id="set-note" className="input" value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} rows={2} maxLength={500} placeholder="e.g. Please include your email in the payment note." />
              </div>
              <div>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? "Saving…" : "Save payment details"}
                </button>
              </div>
            </form>
          </div>
        </section>
      ) : null}

      {info?.signedIn ? (
        <section className="section">
          <SectionTitle title="API keys" sub="Keys for the Nizafa API. The full key is shown once — store it safely." />
          <div className="card">
            {newKey ? (
              <div className="notice" style={{ marginBottom: 12 }}>
                <strong>Your new key (copy it now — it will never be shown again):</strong>
                <pre className="code" style={{ marginTop: 8 }}>{newKey}</pre>
                <CopyButton text={newKey} label="Copy key" />
              </div>
            ) : null}
            <button type="button" className="btn btn-primary" onClick={createKey} disabled={busy}>
              Create new API key
            </button>
            {keys.length === 0 ? (
              <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>No API keys yet.</p>
            ) : (
              <div style={{ overflowX: "auto", marginTop: 12 }}>
                <table className="table">
                  <thead>
                    <tr><th>Prefix</th><th>Created</th><th>Status</th><th>Action</th></tr>
                  </thead>
                  <tbody>
                    {keys.map((k) => (
                      <tr key={k.id}>
                        <td><code>{k.prefix}…</code></td>
                        <td>{new Date(k.created_at).toLocaleString()}</td>
                        <td>
                          <span className={`badge ${k.revoked_at ? "badge-red" : "badge-teal"}`}>
                            {k.revoked_at ? "Revoked" : "Active"}
                          </span>
                        </td>
                        <td>
                          {!k.revoked_at ? (
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => revokeKey(k.id)}>
                              Revoke
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {info?.isOwner ? (
        <section className="section">
          <SectionTitle title="Team" sub="People who work on this workspace with you (owner only)." />
          <div className="card">
            <form onSubmit={addMember} style={{ display: "grid", gap: 12, marginBottom: 16 }}>
              <div>
                <label className="label" htmlFor="team-name">Name</label>
                <input id="team-name" className="input" value={memberName} onChange={(e) => setMemberName(e.target.value)} required maxLength={80} placeholder="e.g. Ayesha Khan" />
              </div>
              <div>
                <label className="label" htmlFor="team-email">Email</label>
                <input id="team-email" className="input" type="email" value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} required placeholder="member@example.com" />
              </div>
              <div>
                <label className="label" htmlFor="team-role">Role</label>
                <select id="team-role" className="input" value={memberRole} onChange={(e) => setMemberRole(e.target.value)}>
                  <option value="editor">Editor</option>
                  <option value="researcher">Researcher</option>
                  <option value="designer">Designer</option>
                  <option value="manager">Manager</option>
                </select>
              </div>
              <div>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  Add member
                </button>
              </div>
            </form>
            {members.length === 0 ? (
              <EmptyState title="No team members yet" body="Add the people who help run your channels." />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="table">
                  <thead>
                    <tr><th>Name</th><th>Email</th><th>Role</th><th>Action</th></tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.id}>
                        <td>{m.name}</td>
                        <td style={{ wordBreak: "break-all" }}>{m.email}</td>
                        <td>{m.role}</td>
                        <td>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeMember(m.id)}>
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      ) : null}
    </>
  );
}
