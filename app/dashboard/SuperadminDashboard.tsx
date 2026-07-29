"use client";

import Link from "next/link";
import {
  Bell, Bike, Boxes, CircleDollarSign, ClipboardList, FileClock, Headphones,
  Home, Loader2, Package, RefreshCw, Search, Settings, ShieldCheck, Store,
  UserRound, Users, WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type SuperadminActor = { displayName: string; email: string; city?: string };
type Section = "overview" | "users" | "vendors" | "products" | "orders" | "deliveries" | "payments" | "support" | "settings" | "audit";
type Row = Record<string, unknown>;
type Payload = {
  section: Section;
  metrics?: { users:number;vendors:number;products:number;orders:number;revenue:number;openTickets:number;activeDeliveries:number };
  recentUsers?: Row[];
  rows?: Row[];
  actorId?: string;
  actorLevel?: string;
  integrations?: Record<string, boolean>;
  error?: string;
};

const sections: Array<{ id: Section; label: string; icon: React.ReactNode }> = [
  { id: "overview", label: "Platform", icon: <Home /> },
  { id: "users", label: "Users", icon: <Users /> },
  { id: "vendors", label: "Vendors", icon: <Store /> },
  { id: "products", label: "Products", icon: <Package /> },
  { id: "orders", label: "Orders", icon: <ClipboardList /> },
  { id: "deliveries", label: "Deliveries", icon: <Bike /> },
  { id: "payments", label: "Payments", icon: <WalletCards /> },
  { id: "support", label: "Support", icon: <Headphones /> },
  { id: "settings", label: "Settings", icon: <Settings /> },
  { id: "audit", label: "Audit logs", icon: <FileClock /> },
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

  return <main className="app-frame">
    <aside className="app-sidebar">
      <Link className="app-logo" href="/"><span>k</span><b>kola</b></Link>
      <div className="workspace-label"><span>Superadmin console</span></div>
      <nav>{sections.map((item) => <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => { setQuery(""); setSection(item.id); }}>{item.icon}<span>{item.label}</span></button>)}</nav>
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
        {loading ? <div className="platform-loading"><Loader2 />Loading {section}</div> : section === "overview" ? <Overview payload={payload} /> : section === "settings" ? <SettingsPanel integrations={payload?.integrations ?? {}} /> : <>
          <div className="page-title"><div><span>ADMIN CONTROL PLANE</span><h1>{title(section)}</h1><p>Search, inspect, and manage Kola platform records.</p></div></div>
          <div className="catalogue-tools"><div className="search-field"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${section}`} /></div></div>
          {section === "users" && <UsersPanel rows={rows} actorId={String(payload?.actorId ?? "")} busyId={busyId} run={run} />}
          {section === "vendors" && <VendorsPanel rows={rows} busyId={busyId} run={run} />}
          {section === "products" && <ProductsPanel rows={rows} busyId={busyId} run={run} />}
          {section === "orders" && <OrdersPanel rows={rows} busyId={busyId} run={run} />}
          {section === "deliveries" && <DeliveriesPanel rows={rows} busyId={busyId} run={run} />}
          {section === "payments" && <PaymentsPanel rows={rows} busyId={busyId} run={run} />}
          {section === "support" && <SupportPanel rows={rows} busyId={busyId} run={run} />}
          {section === "audit" && <AuditPanel rows={rows} />}
        </>}
      </div>
    </section>
    {notice && <div className="app-toast"><ShieldCheck size={16} />{notice}</div>}
  </main>;
}

function title(value: string) { return value.split("_").map((word) => word[0].toUpperCase() + word.slice(1)).join(" "); }
function formatDate(value: unknown) { const date = new Date(Number(value)); return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleString(); }

function Overview({ payload }: { payload: Payload | null }) {
  const metrics = payload?.metrics ?? { users:0,vendors:0,products:0,orders:0,revenue:0,openTickets:0,activeDeliveries:0 };
  return <>
    <div className="page-title"><div><span>PLATFORM OVERVIEW</span><h1>Kola operations</h1><p>Live totals from your Cloudflare D1 database.</p></div></div>
    <div className="metrics">
      <Metric label="Users" value={String(metrics.users)} note="Registered accounts" icon={<Users />} />
      <Metric label="Vendors" value={String(metrics.vendors)} note="Business profiles" icon={<Store />} />
      <Metric label="Products" value={String(metrics.products)} note="Catalogue items" icon={<Boxes />} />
      <Metric label="Orders" value={String(metrics.orders)} note="Platform orders" icon={<ClipboardList />} />
      <Metric label="Active deliveries" value={String(metrics.activeDeliveries)} note="Still moving" icon={<Bike />} />
      <Metric label="Open tickets" value={String(metrics.openTickets)} note="Need attention" icon={<Headphones />} />
      <Metric label="Paid volume" value={`${metrics.revenue.toLocaleString()} FCFA`} note="Confirmed payments" icon={<CircleDollarSign />} />
    </div>
    <section className="surface"><div className="surface-head"><div><h2>Recent users</h2><span>Newest accounts in Kola</span></div></div><div className="order-list">{(payload?.recentUsers ?? []).map((user) => <article className="order-item" key={String(user.id)}><div className="order-id"><span><Users /></span><div><b>{String(user.display_name ?? "Unnamed user")}</b><small>{String(user.email ?? "No email")}</small></div></div><div className="order-value"><b>{String(user.active_role ?? "customer")}</b><small>{String(user.account_status ?? "active")}</small></div></article>)}</div></section>
  </>;
}

function Metric({ label, value, note, icon }: { label:string;value:string;note:string;icon:React.ReactNode }) { return <article className="metric"><span>{label}</span><b>{value}</b><small>{note}</small><i>{icon}</i></article>; }
function Empty({ text, icon }: { text:string;icon:React.ReactNode }) { return <div className="empty"><span>{icon}</span><b>Nothing here yet</b><p>{text}</p></div>; }

function UsersPanel({ rows, actorId, busyId, run }: { rows:Row[];actorId:string;busyId:string;run:(id:string,action:string,values:Row,success:string)=>void }) {
  return <section className="surface"><div className="surface-head"><div><h2>User management</h2><span>{rows.length} accounts</span></div></div><div className="order-list">{rows.map((user) => { const id=String(user.id); const level=String(user.admin_level ?? "none"); const status=String(user.account_status ?? "active"); return <article className="order-item" key={id}><div className="order-id"><span><Users /></span><div><b>{String(user.display_name ?? "Unnamed user")}{id===actorId?" (you)":""}</b><small>{String(user.email ?? user.phone ?? "No contact")}</small></div></div><div className="order-value"><b>{String(user.active_role ?? "customer")}</b><small>{status} · {level}</small></div><div className="row-actions"><select disabled={busyId===id || id===actorId} value={level} onChange={(event)=>void run(id,"user_role",{level:event.target.value},"Administrator role updated")}><option value="none">No admin</option><option value="admin">Admin</option><option value="superadmin">Superadmin</option></select><button disabled={busyId===id || id===actorId} className={status==="active"?"archive-button":"restore-button"} onClick={()=>void run(id,"user_status",{status:status==="active"?"suspended":"active"},status==="active"?"User suspended":"User reactivated")}>{status==="active"?"Suspend":"Reactivate"}</button></div></article>; })}</div></section>;
}

function VendorsPanel({ rows, busyId, run }: PanelProps) { return <section className="surface"><Header name="Vendor management" count={rows.length} /><div className="order-list">{rows.length ? rows.map((vendor) => { const id=String(vendor.id); const status=String(vendor.status ?? "pending"); return <article className="order-item" key={id}><div className="order-id"><span><Store /></span><div><b>{String(vendor.name ?? "Unnamed vendor")}</b><small>{String(vendor.owner_name ?? "No owner")} · {String(vendor.city ?? "No city")}</small></div></div><div className="order-value"><b>{Number(vendor.products ?? 0)} products</b><small>{Number(vendor.orders ?? 0)} orders · {status}</small></div><div className="row-actions"><select disabled={busyId===id} value={status} onChange={(event)=>void run(id,"vendor_status",{status:event.target.value},"Vendor status updated")}><option value="pending">Pending</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="rejected">Rejected</option></select></div></article>; }) : <Empty text="No vendor records yet." icon={<Store />} />}</div></section>; }
function ProductsPanel({ rows, busyId, run }: PanelProps) { return <section className="surface"><Header name="Product moderation" count={rows.length} /><div className="order-list">{rows.length ? rows.map((product) => { const id=String(product.id); const active=Boolean(product.active); return <article className="order-item" key={id}><div className="order-id"><span><Package /></span><div><b>{String(product.name ?? "Unnamed product")}</b><small>{String(product.vendor_name ?? "Unknown vendor")} · {String(product.category ?? "Other")}</small></div></div><div className="order-value"><b>{Number(product.price ?? 0).toLocaleString()} FCFA</b><small>{Number(product.stock ?? 0)} in stock · {active?"active":"disabled"}{product.image_key?" · image":" · no image"}</small></div><div className="row-actions"><button disabled={busyId===id} className={active?"archive-button":"restore-button"} onClick={()=>void run(id,"product_status",{active:!active},active?"Product disabled":"Product restored")}>{active?"Disable":"Restore"}</button></div></article>; }) : <Empty text="No product records yet." icon={<Package />} />}</div></section>; }

function OrdersPanel({ rows, busyId, run }: PanelProps) { const statuses=["pending","accepted","preparing","ready","picked_up","delivered","cancelled","rejected"]; return <section className="surface"><Header name="Order operations" count={rows.length} /><div className="order-list">{rows.length ? rows.map((order) => { const id=String(order.id); const status=String(order.status ?? "pending"); return <article className="order-item" key={id}><div className="order-id"><span><ClipboardList /></span><div><b>{id}</b><small>{String(order.customer_name ?? "Unknown customer")} · {String(order.vendor_name ?? "Unknown vendor")}</small></div></div><div className="order-value"><b>{Number(order.total ?? 0).toLocaleString()} FCFA</b><small>{String(order.payment_status ?? "unpaid")} · {String(order.delivery_status ?? "no delivery")}</small></div><div className="row-actions"><select disabled={busyId===id} value={status} onChange={(event)=>void run(id,"order_status",{status:event.target.value},"Order status updated")}>{statuses.map((item)=><option key={item} value={item}>{title(item)}</option>)}</select></div></article>; }) : <Empty text="No orders yet." icon={<ClipboardList />} />}</div></section>; }
function DeliveriesPanel({ rows, busyId, run }: PanelProps) { const statuses=["unassigned","accepted","picked_up","delivered","cancelled"]; return <section className="surface"><Header name="Delivery operations" count={rows.length} /><div className="order-list">{rows.length ? rows.map((delivery) => { const id=String(delivery.id); const status=String(delivery.status ?? "unassigned"); return <article className="order-item" key={id}><div className="order-id"><span><Bike /></span><div><b>Order {String(delivery.order_id ?? "Unknown")}</b><small>{String(delivery.courier_name ?? "Unassigned rider")} · {String(delivery.dropoff_address ?? "No destination")}</small></div></div><div className="order-value"><b>{Number(delivery.courier_fee ?? 0).toLocaleString()} FCFA</b><small>{Number(delivery.distance_km ?? 0).toFixed(1)} km · {status}</small></div><div className="row-actions"><select disabled={busyId===id} value={status} onChange={(event)=>void run(id,"delivery_status",{status:event.target.value},"Delivery status updated")}>{statuses.map((item)=><option key={item} value={item}>{title(item)}</option>)}</select></div></article>; }) : <Empty text="No deliveries yet." icon={<Bike />} />}</div></section>; }
function PaymentsPanel({ rows, busyId, run }: PanelProps) { const statuses=["pending_provider","initiating","paid","failed","configuration_required"]; return <section className="surface"><Header name="Payment operations" count={rows.length} /><div className="order-list">{rows.length ? rows.map((payment) => { const id=String(payment.id); const status=String(payment.status ?? "pending_provider"); return <article className="order-item" key={id}><div className="order-id"><span><WalletCards /></span><div><b>{String(payment.order_id ?? "No order")}</b><small>{String(payment.user_name ?? "Unknown user")} · {String(payment.provider ?? "unknown provider")}</small></div></div><div className="order-value"><b>{Number(payment.amount ?? 0).toLocaleString()} FCFA</b><small>{status}{payment.failure_reason?` · ${String(payment.failure_reason)}`:""}</small></div><div className="row-actions"><select disabled={busyId===id} value={status} onChange={(event)=>void run(id,"payment_status",{status:event.target.value},"Payment status updated")}>{statuses.map((item)=><option key={item} value={item}>{title(item)}</option>)}</select></div></article>; }) : <Empty text="No payment attempts yet." icon={<WalletCards />} />}</div></section>; }
function SupportPanel({ rows, busyId, run }: PanelProps) { return <section className="surface"><Header name="Support queue" count={rows.length} /><div className="order-list">{rows.length ? rows.map((ticket) => { const id=String(ticket.id); const status=String(ticket.status ?? "open"); const priority=String(ticket.priority ?? "normal"); return <article className="order-item" key={id}><div className="order-id"><span><Headphones /></span><div><b>{String(ticket.subject ?? "Untitled ticket")}</b><small>{String(ticket.user_name ?? ticket.user_email ?? "Unknown user")} · {String(ticket.category ?? "general")}</small></div></div><div className="order-value"><b>{priority}</b><small>{status} · {formatDate(ticket.updated_at)}</small></div><div className="row-actions"><select disabled={busyId===id} value={priority} onChange={(event)=>void run(id,"ticket_status",{status,priority:event.target.value},"Ticket priority updated")}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select><select disabled={busyId===id} value={status} onChange={(event)=>void run(id,"ticket_status",{status:event.target.value,priority},"Ticket status updated")}><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select></div></article>; }) : <Empty text="No support tickets yet." icon={<Headphones />} />}</div></section>; }
function AuditPanel({ rows }: { rows:Row[] }) { return <section className="surface"><Header name="Audit trail" count={rows.length} /><div className="order-list">{rows.length ? rows.map((entry) => <article className="order-item" key={String(entry.id)}><div className="order-id"><span><FileClock /></span><div><b>{String(entry.action ?? "Unknown action")}</b><small>{String(entry.actor_name ?? "System")} · {String(entry.entity_type ?? "record")} {String(entry.entity_id ?? "")}</small></div></div><div className="order-value"><b>{formatDate(entry.created_at)}</b><small>{String(entry.metadata ?? "{}")}</small></div></article>) : <Empty text="No audited actions yet." icon={<FileClock />} />}</div></section>; }
function SettingsPanel({ integrations }: { integrations:Record<string,boolean> }) { return <><div className="page-title"><div><span>PLATFORM SETTINGS</span><h1>Integration readiness</h1><p>Configuration status only. Secret values remain hidden in Cloudflare.</p></div></div><section className="surface"><div className="order-list">{Object.entries(integrations).map(([name, ready]) => <article className="order-item" key={name}><div className="order-id"><span><Settings /></span><div><b>{title(name)}</b><small>Runtime integration</small></div></div><div className="order-value"><b>{ready?"Ready":"Not configured"}</b><small>{ready?"Available to Kola":"Add the required Cloudflare secrets"}</small></div></article>)}</div></section></>; }

type PanelProps = { rows:Row[];busyId:string;run:(id:string,action:string,values:Row,success:string)=>void };
function Header({ name, count }: { name:string;count:number }) { return <div className="surface-head"><div><h2>{name}</h2><span>{count} records</span></div></div>; }
