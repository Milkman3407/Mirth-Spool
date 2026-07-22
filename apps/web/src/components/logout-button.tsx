"use client";

import { useState } from "react";

export function LogoutButton() {
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      await fetch("/api/auth/sign-out", {
        headers: { "content-type": "application/json" },
        method: "POST",
      });
    } finally {
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
