"use client";

import Link from "next/link";
import { ArrowLeft, Clock3, Loader2, RefreshCw, ShieldAlert, ShieldCheck, Trash2, UserRoundX } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Row = Record<string, unknown>;
type SecurityPayload = {
  metrics: { activeSessions: number; expiredSessions: number; activeRateLimits: number };
  sessions: Row[];
  events: Row[];
  actorId: string;
  error?: string;
};

async function securityAction(action: string, id = "") {
  const response = await fetch("/api/admin-security", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, id }),
  });
  const text = await response.text();
  const result = text ? JSON.parse(text) as Row : {};
  if (!response.ok) throw new Error(String(result.error ?? "Security action failed"));
  return result;
}

function formatDate(value: unknown) {
  const date = new Date(Number(value));
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

export default function SecurityClient({ displayName }: { displayName: string }) {
  const [data, setData] = useState<SecurityPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"sessions" | "events">("sessions");

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3200);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin-security", { cache: "no-store" });
      const text = await response.text();
      const result = text ? JSON.parse(text) as SecurityPayload : null;
      if (!response.ok || !result) throw new Error(result?.error ?? "Could not load security operations");
      setData(result);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Could not load security operations");
    } finally {
      setLoading(false);
    }
  }, [showNotice]);

  useEffect(() => { void load(); }, [load]);

  const run = async (key: string, action: string, id: string, success: string) => {
    setBusy(key);
    try {
      await securityAction(action, id);
      showNotice(success);
      await load();
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Security action failed");
    } finally {
      setBusy("");
    }
  };

  return <main className="app-frame">
    <aside className="app-sidebar">
      <Link className="app-logo" href="/"><span>k</span><b>kola</b></Link>
      <div className="workspace-label"><span>Security operations</span></div>
      <nav>
        <button className={tab === "sessions" ? "active" : ""} onClick={() => setTab("sessions")}><ShieldCheck /><span>Sessions</span></button>
        <button className={tab === "events" ? "active" : ""} onClick={() => setTab("events")}><ShieldAlert /><span>Security events</span></button>
        <Link href="/dashboard"><ArrowLeft /><span>Back to dashboard</span></Link>
      </nav>
      <div className="sidebar-help"><ShieldCheck /><div><b>{displayName}</b><span>Superadmin security scope</span></div></div>
    </aside>

    <section className="app-main">
      <header className="app-header">
        <div className="header-location"><ShieldCheck /><div><span>Access control</span><b>Kola security center</b></div></div>
        <div className="header-actions">
          <button className="icon-button" aria-label="Refresh" onClick={() => void load()}><RefreshCw /></button>
          <Link className="secondary-button small" href="/dashboard"><ArrowLeft />Dashboard</Link>
        </div>
      </header>

      <div className="app-content">
        {loading ? <div className="platform-loading"><Loader2 />Loading security operations</div> : data ? <>
          <div className="page-title"><div><span>SECURITY CENTER</span><h1>Sessions and threat signals</h1><p>Revoke access, inspect authentication events, and clean expired records.</p></div><button className="secondary-button" disabled={busy === "cleanup"} onClick={() => void run("cleanup", "cleanup_expired", "", "Expired authentication records cleaned")}><Trash2 />Clean expired</button></div>
          <div className="metrics">
            <article className="metric"><span>Active sessions</span><b>{data.metrics.activeSessions}</b><small>Currently valid login sessions</small><i><ShieldCheck /></i></article>
            <article className="metric"><span>Expired sessions</span><b>{data.metrics.expiredSessions}</b><small>Ready for cleanup</small><i><Clock3 /></i></article>
            <article className="metric"><span>Rate-limit windows</span><b>{data.metrics.activeRateLimits}</b><small>Recent repeated requests</small><i><ShieldAlert /></i></article>
          </div>

          {tab === "sessions" ? <section className="surface"><div className="surface-head"><div><h2>Active sessions</h2><span>{data.sessions.length} records</span></div></div><div className="order-list">
            {data.sessions.length ? data.sessions.map((session) => { const id = String(session.id); const userId = String(session.user_id); const self = userId === data.actorId; return <article className="order-item" key={id}><div className="order-id"><span><ShieldCheck /></span><div><b>{String(session.display_name ?? "Unknown user")}{self ? " (you)" : ""}</b><small>{String(session.email ?? "No email")} · {String(session.active_role ?? "customer")}</small></div></div><div className="order-value"><b>Expires {formatDate(session.expires_at)}</b><small>Created {formatDate(session.created_at)}</small></div><div className="row-actions"><button className="archive-button" disabled={busy === id} onClick={() => void run(id, "revoke_session", id, self ? "Current session revoked. Reload to sign in again." : "Session revoked")}><UserRoundX />Revoke</button>{!self && <button className="secondary-button small" disabled={busy === userId} onClick={() => void run(userId, "revoke_user_sessions", userId, "All sessions for this user were revoked")}>Revoke all</button>}</div></article>; }) : <div className="empty"><span><ShieldCheck /></span><b>No active sessions</b><p>No valid sessions were found.</p></div>}
          </div></section> : <section className="surface"><div className="surface-head"><div><h2>Recent security events</h2><span>{data.events.length} records</span></div></div><div className="order-list">
            {data.events.length ? data.events.map((event) => <article className="order-item" key={String(event.id)}><div className="order-id"><span><ShieldAlert /></span><div><b>{String(event.event_type ?? "Unknown event")}</b><small>{String(event.display_name ?? event.email ?? "Anonymous")} · {String(event.severity ?? "info")}</small></div></div><div className="order-value"><b>{formatDate(event.created_at)}</b><small>{String(event.user_agent ?? "No user agent")}</small></div></article>) : <div className="empty"><span><ShieldAlert /></span><b>No security events</b><p>Authentication and rate-limit events will appear here.</p></div>}
          </div></section>}
        </> : <div className="empty"><span><ShieldAlert /></span><b>Security data unavailable</b><p>Refresh after the current deployment finishes.</p></div>}
      </div>
    </section>
    {notice && <div className="app-toast"><ShieldCheck size={16} />{notice}</div>}
  </main>;
}
