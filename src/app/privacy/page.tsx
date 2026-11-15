export default function PrivacyPage() {
  return (
    <>
      <section className="hero">
        <div className="kicker">Nizafa</div>
        <h1>Privacy Policy</h1>
        <p className="muted">Last updated: 15 November 2026.</p>
      </section>

      <section className="section">
        <div className="card" style={{ display: "grid", gap: 4 }}>
          <h2>What Nizafa is</h2>
          <p>
            Nizafa is a YouTube SEO and growth tool. It helps creators plan
            videos: titles, tags, descriptions, thumbnails, trending topics
            and channel analytics. It reads public YouTube data and, when you
            connect a channel, your channel&apos;s own data through the
            official YouTube Data API.
          </p>

          <h2>What data we collect</h2>
          <p>
            <strong>Google sign-in.</strong> When you sign in with Google,
            Supabase Google Auth gives us your name, email address and profile
            picture. We use them only to identify your account and to show
            your name and avatar inside the app. We never see or store your
            Google password.
          </p>
          <p>
            <strong>YouTube channel connect (owner only at launch).</strong>{" "}
            When a channel is connected, we read the channel&apos;s public
            statistics and its videos through the YouTube Data API: channel
            title and description, subscriber count, video count, total views,
            and per-video titles, view counts, like counts and publish dates.
            We use that data only to show you your own dashboard, audits,
            best time to post and personalised video ideas.
          </p>
          <p>
            <strong>Things you create in Nizafa.</strong> SEO packs, saved
            packages, trend alerts, Academy progress, Assistant chat history,
            API keys (only a prefix and a one-way hash are stored — never the
            full key) and payment submissions (plan, method and transaction
            ID) are stored in our database so the app can show them back to
            you.
          </p>
          <p>
            <strong>Payments.</strong> Payments are manual (Easypaisa,
            JazzCash or Stripe). We store the plan, the payment method and the
            transaction ID you submit so the owner can review it. We do not
            collect or store card numbers or bank credentials.
          </p>

          <h2>What we do not do</h2>
          <p>
            We do not sell your data to anyone. We do not share your channel
            data, email address or chat history with advertisers or other
            third parties. We do not store passwords. We do not use your data
            to train models. The Assistant answers from a curated playbook and
            your own channel data — it does not send your questions to an
            external AI provider in v1.
          </p>

          <h2>How long we keep data</h2>
          <p>
            Your account data is kept while your account exists. You can ask
            for your data to be deleted at any time (see below); deletion
            removes your account, channels, packages, chats, Academy progress
            and API keys. Payment records needed for accounting may be kept
            for a short period after deletion where the law requires it.
          </p>

          <h2>Deleting your data</h2>
          <p>
            To delete your account and all data tied to it, email the owner
            at{" "}
            <a href="mailto:nizamdudin034@gmail.com">nizamdudin034@gmail.com</a>{" "}
            from the email address you signed in with, with the subject
            “Delete my Nizafa data”. We will confirm once it is done.
          </p>

          <h2>Cookies and local storage</h2>
          <p>
            Nizafa uses cookies only to keep you signed in (Supabase Auth)
            and local storage only for your theme (light/dark) and language
            choice. There are no advertising cookies and no third-party
            trackers.
          </p>

          <h2>Changes to this policy</h2>
          <p>
            If this policy changes, the “last updated” date above will change
            and the new version will be published on this page.
          </p>
        </div>
      </section>
    </>
  );
}
