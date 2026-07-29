"use client";

import Link from "next/link";
import { Bell, Home, ShieldCheck, UserRound, Users, Store, ClipboardList, CircleDollarSign, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

type SuperadminActor = {
  displayName: string;
  email: string;
  city?: string;
};

type Overview = {
  metrics: { users: number; vendors: number; orders: number; revenue: number };
  recentUsers: Array<Record<string, unknown>>;
  error?: string;
};

export default function SuperadminDashboard({ actor }: { actor: SuperadminActor }) {
  const [notice, setNotice] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3000);
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/admin-overview", { cache: "no-store" });
        const text = await response.text();
        const result = text ? (JSON.parse(text) as Overview) : null;
        if (!response.ok || !result) throw new Error(result?.error ?? "Could not load platform overview.");
        if (active) setOverview(result);
      } catch (error) {
        if (active) showNotice(error instanceof Error ? error.message : "Could not load platform overview.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  const initials = actor.displayName
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <main className="app-frame">
      <aside className="app-sidebar">
        <Link className="app-logo" href="/">
          <span>k</span>
          <b>kola</b>
        </Link>
        <div className="workspace-label"><span>Superadmin console</span></div>
        <nav>
          <button className="active"><Home /><span>Platform</span></button>
          <button onClick={() => showNotice("Account settings are available from the profile menu.")}>
            <UserRound /><span>Account</span>
          </button>
        </nav>
        <div className="sidebar-help">
          <ShieldCheck />
          <div><b>Protected access</b><span>Cloudflare secret login</span></div>
        </div>
      </aside>

      <section className="app-main">
        <header className="app-header">
          <div className="header-location">
            <ShieldCheck />
            <div><span>Platform operations</span><b>{actor.city || "Cameroon"}</b></div>
          </div>
          <div className="header-actions">
            <button className="icon-button" aria-label="Notifications"><Bell /></button>
            <div className="header-profile">
              <span>{initials || "KA"}</span>
              <div><b>{actor.displayName}</b><small>Superadmin</small></div>
            </div>
          </div>
        </header>
        <div className="app-content">
          {loading ? (
            <div className="platform-loading"><Loader2 />Loading platform operations</div>
          ) : overview ? (
            <>
              <div className="page-title"><div><span>PLATFORM OVERVIEW</span><h1>Kola operations</h1><p>Live totals from your Cloudflare D1 database.</p></div></div>
              <div className="metrics">
                <article className="metric"><span>Users</span><b>{overview.metrics.users}</b><small>Registered accounts</small></article>
                <article className="metric"><span>Vendors</span><b>{overview.metrics.vendors}</b><small>Business profiles</small></article>
                <article className="metric"><span>Orders</span><b>{overview.metrics.orders}</b><small>Platform orders</small></article>
                <article className="metric"><span>Paid volume</span><b>{overview.metrics.revenue.toLocaleString()} FCFA</b><small>Confirmed payments</small></article>
              </div>
              <section className="surface">
                <div className="surface-head"><div><h2>Recent users</h2><span>Newest accounts in Kola</span></div></div>
                {overview.recentUsers.length ? (
                  <div className="order-list">
                    {overview.recentUsers.map((user) => (
                      <article className="order-item" key={String(user.id)}>
                        <div className="order-id"><span><Users /></span><div><b>{String(user.display_name ?? "Unnamed user")}</b><small>{String(user.email ?? "No email")}</small></div></div>
                        <div className="order-value"><b>{String(user.active_role ?? "customer")}</b><small>{String(user.account_status ?? "active")}</small></div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty"><span><Store /></span><b>No users yet</b><p>New accounts will appear here.</p></div>
                )}
              </section>
            </>
          ) : (
            <div className="empty"><span><ClipboardList /></span><b>Overview unavailable</b><p>Refresh after the next deployment.</p></div>
          )}
        </div>
      </section>

      {notice && <div className="app-toast"><CircleDollarSign size={16} />{notice}</div>}
    </main>
  );
}
