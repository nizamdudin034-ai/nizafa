"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// /nizafa-auth — YouTube OAuth callback page.
// Google redirects here with ?code=… after the user approves channel
// access. This page hands the code to /api/youtube-callback, which
// exchanges it server-side. Nothing here fakes a success: every state
// below (not configured / not owner / denied / success) is shown as it is.

type State =
  | { kind: "working" }
  | { kind: "success"; title: string; url: string }
  | { kind: "error"; message: string; setup?: boolean; redirectUri?: string };

export default function NizafaAuthPage({
  searchParams,
}: {
  searchParams: { code?: string; error?: string };
}) {
  const [state, setState] = useState<State>({ kind: "working" });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const error = params.get("error");
    if (error) {
      setState({
        kind: "error",
        message: `Google sign-in was not completed (${error}). Please try connecting again.`,
      });
      return;
    }
    if (!code) {
      setState({
        kind: "error",
        message:
          "No authorization code was returned by Google. Start the channel-connect flow again from the dashboard.",
      });
      return;
    }
    fetch(`/api/youtube-callback?code=${encodeURIComponent(code)}`)
      .then((r) => r.json())
      .then((d: {
        ok?: boolean;
        error?: string;
        setup?: boolean;
        redirectUri?: string;
        channel?: { title: string; url: string };
      }) => {
        if (d.ok && d.channel) {
          setState({ kind: "success", title: d.channel.title, url: d.channel.url });
        } else {
          setState({
            kind: "error",
            message: d.error ?? "The channel could not be connected.",
            setup: d.setup,
            redirectUri: d.redirectUri,
          });
        }
      })
      .catch(() =>
        setState({
          kind: "error",
          message: "Could not reach the server. Please try again.",
        })
      );
  }, []);

  return (
    <>
      <section className="hero">
        <div className="kicker">YouTube channel connect</div>
        <h1>Connecting your channel…</h1>
      </section>

      <section className="section">
        {state.kind === "working" ? (
          <div className="card">
            <p className="muted">Exchanging the Google authorization code — please wait a moment.</p>
          </div>
        ) : state.kind === "success" ? (
          <div className="card">
            <p>
              <span className="badge badge-teal">Connected</span>
            </p>
            <h2>Channel connected: {state.title}</h2>
            <p className="muted">
              <a href={state.url} target="_blank" rel="noreferrer">
                {state.url}
              </a>
            </p>
            <p>
              <Link href="/" className="btn btn-primary">
                Go to your dashboard →
              </Link>
            </p>
          </div>
        ) : (
          <div className="card">
            <p className="error">{state.message}</p>
            {state.setup ? (
              <div style={{ marginTop: 12 }}>
                <h3>Setup instructions (owner)</h3>
                <ol className="small">
                  <li>
                    In Google Cloud Console, open the same project as the
                    YouTube Data API key and create a “Web application” OAuth
                    client.
                  </li>
                  <li>
                    Add this exact redirect URI:
                    <pre className="code">{state.redirectUri ?? "(this page's URL)"}</pre>
                  </li>
                  <li>
                    Add <code>GOOGLE_CLIENT_ID</code> and{" "}
                    <code>GOOGLE_CLIENT_SECRET</code> in the Netlify
                    environment variables, then redeploy.
                  </li>
                  <li>Start the connect flow again from the dashboard.</li>
                </ol>
              </div>
            ) : (
              <p className="small muted">
                Channel connect opens for everyone after YouTube approves the
                sensitive-scope verification. Until then it is owner-only —
                but you can still sign in and use the generator, research and
                Academy. <Link href="/settings">See Settings →</Link>
              </p>
            )}
            <p style={{ marginTop: 12 }}>
              <Link href="/" className="btn btn-ghost">
                Back to dashboard
              </Link>
            </p>
          </div>
        )}
      </section>
    </>
  );
}
