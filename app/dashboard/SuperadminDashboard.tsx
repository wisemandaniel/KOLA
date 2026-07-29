"use client";

import Link from "next/link";
import {
  Bell, Boxes, CircleDollarSign, ClipboardList, Home, Loader2, Package,
  RefreshCw, Search, ShieldCheck, Store, UserRound, Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type SuperadminActor = { displayName: string; email: string; city?: string };
type Section = "overview" | "users" | "vendors" | "products";
type Row = Record<string, unknown>;
type Payload = {
  section: Section;
  metrics?: { users:number;vendors:number;products:number;orders:number;revenue:number };
  recentUsers?: Row[];
  rows?: Row[];
  actorId?: string;
  actorLevel?: string;
  error?: string;
};

const sections: Array<{ id: Section; label: string; icon: React.ReactNode }> = [
  { id: "overview", label: "Platform", icon: <Home /> },
  { id: "users", label: "Users", icon: <Users /> },
  { id: "vendors", label: "Vendors", icon: <Store /> },
  { id: "products", label: "Products", icon: <Package /> },
];

async function adminAction(action: string, payload: Row) {
  const response = await fetch("/api/admin-console", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const text = await response.text();
  const result = text ? JSON.parse(text) as Row : {};
  if (!response.ok) throw new Error(String(result.error ?? "Admin action failed"));
  return result;
}

export default function SuperadminDashboard({ actor }: { actor: SuperadminActor }) {
  const [section, setSection] = useState<Section>("overview");
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3200);
  }, []);

  const load = useCallback(async (nextSection = section) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin-console?section=${nextSection}`, { cache: "no-store" });
      const text = await response.text();
      const result = text ? JSON.parse(text) as Payload : null;
      if (!response.ok || !result) throw new Error(result?.error ?? "Could not load admin data");
      setPayload(result);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Could not load admin data");
    } finally {
      setLoading(false);
    }
  }, [section, showNotice]);

  useEffect(() => { void load(section); }, [section, load]);

  const run = async (id: string, action: string, values: Row, success: string) => {
    setBusyId(id);
    try {
      await adminAction(action, { id, ...values });
      showNotice(success);
      await load(section);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusyId("");
    }
  };

  const rows = useMemo(() => {
    const source = payload?.rows ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle) return source;
    return source.filter((row) => Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(needle)));
  }, [payload?.rows, query]);

  const initials = actor.displayName.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  return (
    <main className="app-frame">
      <aside className="app-sidebar">
        <Link className="app-logo" href="/"><span>k</span><b>kola</b></Link>
        <div className="workspace-label"><span>Superadmin console</span></div>
        <nav>
          {sections.map((item) => (
            <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => { setQuery(""); setSection(item.id); }}>
              {item.icon}<span>{item.label}</span>
            </button>
          ))}
          <button onClick={() => showNotice("Account controls are next in the admin roadmap.")}><UserRound /><span>Account</span></button>
        </nav>
        <div className="sidebar-help"><ShieldCheck /><div><b>Protected access</b><span>Cloudflare secret login</span></div></div>
      </aside>

      <section className="app-main">
        <header className="app-header">
          <div className="header-location"><ShieldCheck /><div><span>Platform operations</span><b>{actor.city || "Cameroon"}</b></div></div>
          <div className="header-actions">
            <button className="icon-button" aria-label="Refresh" onClick={() => void load(section)}><RefreshCw /></button>
            <button className="icon-button" aria-label="Notifications"><Bell /></button>
            <div className="header-profile"><span>{initials || "KA"}</span><div><b>{actor.displayName}</b><small>Superadmin</small></div></div>
          </div>
        </header>

        <div className="app-content">
          {loading ? <div className="platform-loading"><Loader2 />Loading {section}</div> : section === "overview" ? (
            <Overview payload={payload} />
          ) : (
            <>
              <div className="page-title"><div><span>ADMIN CONTROL PLANE</span><h1>{section[0].toUpperCase() + section.slice(1)}</h1><p>Search, inspect, and manage Kola platform records.</p></div></div>
              <div className="catalogue-tools"><div className="search-field"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${section}`} /></div></div>
              {section === "users" && <UsersPanel rows={rows} actorId={String(payload?.actorId ?? "")} busyId={busyId} run={run} />}
              {section === "vendors" && <VendorsPanel rows={rows} busyId={busyId} run={run} />}
              {section === "products" && <ProductsPanel rows={rows} busyId={busyId} run={run} />}
            </>
          )}
        </div>
      </section>
      {notice && <div className="app-toast"><ShieldCheck size={16} />{notice}</div>}
    </main>
  );
}

