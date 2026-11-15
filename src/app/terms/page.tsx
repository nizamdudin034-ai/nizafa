export default function TermsPage() {
  return (
    <>
      <section className="hero">
        <div className="kicker">Nizafa</div>
        <h1>Terms of Service</h1>
        <p className="muted">Last updated: 15 November 2026.</p>
      </section>

      <section className="section">
        <div className="card" style={{ display: "grid", gap: 4 }}>
          <h2>What Nizafa provides</h2>
          <p>
            Nizafa is a YouTube SEO and growth tool: SEO pack generation,
            keyword research, channel audits, trending topics, a thumbnail
            studio, daily video ideas, an Academy and an Assistant. Figures
            come from live public data and the YouTube Data API; estimates are
            labelled as estimates. Nizafa does not guarantee views,
            subscribers or income.
          </p>

          <h2>Your account</h2>
          <p>
            You sign in with a Google account. You are responsible for what
            happens under your account. Do not share your account with others,
            and keep any API key you create secret — a key shown once at
            creation will not be shown again, and you can revoke it at any
            time in Settings.
          </p>

          <h2>Plans</h2>
          <p>
            <strong>Free</strong> is free forever with the limits shown on
            the Plans page. <strong>Pro</strong> costs Rs 2,499 per month and{" "}
            <strong>Team</strong> costs Rs 7,499 per month. Plan features are
            listed on the Plans page; the owner may change features or prices
            for new subscriptions, and will show the current terms on that
            page before you pay.
          </p>

          <h2>Payments and refunds</h2>
          <p>
            Payments are manual: you pay by Easypaisa, JazzCash or Stripe
            using the details on the Plans page, then submit the transaction
            ID. The owner reviews the payment and activates your plan; a plan
            starts when it is approved, not when you submit the form. Refunds
            are manual and owner-approved: if a payment was made by mistake,
            or a plan was never activated, email the owner at{" "}
            <a href="mailto:nizamdudin034@gmail.com">nizamdudin034@gmail.com</a>{" "}
            with the transaction ID and the reason. Approved refunds are
            returned through the same payment method where possible.
          </p>

          <h2>Acceptable use</h2>
          <p>
            Use Nizafa to grow your own channels. Do not use it to scrape
            YouTube at scale, to harass or impersonate other creators, to
            upload other people&apos;s content as your own, or to break
            YouTube&apos;s terms of service. Do not resell API access, share
            another user&apos;s data, or try to access accounts or data that
            are not yours. The owner may suspend an account that breaks these
            rules, after telling the account holder why.
          </p>

          <h2>Your content</h2>
          <p>
            Everything you generate or save in Nizafa — titles, tags, scripts
            and thumbnail ideas — belongs to you. Nizafa does not claim
            ownership of it, and does not publish anything to YouTube on your
            behalf.
          </p>

          <h2>Availability</h2>
          <p>
            Nizafa is provided “as is”. The service may be unavailable during
            maintenance, and data from YouTube depends on the YouTube Data
            API being available. We will do our best to keep the service fast
            and reliable, but we are not liable for lost views, revenue or
            data caused by an outage or by YouTube&apos;s own limits.
          </p>

          <h2>Changes</h2>
          <p>
            These terms may change; the “last updated” date above will change
            and the new version will be published on this page. Continued use
            after a change means you accept the new terms.
          </p>
        </div>
      </section>
    </>
  );
}
