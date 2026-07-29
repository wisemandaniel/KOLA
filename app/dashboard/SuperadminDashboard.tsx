"use client";

import Link from "next/link";
import { Bell, Home, ShieldCheck, UserRound } from "lucide-react";
import { useState } from "react";
import { AdminHome } from "./PlatformCenter";

type SuperadminActor = {
  displayName: string;
  email: string;
  city?: string;
};

export default function SuperadminDashboard({ actor }: { actor: SuperadminActor }) {
  const [notice, setNotice] = useState("");

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3000);
  };

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
          <AdminHome onNotice={showNotice} />
        </div>
      </section>

      {notice && <div className="app-toast"><ShieldCheck size={16} />{notice}</div>}
    </main>
  );
}
