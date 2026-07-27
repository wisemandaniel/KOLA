"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Role = "customer" | "vendor" | "rider";
type Product = { id: string; name: string; vendor: string; price: number; stock: number; eta: string; rating: string; emoji: string; color: string };
type Order = { id: string; status: string; total: number; payment_status: string; delivery_address: string };
type Delivery = { id: string; order_id: string; status: string; courier_fee: number; distance_km: number; dropoff_address: string };
type Message = { who: string; text: string; time: string; kind: string };
type Workspace = { products: Product[]; orders: Order[]; deliveries: Delivery[]; messages: Message[]; actor?: { displayName: string } };

const fallbackProducts: Product[] = [
  { id: "prd_ndole", name: "Ndolé royal", vendor: "Chez Mado", price: 3500, stock: 24, eta: "25–35 min", rating: "4.9", emoji: "🍲", color: "#e7f0d8" },
  { id: "prd_market", name: "Panier marché frais", vendor: "Marché Central", price: 8500, stock: 12, eta: "40–55 min", rating: "4.8", emoji: "🥬", color: "#dceee4" },
  { id: "prd_shoes", name: "Sneakers Noki", vendor: "Bonamoussadi Style", price: 22000, stock: 8, eta: "Today", rating: "4.7", emoji: "👟", color: "#e5e4f2" },
  { id: "prd_dg", name: "Poulet DG", vendor: "La Marmite", price: 5000, stock: 18, eta: "30–40 min", rating: "4.9", emoji: "🍛", color: "#f4e3cf" },
];

const roleCopy = {
  customer: { eyebrow: "Good afternoon", title: "Everything you need,\ndelivered with care.", action: "Explore nearby" },
  vendor: { eyebrow: "Your business today", title: "Your shop is moving.", action: "Add a product" },
  rider: { eyebrow: "Online in Douala", title: "Ready for your\nnext delivery?", action: "Find a delivery" },
};

