"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, CircleUserRound, ClipboardList, Home as HomeIcon, MessageSquare, ShoppingBag, WalletCards } from "lucide-react";

type Role = "customer" | "vendor" | "rider";
type Product = { id: string; name: string; vendor: string; price: number; stock: number; eta: string; rating: string; emoji: string; color: string; image?: string };
type Order = { id: string; status: string; total: number; payment_status: string; delivery_address: string };
type Delivery = { id: string; order_id: string; status: string; courier_id?: string; courier_fee: number; distance_km: number; dropoff_address: string };
type Message = { orderId:string; who: string; text: string; time: string; kind: string };
type Address = { id:string;address:string;city:string;instructions:string };
type Workspace = { products: Product[]; orders: Order[]; deliveries: Delivery[]; messages: Message[]; addresses:Address[]; actor?: { id:string;displayName: string;activeRole:Role;city?:string } };

const fallbackProducts: Product[] = [
  { id: "prd_ndole", name: "Ndolé royal", vendor: "Chez Mado", price: 3500, stock: 24, eta: "25–35 min", rating: "4.9", emoji: "", color: "#e7f0d8", image:"https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=700&q=80" },
  { id: "prd_market", name: "Panier marché frais", vendor: "Marché Central", price: 8500, stock: 12, eta: "40–55 min", rating: "4.8", emoji: "", color: "#dceee4", image:"https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=700&q=80" },
  { id: "prd_shoes", name: "Sneakers Noki", vendor: "Bonamoussadi Style", price: 22000, stock: 8, eta: "Today", rating: "4.7", emoji: "", color: "#e5e4f2", image:"https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=700&q=80" },
  { id: "prd_dg", name: "Poulet DG", vendor: "La Marmite", price: 5000, stock: 18, eta: "30–40 min", rating: "4.9", emoji: "", color: "#f4e3cf", image:"https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=700&q=80" },
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
  const [data, setData] = useState<Workspace>({ products: fallbackProducts, orders: [], deliveries: [], messages: [], addresses:[] });
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
      const images = ["https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=700&q=80","https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=700&q=80","https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=700&q=80","https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=700&q=80"];
      setData({
        actor: raw.actor,
        products: raw.products.map((p: Record<string, unknown>, i: number) => ({ id: String(p.id), name: String(p.name), vendor: "Chez Mado", price: Number(p.price), stock: Number(p.stock), eta: "25–40 min", rating: "4.9", emoji: "", color: colors[i % colors.length], image: images[i % images.length] })),
        orders: raw.orders,
        deliveries: raw.deliveries,
        messages: raw.messages.map((m: Record<string, unknown>) => ({ orderId:String(m.order_id), who: String(m.sender_name), text: String(m.body), time: new Date(Number(m.created_at)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), kind: String(m.sender_role) })),
        addresses: raw.addresses || [],
      });
      setRole(raw.actor.activeRole);
    } catch { /* preview continues with useful demo data */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  const notify = (text: string) => { setToast(text); window.setTimeout(() => setToast(""), 2600); };
  const view = roleCopy[role];
  const activeDelivery = data.deliveries.find((delivery)=>delivery.status!=="unassigned") || data.deliveries[0];
  const activeOrderId = activeDelivery?.order_id || data.orders[0]?.id;

  const placeOrder = async (address:string) => {
    if (!cart.length) return;
    setBusy(true);
    try {
      const result = await command("create_order", { items: cart.map((p) => ({ id: p.id, quantity: 1 })), paymentMethod: "cash", address, notes: "Call at the gate" });
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
  const shareLocation = () => {
    if (!activeDelivery || !navigator.geolocation) return notify("Location is not supported on this device.");
    navigator.geolocation.getCurrentPosition(async (position) => {
      try { await command("update_location", { deliveryId: activeDelivery.id, latitude: position.coords.latitude, longitude: position.coords.longitude }); notify("Live location shared with this order"); }
      catch { notify("Could not update your location."); }
    }, () => notify("Location permission was not granted."), { enableHighAccuracy: true, timeout: 10000 });
  };

  return <main>
    <header className="topbar">
      <button className="brand" onClick={() => { setRole("customer"); setTab("Home"); }} aria-label="Kola home"><span className="brandmark">K</span><span>KOLA</span></button>
      <div className="location"><span>Delivering to</span><strong>Bonapriso, Douala⌄</strong></div>
      <div className="account-role">{role === "customer" ? "Customer" : role === "vendor" ? "Business" : "Delivery rider"}</div>
      {role === "customer" && <button className="basket-btn" onClick={() => setCheckoutOpen(true)}>Bag <b>{cart.length}</b></button>}
      <button className="round-btn" aria-label="Notifications" onClick={() => notify("You’re all caught up")}><Bell size={17}/><i /></button>
      <button className="avatar">{data.actor?.displayName?.split(" ").map((p) => p[0]).join("").slice(0, 2) || "MN"}</button>
    </header>

    <div className="shell">
      <aside><nav>{[["Home", <HomeIcon key="h" size={18}/>], ["Orders", <ClipboardList key="o" size={18}/>], ["Messages", <MessageSquare key="m" size={18}/>], ["Wallet", <WalletCards key="w" size={18}/>], ["Account", <CircleUserRound key="a" size={18}/>]] .map(([item, icon]) => <button key={String(item)} className={tab === item ? "active" : ""} onClick={() => item === "Messages" ? setChatOpen(true) : setTab(String(item))}><span className="icon">{icon}</span>{item}{item === "Messages" && <b>{data.messages.length}</b>}</button>)}</nav><div className="support"><span>?</span><div><strong>Need help?</strong><small>English & Français</small></div></div></aside>
      <section className="content">
        {tab === "Home" && <>
          <div className="intro"><div><p>{view.eyebrow}, {data.actor?.displayName?.split(" ")[0] || "Mireille"}</p><h1>{view.title}</h1></div><button className="primary" onClick={() => role === "vendor" ? setProductOpen(true) : notify(role === "customer" ? "Showing nearby stores" : "Delivery requests updated")}>{view.action} <span>→</span></button></div>
          {role === "customer" && <CustomerHome products={data.products} onAdd={(p) => { setCart((c) => [...c, p]); notify(`${p.name} added to bag`); }} onChat={() => setChatOpen(true)} onToast={notify} />}
          {role === "vendor" && <VendorHome orders={data.orders} onChat={() => activeOrderId ? setChatOpen(true) : notify("No order conversation available")} onAdd={() => setProductOpen(true)} onStatus={async(orderId,status)=>{await command("update_order",{orderId,status});notify(`Order ${orderId} updated`);await refresh()}} onToast={notify} />}
          {role === "rider" && <RiderHome deliveries={data.deliveries} busy={busy} onAccept={acceptDelivery} onProgress={updateDelivery} onLocation={shareLocation} onChat={() => setChatOpen(true)} onToast={notify} />}
        </>}
        {tab === "Orders" && <OrdersView role={role} orders={data.orders} deliveries={data.deliveries} onChat={() => setChatOpen(true)} />}
        {tab === "Wallet" && <WalletView role={role} orders={data.orders} />}
        {tab === "Account" && <AccountView role={role} name={data.actor?.displayName || "Mireille N."} />}
      </section>
    </div>

    {chatOpen && activeOrderId && <ChatDrawer orderId={activeOrderId} role={role} messages={data.messages.filter(message=>message.orderId===activeOrderId)} close={() => setChatOpen(false)} sent={async (body) => { await command("send_message", { orderId: activeOrderId, body }); await refresh(); }} notify={notify} />}
    {checkoutOpen && <Checkout cart={cart} defaultAddress={data.addresses[0]?.address || ""} busy={busy} close={() => setCheckoutOpen(false)} remove={(i) => setCart((c) => c.filter((_, index) => index !== i))} submit={placeOrder} />}
    {productOpen && <ProductForm close={() => setProductOpen(false)} saved={async (product) => { setBusy(true); try { await command("create_product", product); setProductOpen(false); notify("Product published"); await refresh(); } catch { notify("Could not publish product"); } finally { setBusy(false); } }} />}
    {toast && <div className="toast">✓ {toast}</div>}
  </main>;
}

function CustomerHome({ products, onAdd, onChat, onToast }: { products: Product[]; onAdd: (p: Product) => void; onChat: () => void; onToast: (s: string) => void }) {
  return <><article className="active-delivery"><div className="delivery-copy"><div className="label"><i /> ON THE WAY <span>8 min</span></div><h2>Your lunch is almost there.</h2><p>Brice has picked up your order from Chez Mado.</p><div className="courier"><div className="photo">BR</div><div><strong>Brice N.</strong><small>★ 4.9 · 386 deliveries</small></div><button onClick={() => onToast("Calling Brice…")}>☎</button><button onClick={onChat}>◌ <b>2</b></button></div></div><Map /></article>
    <div className="section-head"><div><p>AROUND YOU</p><h2>Made for right now</h2></div><button onClick={() => onToast("All nearby stores loaded")}>See all →</button></div>
    <div className="categories">{["Food", "Groceries", "Fashion", "Pharmacy", "Send a parcel"].map((c, i) => <button className={i === 0 ? "active" : ""} key={c}>{c}</button>)}</div>
    <div className="product-grid">{products.map((p) => <article className="product" key={p.id} onClick={() => onAdd(p)}><div className="product-img" style={{ background: p.color }}>{p.image?<img src={p.image} alt=""/>:<span>{p.name.slice(0,1)}</span>}<button aria-label={`Add ${p.name}`}>＋</button></div><h3>{p.name}</h3><p>{p.vendor} · ★ {p.rating}</p><div><strong>{p.price.toLocaleString()} FCFA</strong><span>{p.stock} left</span></div></article>)}</div></>;
}

function Map() { return <div className="map"><div className="road r1" /><div className="road r2" /><div className="road r3" /><span className="map-label one">Rue Njo-Njo</span><span className="map-label two">Avenue de Gaulle</span><div className="vendor-pin">🍲</div><div className="route-line" /><div className="rider-pin">🛵</div><div className="home-pin">⌂</div></div>; }

function VendorHome({ orders, onChat, onAdd, onStatus, onToast }: { orders: Order[]; onChat: () => void; onAdd: () => void; onStatus:(id:string,status:string)=>Promise<void>; onToast: (s: string) => void }) {
  const rows = orders.length ? orders : [{ id: "KL-2084", status: "on_the_way", total: 18500, payment_status: "paid", delivery_address: "Bonapriso" }];
  return <><div className="stat-grid"><article><span>SALES TODAY</span><strong>{rows.reduce((s, o) => s + Number(o.total), 0).toLocaleString()} <small>FCFA</small></strong><p>Live from your orders</p></article><article><span>ACTIVE ORDERS</span><strong>{rows.length}</strong><p>Across preparation and delivery</p></article><article><span>CATALOGUE</span><strong>Live</strong><p><button className="inline-action" onClick={onAdd}>Add a product</button></p></article></div>
    <div className="operations"><article className="order-board"><div className="section-head"><div><p>LIVE OPERATIONS</p><h2>Orders in motion</h2></div><button onClick={() => onToast("Order list refreshed")}>Refresh</button></div>{rows.map((o) => <div className="order-row" key={o.id}><span className="order-icon"><ClipboardList size={16}/></span><div><strong>#{o.id} · {o.delivery_address}</strong><small>{o.payment_status} · {Number(o.total).toLocaleString()} FCFA</small></div><em>{o.status.replaceAll("_", " ")}</em>{o.status==="pending"&&<button onClick={()=>onStatus(o.id,"accepted")}>Accept</button>}{o.status==="accepted"&&<button onClick={()=>onStatus(o.id,"preparing")}>Prepare</button>}{o.status==="preparing"&&<button onClick={()=>onStatus(o.id,"ready")}>Ready</button>}<button onClick={onChat}>Message</button></div>)}</article>
      <article className="dispatch-card"><p>DELIVERY COVERAGE</p><h2>Your dispatch pulse</h2><div className="radar"><span>12</span><small>riders nearby</small></div><div className="dispatch-line"><span>Average pickup</span><strong>7 min</strong></div><div className="dispatch-line"><span>Delivery success</span><strong>96%</strong></div><button className="primary" onClick={() => onToast("Dispatch queue opened")}>Open dispatch</button></article></div></>;
}

function RiderHome({ deliveries, busy, onAccept, onProgress, onLocation, onChat, onToast }: { deliveries: Delivery[]; busy: boolean; onAccept: (d: Delivery) => void; onProgress: (s: string) => void; onLocation: () => void; onChat: () => void; onToast: (s: string) => void }) {
  const rows = deliveries.length ? deliveries : [{ id: "del_demo", order_id: "KL-2084", status: "unassigned", courier_fee: 1500, distance_km: 2.4, dropoff_address: "Bonapriso" }];
  return <><article className="rider-hero"><div><p>TODAY’S EARNINGS</p><h2>14,250 <small>FCFA</small></h2><span>6 completed deliveries · 4h 12m online</span></div><div className="rider-score"><strong>92</strong><span>Weekly score</span></div></article>
    <div className="operations rider-ops"><article className="order-board"><div className="section-head"><div><p>AVAILABLE NEARBY</p><h2>Choose your next trip</h2></div><button onClick={() => onToast("Requests updated")}>Update ↻</button></div>{rows.map((d) => <div className="trip-row" key={d.id}><div className="trip-route"><i /><span /><i /></div><div><strong>Chez Mado → {d.dropoff_address}</strong><small>{Number(d.distance_km).toFixed(1)} km · Order {d.order_id}</small></div><b>{Number(d.courier_fee).toLocaleString()} FCFA</b><button disabled={busy || d.status !== "unassigned"} onClick={() => onAccept(d)}>{d.status === "unassigned" ? "Accept" : d.status.replaceAll("_", " ")}</button></div>)}</article>
      <article className="current-trip"><p>ACTIVE DELIVERY</p><h2>Chez Mado → Mireille</h2><div className="mini-map"><div className="road r1" /><div className="road r2" /><span>🛵</span><b>8 min</b></div><div className="customer-line"><div className="photo">MN</div><div><strong>Mireille N.</strong><small>Bonapriso, Rue 1.204</small></div><button onClick={onChat}>Message</button></div><button className="location-action" onClick={onLocation}>◎ Share current location</button><div className="progress-actions"><button onClick={() => onProgress("picked_up")}>Picked up</button><button className="primary" onClick={() => onProgress("delivered")}>Mark delivered →</button></div></article></div></>;
}

function OrdersView({ role, orders, deliveries, onChat }: { role: Role; orders: Order[]; deliveries: Delivery[]; onChat: () => void }) {
  return <><div className="intro"><div><p>{role.toUpperCase()} OPERATIONS</p><h1>Orders and deliveries</h1></div></div><article className="order-board full-board">{orders.length ? orders.map((o) => { const delivery = deliveries.find((d) => d.order_id === o.id); return <div className="order-row" key={o.id}><span className="order-icon">▣</span><div><strong>Order #{o.id}</strong><small>{o.delivery_address} · {Number(o.total).toLocaleString()} FCFA</small></div><em>{delivery?.status?.replaceAll("_", " ") || o.status.replaceAll("_", " ")}</em><button onClick={onChat}>Open chat</button></div>; }) : <div className="empty-state">No orders yet. New orders will appear here.</div>}</article></>;
}

function WalletView({ role, orders }: { role: Role;orders:Order[] }) { const paid=orders.filter(o=>o.payment_status==="paid").reduce((s,o)=>s+Number(o.total),0); return <><div className="intro"><div><p>PAYMENTS</p><h1>{role==="customer"?"Payment activity":"Payouts and settlements"}</h1></div></div><div className="stat-grid"><article><span>CONFIRMED</span><strong>{paid.toLocaleString()} <small>FCFA</small></strong><p>Recorded paid orders</p></article><article><span>PENDING CASH ORDERS</span><strong>{orders.filter(o=>o.payment_status==="pending").length}</strong><p>Collected at delivery</p></article><article><span>MOBILE MONEY</span><strong>Not connected</strong><p>Provider credentials required</p></article></div><article className="order-board full-board"><div className="empty-state">Kola currently supports cash on delivery. Mobile Money settlement and withdrawals will appear here after a payment provider is connected.</div></article></>; }

function AccountView({ role, name }: { role: Role; name: string }) { return <><div className="intro"><div><p>ACCOUNT</p><h1>Profile and security</h1></div></div><article className="profile-card"><div className="profile-avatar">{name.split(" ").map((p) => p[0]).join("").slice(0, 2)}</div><div><h2>{name}</h2><p>{role === "vendor" ? "Business account" : role === "rider" ? "Delivery rider account" : "Customer account"} · Signed in securely</p></div><a className="signout-button" href="/signout-with-chatgpt?return_to=%2F">Sign out</a></article><div className="settings-grid">{["Personal information", "Saved addresses", "Payment methods", "Notifications", "Language", "Privacy and security"].map((x) => <button key={x}>{x}<span>→</span></button>)}</div></>; }

function ChatDrawer({ orderId, role, messages, close, sent, notify }: { orderId:string; role: Role; messages: Message[]; close: () => void; sent: (s: string) => Promise<void>; notify: (s: string) => void }) {
  const [draft, setDraft] = useState(""); const [sending, setSending] = useState(false);
  const send = async () => { if (!draft.trim()) return; const text = draft; setDraft(""); setSending(true); try { await sent(text); } catch { notify("Message could not be sent"); } finally { setSending(false); } };
  return <div className="drawer-wrap" role="dialog" aria-modal="true" aria-label="Order conversation"><button className="scrim" onClick={close} aria-label="Close chat" /><section className="chat"><header><button onClick={close}>←</button><div><strong>Order #KL-2084</strong><span><i /> Customer · Vendor · Rider</span></div><button>•••</button></header><div className="chat-route"><span>🍲</span><div><strong>Chez Mado → Bonapriso</strong><small>Brice is 8 min away</small></div><button onClick={() => notify("Calling Brice…")}>☎</button></div><div className="messages"><p className="chat-day">TODAY</p><div className="system-msg">Order accepted by Chez Mado</div>{messages.map((m, i) => <div className={`message ${m.kind === role ? "mine" : ""}`} key={`${m.time}-${i}`}><b>{m.who}</b><p>{m.text}</p><time>{m.time}</time></div>)}<div className="system-msg">Live location shared · <b>View map</b></div></div><div className="composer"><button>＋</button><input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Message everyone…" /><button disabled={sending} className="send" onClick={send}>↑</button></div></section></div>;
}

function Checkout({ cart, defaultAddress, busy, close, remove, submit }: { cart: Product[]; defaultAddress:string; busy: boolean; close: () => void; remove: (i: number) => void; submit: (address:string) => void }) {
  const [address,setAddress]=useState(defaultAddress);
  const total = cart.reduce((sum, p) => sum + p.price, 0) + (cart.length ? 1500 : 0);
  return <div className="drawer-wrap" role="dialog" aria-modal="true" aria-label="Checkout"><button className="scrim" onClick={close} aria-label="Close checkout" /><section className="checkout"><header><div><p>YOUR BAG</p><h2>Checkout</h2></div><button onClick={close}>×</button></header><div className="checkout-items">{cart.length ? cart.map((p, i) => <div key={`${p.id}-${i}`}><span><ShoppingBag size={17}/></span><div><strong>{p.name}</strong><small>Quantity 1 · {p.vendor}</small></div><b>{p.price.toLocaleString()} FCFA</b><button onClick={() => remove(i)}>×</button></div>) : <div className="empty-state">Your bag is empty.</div>}</div>{cart.length > 0 && <><label className="checkout-label">Delivery address<textarea value={address} onChange={e=>setAddress(e.target.value)} placeholder="Street, neighbourhood and landmark"/></label><div className="checkout-field"><span>Payment</span><strong>Cash on delivery</strong></div><div className="checkout-field"><span>Delivery estimate</span><strong>1,500 FCFA · 25–40 min</strong></div><div className="total"><span>Total</span><strong>{total.toLocaleString()} FCFA</strong></div><button disabled={busy||address.trim().length<5} className="primary checkout-action" onClick={()=>submit(address)}>{busy ? "Placing order…" : "Place order"}</button></>}</section></div>;
}

function ProductForm({ close, saved }: { close: () => void; saved: (p: Record<string, unknown>) => Promise<void> }) {
  const [name, setName] = useState(""); const [price, setPrice] = useState(""); const [stock, setStock] = useState("10"); const [category, setCategory] = useState("Food");
  return <div className="drawer-wrap" role="dialog" aria-modal="true" aria-label="Add product"><button className="scrim" onClick={close} aria-label="Close form" /><section className="checkout product-form"><header><div><p>VENDOR CATALOGUE</p><h2>Add a product</h2></div><button onClick={close}>×</button></header><label>Product name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grilled fish platter" /></label><label>Category<select value={category} onChange={(e) => setCategory(e.target.value)}><option>Food</option><option>Groceries</option><option>Fashion</option><option>Pharmacy</option><option>Other</option></select></label><label>Price (FCFA)<input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="5000" /></label><label>Available stock<input type="number" value={stock} onChange={(e) => setStock(e.target.value)} /></label><button className="primary checkout-action" disabled={!name || !price} onClick={() => saved({ name, price: Number(price), stock: Number(stock), category, emoji: category === "Food" ? "🍲" : "📦" })}>Publish product →</button></section></div>;
}
