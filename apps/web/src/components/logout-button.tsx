"use client";

import { useState } from "react";

import { clearOriginCaches } from "./pwa-lifecycle";

export function LogoutButton() {
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    document.documentElement.dataset.mirthspoolClearingSession = "true";
    try {
      await fetch("/api/auth/sign-out", {
        headers: { "content-type": "application/json" },
        method: "POST",
      });
    } finally {
      await clearOriginCaches().catch(() => undefined);
      window.location.assign("/login");
    }
  }

  return (
    <button
      className="nav-button"
      disabled={pending}
      onClick={logout}
      type="button"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