async function command(action: string, payload: Record<string, unknown> = {}) {
  const response = await fetch("/api/workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...payload }) });
  if (!response.ok) throw new Error("Action failed");
  return response.json();
}

export default function Home() {
  const [role, setRole] = useState<Role>("customer");
  const [tab, setTab] = useState("Home");
  const [data, setData] = useState<Workspace>({ products: fallbackProducts, orders: [], deliveries: [], messages: [] });
  const [cart, setCart] = useState<Product[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/workspace", { cache: "no-store" });
      if (!response.ok) return;
      const raw = await response.json();
      const colors = ["#e7f0d8", "#dceee4", "#e5e4f2", "#f4e3cf"];
      setData({
        actor: raw.actor,
        products: raw.products.map((p: Record<string, unknown>, i: number) => ({ id: String(p.id), name: String(p.name), vendor: "Chez Mado", price: Number(p.price), stock: Number(p.stock), eta: "25–40 min", rating: "4.9", emoji: String(p.emoji), color: colors[i % colors.length] })),
        orders: raw.orders,
        deliveries: raw.deliveries,
        messages: raw.messages.map((m: Record<string, unknown>) => ({ who: String(m.sender_name), text: String(m.body), time: new Date(Number(m.created_at)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), kind: String(m.sender_role) })),
      });
    } catch { /* preview continues with useful demo data */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  const notify = (text: string) => { setToast(text); window.setTimeout(() => setToast(""), 2600); };
  const view = roleCopy[role];
  const activeDelivery = data.deliveries[0];

  const placeOrder = async () => {
    if (!cart.length) return;
    setBusy(true);
    try {
      const result = await command("create_order", { items: cart.map((p) => ({ id: p.id, name: p.name, price: p.price, quantity: 1 })), paymentMethod: "mobile_money", address: "Bonapriso, Douala", notes: "Call at the gate" });
      setCart([]); setCheckoutOpen(false); notify(`Order ${result.id} placed. Dispatch is finding a rider.`); await refresh();
    } catch { notify("Could not place the order. Please try again."); } finally { setBusy(false); }
  };

  const acceptDelivery = async (delivery: Delivery) => {
    setBusy(true);
    try { await command("accept_delivery", { deliveryId: delivery.id }); notify(`Delivery ${delivery.order_id} accepted`); await refresh(); }
    catch { notify("This trip is no longer available."); } finally { setBusy(false); }
  };

  const updateDelivery = async (status: string) => {
    if (!activeDelivery) return;
    setBusy(true);
    try { await command("update_delivery", { deliveryId: activeDelivery.id, status }); notify(`Delivery updated: ${status.replaceAll("_", " ")}`); await refresh(); }
    catch { notify("Delivery update failed."); } finally { setBusy(false); }
  };

  return <main>
    <header className="topbar">
      <button className="brand" onClick={() => { setRole("customer"); setTab("Home"); }} aria-label="Kola home"><span className="brandmark">K</span><span>KOLA</span></button>
      <div className="location"><span>Delivering to</span><strong>Bonapriso, Douala⌄</strong></div>
      <div className="role-switch" aria-label="Choose app mode">{(["customer", "vendor", "rider"] as Role[]).map((item) => <button key={item} className={role === item ? "active" : ""} onClick={() => { setRole(item); setTab("Home"); }}>{item === "customer" ? "Buy" : item === "vendor" ? "Sell" : "Deliver"}</button>)}</div>
      {role === "customer" && <button className="basket-btn" onClick={() => setCheckoutOpen(true)}>Bag <b>{cart.length}</b></button>}
      <button className="round-btn" onClick={() => notify("You’re all caught up")}>🔔<i /></button>
      <button className="avatar">{data.actor?.displayName?.split(" ").map((p) => p[0]).join("").slice(0, 2) || "MN"}</button>
    </header>

    <div className="shell">
      <aside><nav>{[["Home", "⌂"], ["Orders", "▣"], ["Messages", "◌"], ["Wallet", "◫"], ["Account", "◎"]].map(([item, icon]) => <button key={item} className={tab === item ? "active" : ""} onClick={() => item === "Messages" ? setChatOpen(true) : setTab(item)}><span className="icon">{icon}</span>{item}{item === "Messages" && <b>{data.messages.length}</b>}</button>)}</nav><div className="support"><span>?</span><div><strong>Need help?</strong><small>English & Français</small></div></div></aside>
      <section className="content">
        {tab === "Home" && <>
          <div className="intro"><div><p>{view.eyebrow}, {data.actor?.displayName?.split(" ")[0] || "Mireille"}</p><h1>{view.title}</h1></div><button className="primary" onClick={() => role === "vendor" ? setProductOpen(true) : notify(role === "customer" ? "Showing nearby stores" : "Delivery requests updated")}>{view.action} <span>→</span></button></div>
          {role === "customer" && <CustomerHome products={data.products} onAdd={(p) => { setCart((c) => [...c, p]); notify(`${p.name} added to bag`); }} onChat={() => setChatOpen(true)} onToast={notify} />}
          {role === "vendor" && <VendorHome orders={data.orders} onChat={() => setChatOpen(true)} onAdd={() => setProductOpen(true)} onToast={notify} />}
          {role === "rider" && <RiderHome deliveries={data.deliveries} busy={busy} onAccept={acceptDelivery} onProgress={updateDelivery} onChat={() => setChatOpen(true)} onToast={notify} />}
        </>}
        {tab === "Orders" && <OrdersView role={role} orders={data.orders} deliveries={data.deliveries} onChat={() => setChatOpen(true)} />}
        {tab === "Wallet" && <WalletView role={role} />}
        {tab === "Account" && <AccountView role={role} name={data.actor?.displayName || "Mireille N."} />}
      </section>
    </div>

    {chatOpen && <ChatDrawer role={role} messages={data.messages} close={() => setChatOpen(false)} sent={async (body) => { await command("send_message", { orderId: "KL-2084", role, body }); await refresh(); }} notify={notify} />}
    {checkoutOpen && <Checkout cart={cart} busy={busy} close={() => setCheckoutOpen(false)} remove={(i) => setCart((c) => c.filter((_, index) => index !== i))} submit={placeOrder} />}
    {productOpen && <ProductForm close={() => setProductOpen(false)} saved={async (product) => { setBusy(true); try { await command("create_product", product); setProductOpen(false); notify("Product published"); await refresh(); } catch { notify("Could not publish product"); } finally { setBusy(false); } }} />}
    {toast && <div className="toast">✓ {toast}</div>}
  </main>;
}

function CustomerHome({ products, onAdd, onChat, onToast }: { products: Product[]; onAdd: (p: Product) => void; onChat: () => void; onToast: (s: string) => void }) {
  return <><article className="active-delivery"><div className="delivery-copy"><div className="label"><i /> ON THE WAY <span>8 min</span></div><h2>Your lunch is almost there.</h2><p>Brice has picked up your order from Chez Mado.</p><div className="courier"><div className="photo">BR</div><div><strong>Brice N.</strong><small>★ 4.9 · 386 deliveries</small></div><button onClick={() => onToast("Calling Brice…")}>☎</button><button onClick={onChat}>◌ <b>2</b></button></div></div><Map /></article>
    <div className="section-head"><div><p>AROUND YOU</p><h2>Made for right now</h2></div><button onClick={() => onToast("All nearby stores loaded")}>See all →</button></div>
    <div className="categories">{["🍽️ Food", "🛒 Groceries", "👕 Fashion", "💊 Pharmacy", "📦 Send a parcel"].map((c, i) => <button className={i === 0 ? "active" : ""} key={c}>{c}</button>)}</div>
    <div className="product-grid">{products.map((p) => <article className="product" key={p.id} onClick={() => onAdd(p)}><div className="product-img" style={{ background: p.color }}><span>{p.emoji}</span><button aria-label={`Add ${p.name}`}>＋</button></div><h3>{p.name}</h3><p>{p.vendor} · ★ {p.rating}</p><div><strong>{p.price.toLocaleString()} FCFA</strong><span>{p.stock} left</span></div></article>)}</div></>;
}

function Map() { return <div className="map"><div className="road r1" /><div className="road r2" /><div className="road r3" /><span className="map-label one">Rue Njo-Njo</span><span className="map-label two">Avenue de Gaulle</span><div className="vendor-pin">🍲</div><div className="route-line" /><div className="rider-pin">🛵</div><div className="home-pin">⌂</div></div>; }

function VendorHome({ orders, onChat, onAdd, onToast }: { orders: Order[]; onChat: () => void; onAdd: () => void; onToast: (s: string) => void }) {
  const rows = orders.length ? orders : [{ id: "KL-2084", status: "on_the_way", total: 18500, payment_status: "paid", delivery_address: "Bonapriso" }];
  return <><div className="stat-grid"><article><span>SALES TODAY</span><strong>{rows.reduce((s, o) => s + Number(o.total), 0).toLocaleString()} <small>FCFA</small></strong><p>Live from your orders</p></article><article><span>ACTIVE ORDERS</span><strong>{rows.length}</strong><p>Across preparation and delivery</p></article><article><span>CATALOGUE</span><strong>Live</strong><p><button className="inline-action" onClick={onAdd}>Add a product</button></p></article></div>
    <div className="operations"><article className="order-board"><div className="section-head"><div><p>LIVE OPERATIONS</p><h2>Orders in motion</h2></div><button onClick={() => onToast("Order list refreshed")}>Refresh ↻</button></div>{rows.map((o) => <div className="order-row" key={o.id}><span className="order-icon">▣</span><div><strong>#{o.id} · {o.delivery_address}</strong><small>{o.payment_status} · {Number(o.total).toLocaleString()} FCFA</small></div><em>{o.status.replaceAll("_", " ")}</em><button onClick={onChat}>Message</button></div>)}</article>
      <article className="dispatch-card"><p>DELIVERY COVERAGE</p><h2>Your dispatch pulse</h2><div className="radar"><span>12</span><small>riders nearby</small></div><div className="dispatch-line"><span>Average pickup</span><strong>7 min</strong></div><div className="dispatch-line"><span>Delivery success</span><strong>96%</strong></div><button className="primary" onClick={() => onToast("Dispatch queue opened")}>Open dispatch</button></article></div></>;
}

function RiderHome({ deliveries, busy, onAccept, onProgress, onChat, onToast }: { deliveries: Delivery[]; busy: boolean; onAccept: (d: Delivery) => void; onProgress: (s: string) => void; onChat: () => void; onToast: (s: string) => void }) {
  const rows = deliveries.length ? deliveries : [{ id: "del_demo", order_id: "KL-2084", status: "unassigned", courier_fee: 1500, distance_km: 2.4, dropoff_address: "Bonapriso" }];
  return <><article className="rider-hero"><div><p>TODAY’S EARNINGS</p><h2>14,250 <small>FCFA</small></h2><span>6 completed deliveries · 4h 12m online</span></div><div className="rider-score"><strong>92</strong><span>Weekly score</span></div></article>
    <div className="operations rider-ops"><article className="order-board"><div className="section-head"><div><p>AVAILABLE NEARBY</p><h2>Choose your next trip</h2></div><button onClick={() => onToast("Requests updated")}>Update ↻</button></div>{rows.map((d) => <div className="trip-row" key={d.id}><div className="trip-route"><i /><span /><i /></div><div><strong>Chez Mado → {d.dropoff_address}</strong><small>{Number(d.distance_km).toFixed(1)} km · Order {d.order_id}</small></div><b>{Number(d.courier_fee).toLocaleString()} FCFA</b><button disabled={busy || d.status !== "unassigned"} onClick={() => onAccept(d)}>{d.status === "unassigned" ? "Accept" : d.status.replaceAll("_", " ")}</button></div>)}</article>
      <article className="current-trip"><p>ACTIVE DELIVERY</p><h2>Chez Mado → Mireille</h2><div className="mini-map"><div className="road r1" /><div className="road r2" /><span>🛵</span><b>8 min</b></div><div className="customer-line"><div className="photo">MN</div><div><strong>Mireille N.</strong><small>Bonapriso, Rue 1.204</small></div><button onClick={onChat}>Message</button></div><div className="progress-actions"><button onClick={() => onProgress("picked_up")}>Picked up</button><button className="primary" onClick={() => onProgress("delivered")}>Mark delivered →</button></div></article></div></>;
}

function OrdersView({ role, orders, deliveries, onChat }: { role: Role; orders: Order[]; deliveries: Delivery[]; onChat: () => void }) {
  return <><div className="intro"><div><p>{role.toUpperCase()} OPERATIONS</p><h1>Orders and deliveries</h1></div></div><article className="order-board full-board">{orders.length ? orders.map((o) => { const delivery = deliveries.find((d) => d.order_id === o.id); return <div className="order-row" key={o.id}><span className="order-icon">▣</span><div><strong>Order #{o.id}</strong><small>{o.delivery_address} · {Number(o.total).toLocaleString()} FCFA</small></div><em>{delivery?.status?.replaceAll("_", " ") || o.status.replaceAll("_", " ")}</em><button onClick={onChat}>Open chat</button></div>; }) : <div className="empty-state">No orders yet. New orders will appear here.</div>}</article></>;
}

function WalletView({ role }: { role: Role }) { return <><div className="intro"><div><p>KOLA WALLET</p><h1>Money, clearly managed.</h1></div></div><div className="stat-grid"><article><span>AVAILABLE BALANCE</span><strong>{role === "rider" ? "14,250" : "184,500"} <small>FCFA</small></strong><p>Ready to withdraw</p></article><article><span>PENDING</span><strong>8,500 <small>FCFA</small></strong><p>Settles after delivery</p></article><article><span>THIS MONTH</span><strong>642,000 <small>FCFA</small></strong><p>↑ 18% from last month</p></article></div><article className="order-board full-board"><div className="section-head"><div><p>RECENT ACTIVITY</p><h2>Transactions</h2></div></div>{["Order KL-2084 payment", "Delivery KL-2079 payout", "Mobile Money withdrawal"].map((label, i) => <div className="order-row" key={label}><span className="order-icon">{i === 2 ? "↗" : "↓"}</span><div><strong>{label}</strong><small>Today · Completed</small></div><b className="money">{i === 2 ? "−25,000" : `+${[18500, 1500][i]}`} FCFA</b></div>)}</article></>; }

function AccountView({ role, name }: { role: Role; name: string }) { return <><div className="intro"><div><p>PROFILE & SECURITY</p><h1>Your Kola account.</h1></div></div><article className="profile-card"><div className="profile-avatar">{name.split(" ").map((p) => p[0]).join("").slice(0, 2)}</div><div><h2>{name}</h2><p>Active as {role} · Verified member</p></div><button>Edit profile</button></article><div className="settings-grid">{["Personal information", "Saved addresses", "Payments & payouts", "Notifications", "Language: English", "Privacy & security"].map((x) => <button key={x}>{x}<span>→</span></button>)}</div></>; }

function ChatDrawer({ role, messages, close, sent, notify }: { role: Role; messages: Message[]; close: () => void; sent: (s: string) => Promise<void>; notify: (s: string) => void }) {
  const [draft, setDraft] = useState(""); const [sending, setSending] = useState(false);
  const send = async () => { if (!draft.trim()) return; const text = draft; setDraft(""); setSending(true); try { await sent(text); } catch { notify("Message could not be sent"); } finally { setSending(false); } };
  return <div className="drawer-wrap" role="dialog" aria-modal="true" aria-label="Order conversation"><button className="scrim" onClick={close} aria-label="Close chat" /><section className="chat"><header><button onClick={close}>←</button><div><strong>Order #KL-2084</strong><span><i /> Customer · Vendor · Rider</span></div><button>•••</button></header><div className="chat-route"><span>🍲</span><div><strong>Chez Mado → Bonapriso</strong><small>Brice is 8 min away</small></div><button onClick={() => notify("Calling Brice…")}>☎</button></div><div className="messages"><p className="chat-day">TODAY</p><div className="system-msg">Order accepted by Chez Mado</div>{messages.map((m, i) => <div className={`message ${m.kind === role ? "mine" : ""}`} key={`${m.time}-${i}`}><b>{m.who}</b><p>{m.text}</p><time>{m.time}</time></div>)}<div className="system-msg">Live location shared · <b>View map</b></div></div><div className="composer"><button>＋</button><input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Message everyone…" /><button disabled={sending} className="send" onClick={send}>↑</button></div></section></div>;
}

function Checkout({ cart, busy, close, remove, submit }: { cart: Product[]; busy: boolean; close: () => void; remove: (i: number) => void; submit: () => void }) {
  const total = cart.reduce((sum, p) => sum + p.price, 0) + (cart.length ? 1500 : 0);
  return <div className="drawer-wrap" role="dialog" aria-modal="true" aria-label="Checkout"><button className="scrim" onClick={close} aria-label="Close checkout" /><section className="checkout"><header><div><p>YOUR BAG</p><h2>Ready for delivery</h2></div><button onClick={close}>×</button></header><div className="checkout-items">{cart.length ? cart.map((p, i) => <div key={`${p.id}-${i}`}><span>{p.emoji}</span><div><strong>{p.name}</strong><small>Qty 1 · Chez Mado</small></div><b>{p.price.toLocaleString()} FCFA</b><button onClick={() => remove(i)}>×</button></div>) : <div className="empty-state">Your bag is empty.</div>}</div>{cart.length > 0 && <><div className="checkout-field"><span>Deliver to</span><strong>Bonapriso, Douala</strong></div><div className="checkout-field"><span>Payment</span><strong>Mobile Money</strong></div><div className="checkout-field"><span>Delivery</span><strong>1,500 FCFA · 25–40 min</strong></div><div className="total"><span>Total</span><strong>{total.toLocaleString()} FCFA</strong></div><button disabled={busy} className="primary checkout-action" onClick={submit}>{busy ? "Placing order…" : "Place order & request rider →"}</button></>}</section></div>;
}

function ProductForm({ close, saved }: { close: () => void; saved: (p: Record<string, unknown>) => Promise<void> }) {
  const [name, setName] = useState(""); const [price, setPrice] = useState(""); const [stock, setStock] = useState("10"); const [category, setCategory] = useState("Food");
  return <div className="drawer-wrap" role="dialog" aria-modal="true" aria-label="Add product"><button className="scrim" onClick={close} aria-label="Close form" /><section className="checkout product-form"><header><div><p>VENDOR CATALOGUE</p><h2>Add a product</h2></div><button onClick={close}>×</button></header><label>Product name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grilled fish platter" /></label><label>Category<select value={category} onChange={(e) => setCategory(e.target.value)}><option>Food</option><option>Groceries</option><option>Fashion</option><option>Pharmacy</option><option>Other</option></select></label><label>Price (FCFA)<input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="5000" /></label><label>Available stock<input type="number" value={stock} onChange={(e) => setStock(e.target.value)} /></label><button className="primary checkout-action" disabled={!name || !price} onClick={() => saved({ name, price: Number(price), stock: Number(stock), category, emoji: category === "Food" ? "🍲" : "📦" })}>Publish product →</button></section></div>;
}
