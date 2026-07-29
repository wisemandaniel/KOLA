"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export default function AdminLoginClient({ returnTo }: { returnTo: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/bootstrap-admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, returnTo }),
      });
      const result = (await response.json()) as { redirectTo?: string; error?: string };
      if (!response.ok || !result.redirectTo) {
        throw new Error(result.error ?? "Administrator sign-in failed.");
      }
      window.location.assign(result.redirectTo);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Administrator sign-in failed.");
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <header className="auth-header">
        <Link className="pro-logo" href="/">
          <span>k</span>
          kola
        </Link>
        <Link href="/login" className="auth-back-link">Back to regular sign-in</Link>
      </header>
      <div className="auth-shell">
        <section className="auth-card motion-in">
          <div className="auth-card-heading">
            <span className="auth-kicker">Administrator access</span>
            <h1>Open the Kola dashboard</h1>
            <p>This temporary login uses credentials stored only in Cloudflare secrets.</p>
          </div>
          <form className="auth-form" onSubmit={submit}>
            <label htmlFor="admin-email">Email</label>
            <input
              id="admin-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <label htmlFor="admin-password">Password</label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            {error && <div className="auth-error">{error}</div>}
            <button className="auth-primary" disabled={busy || !email || !password}>
              {busy ? "Signing in…" : "Sign in as administrator"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
