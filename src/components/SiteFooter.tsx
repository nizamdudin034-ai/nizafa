"use client";

import { useEffect, useState } from "react";

// The SEO footer belongs to the SEO site only. On the standalone chatbot
// site (nizafa-ai.netlify.app) there is no footer at all — the site is
// only the chatbot.
export default function SiteFooter() {
  const [isAiHost, setIsAiHost] = useState(false);

  useEffect(() => {
    setIsAiHost(window.location.hostname === "nizafa-ai.netlify.app");
  }, []);

  if (isAiHost) return null;

  return (
    <footer className="container footer">
      <strong>Nizafa</strong> — YouTube SEO &amp; Growth Tool. Built from
      live public data and the YouTube Data API.{" "}
      <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms</a>
    </footer>
  );
}
