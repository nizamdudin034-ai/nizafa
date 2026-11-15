"use client";

// Registers the PWA service worker (app-shell caching only —
// the worker never caches API responses). Safe to no-op in browsers
// without service-worker support.
import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Offline support is a bonus; a failed registration must not
        // break the app.
      });
    }
  }, []);
  return null;
}