function Overview({ payload }: { payload: Payload | null }) {
  const metrics = payload?.metrics ?? { users:0,vendors:0,products:0,orders:0,revenue:0 };
  return <>
    <div className="page-title"><div><span>PLATFORM OVERVIEW</span><h1>Kola operations</h1><p>Live totals from your Cloudflare D1 database.</p></div></div>
    <div className="metrics">
      <Metric label="Users" value={String(metrics.users)} note="Registered accounts" icon={<Users />} />
      <Metric label="Vendors" value={String(metrics.vendors)} note="Business profiles" icon={<Store />} />
      <Metric label="Products" value={String(metrics.products)} note="Catalogue items" icon={<Boxes />} />
      <Metric label="Orders" value={String(metrics.orders)} note="Platform orders" icon={<ClipboardList />} />
      <Metric label="Paid volume" value={`${metrics.revenue.toLocaleString()} FCFA`} note="Confirmed payments" icon={<CircleDollarSign />} />
    </div>
    <section className="surface"><div className="surface-head"><div><h2>Recent users</h2><span>Newest accounts in Kola</span></div></div>
      <div className="order-list">{(payload?.recentUsers ?? []).map((user) => <article className="order-item" key={String(user.id)}><div className="order-id"><span><Users /></span><div><b>{String(user.display_name ?? "Unnamed user")}</b><small>{String(user.email ?? "No email")}</small></div></div><div className="order-value"><b>{String(user.active_role ?? "customer")}</b><small>{String(user.account_status ?? "active")}</small></div></article>)}</div>
    </section>
  </>;
}

function Metric({ label, value, note, icon }: { label:string;value:string;note:string;icon:React.ReactNode }) {
  return <article className="metric"><span>{label}</span><b>{value}</b><small>{note}</small><i>{icon}</i></article>;
}

function UsersPanel({ rows, actorId, busyId, run }: { rows:Row[];actorId:string;busyId:string;run:(id:string,action:string,values:Row,success:string)=>void }) {
  return <section className="surface"><div className="surface-head"><div><h2>User management</h2><span>{rows.length} accounts</span></div></div><div className="order-list">
    {rows.map((user) => { const id=String(user.id); const level=String(user.admin_level ?? "none"); const status=String(user.account_status ?? "active"); return <article className="order-item" key={id}>
      <div className="order-id"><span><Users /></span><div><b>{String(user.display_name ?? "Unnamed user")}{id===actorId?" (you)":""}</b><small>{String(user.email ?? user.phone ?? "No contact")}</small></div></div>
      <div className="order-value"><b>{String(user.active_role ?? "customer")}</b><small>{status} · {level}</small></div>
      <div className="row-actions">
        <select disabled={busyId===id || id===actorId} value={level} onChange={(event)=>void run(id,"user_role",{level:event.target.value},"Administrator role updated")}><option value="none">No admin</option><option value="admin">Admin</option><option value="superadmin">Superadmin</option></select>
        <button disabled={busyId===id || id===actorId} className={status==="active"?"archive-button":"restore-button"} onClick={()=>void run(id,"user_status",{status:status==="active"?"suspended":"active"},status==="active"?"User suspended":"User reactivated")}>{status==="active"?"Suspend":"Reactivate"}</button>
      </div>
    </article>; })}
  </div></section>;
}

function VendorsPanel({ rows, busyId, run }: { rows:Row[];busyId:string;run:(id:string,action:string,values:Row,success:string)=>void }) {
  return <section className="surface"><div className="surface-head"><div><h2>Vendor management</h2><span>{rows.length} businesses</span></div></div><div className="order-list">
    {rows.length ? rows.map((vendor) => { const id=String(vendor.id); const status=String(vendor.status ?? "pending"); return <article className="order-item" key={id}>
      <div className="order-id"><span><Store /></span><div><b>{String(vendor.name ?? "Unnamed vendor")}</b><small>{String(vendor.owner_name ?? "No owner")} · {String(vendor.city ?? "No city")}</small></div></div>
      <div className="order-value"><b>{Number(vendor.products ?? 0)} products</b><small>{Number(vendor.orders ?? 0)} orders · {status}</small></div>
      <div className="row-actions"><select disabled={busyId===id} value={status} onChange={(event)=>void run(id,"vendor_status",{status:event.target.value},"Vendor status updated")}><option value="pending">Pending</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="rejected">Rejected</option></select></div>
    </article>; }) : <Empty text="No vendor records yet." icon={<Store />} />}
  </div></section>;
}

function ProductsPanel({ rows, busyId, run }: { rows:Row[];busyId:string;run:(id:string,action:string,values:Row,success:string)=>void }) {
  return <section className="surface"><div className="surface-head"><div><h2>Product moderation</h2><span>{rows.length} products</span></div></div><div className="order-list">
    {rows.length ? rows.map((product) => { const id=String(product.id); const active=Boolean(product.active); return <article className="order-item" key={id}>
      <div className="order-id"><span><Package /></span><div><b>{String(product.name ?? "Unnamed product")}</b><small>{String(product.vendor_name ?? "Unknown vendor")} · {String(product.category ?? "Other")}</small></div></div>
      <div className="order-value"><b>{Number(product.price ?? 0).toLocaleString()} FCFA</b><small>{Number(product.stock ?? 0)} in stock · {active?"active":"disabled"}{product.image_key?" · image":" · no image"}</small></div>
      <div className="row-actions"><button disabled={busyId===id} className={active?"archive-button":"restore-button"} onClick={()=>void run(id,"product_status",{active:!active},active?"Product disabled":"Product restored")}>{active?"Disable":"Restore"}</button></div>
    </article>; }) : <Empty text="No product records yet." icon={<Package />} />}
  </div></section>;
}

function Empty({ text, icon }: { text:string;icon:React.ReactNode }) { return <div className="empty"><span>{icon}</span><b>Nothing here yet</b><p>{text}</p></div>; }
