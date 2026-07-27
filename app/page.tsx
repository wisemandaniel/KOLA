"use client";

import { useMemo, useState } from "react";

type Role = "customer" | "vendor" | "rider";

const products = [
  { name: "Ndolé royal", vendor: "Chez Mado", price: 3500, eta: "25–35 min", rating: "4.9", emoji: "🍲", color: "#e7f0d8" },
  { name: "Panier marché frais", vendor: "Marché Central", price: 8500, eta: "40–55 min", rating: "4.8", emoji: "🥬", color: "#dceee4" },
  { name: "Sneakers Noki", vendor: "Bonamoussadi Style", price: 22000, eta: "Today", rating: "4.7", emoji: "👟", color: "#e5e4f2" },
  { name: "Poulet DG", vendor: "La Marmite", price: 5000, eta: "30–40 min", rating: "4.9", emoji: "🍛", color: "#f4e3cf" },
];

const roleCopy = {
  customer: { eyebrow: "Good afternoon, Mireille", title: "Everything you need,\ndelivered with care.", action: "Explore nearby" },
  vendor: { eyebrow: "Monday, 27 July", title: "Your shop is moving.", action: "Add a product" },
  rider: { eyebrow: "Online in Douala", title: "Ready for your\nnext delivery?", action: "Find a delivery" },
};

function Icon({ children }: { children: React.ReactNode }) {
  return <span className="icon">{children}</span>;
}

export default function Home() {
  const [role, setRole] = useState<Role>("customer");
  const [tab, setTab] = useState("Home");
  const [chatOpen, setChatOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [messages, setMessages] = useState([
    { who: "Chez Mado", text: "Your order is packed and ready.", time: "14:08", kind: "vendor" },
    { who: "Brice · Rider", text: "I’ve picked it up. I’ll call when I reach the gate.", time: "14:12", kind: "rider" },
  ]);
  const [draft, setDraft] = useState("");

  const view = useMemo(() => roleCopy[role], [role]);
  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  };
  const sendMessage = () => {
    if (!draft.trim()) return;
    setMessages([...messages, { who: "You", text: draft.trim(), time: "Now", kind: "customer" }]);
    setDraft("");
  };

  return (
    <main>
      <header className="topbar">
        <button className="brand" onClick={() => { setRole("customer"); setTab("Home"); }} aria-label="Kola home">
          <span className="brandmark">K</span><span>KOLA</span>
        </button>
        <div className="location"><span>Delivering to</span><strong>Bonapriso, Douala⌄</strong></div>
        <div className="role-switch" aria-label="Choose app mode">
          {(["customer", "vendor", "rider"] as Role[]).map((item) => (
            <button key={item} className={role === item ? "active" : ""} onClick={() => setRole(item)}>
              {item === "customer" ? "Buy" : item === "vendor" ? "Sell" : "Deliver"}
            </button>
          ))}
        </div>
        <button className="round-btn" onClick={() => showToast("You’re all caught up")}>🔔<i /></button>
        <button className="avatar">MN</button>
      </header>

      <div className="shell">
        <aside>
          <nav>
            {[
              ["Home", "⌂"], ["Orders", "▣"], ["Messages", "◌"], ["Wallet", "◫"], ["Account", "◎"]
            ].map(([item, icon]) => (
              <button key={item} className={tab === item ? "active" : ""} onClick={() => item === "Messages" ? setChatOpen(true) : setTab(item)}>
                <Icon>{icon}</Icon>{item}{item === "Messages" && <b>2</b>}
              </button>
            ))}
          </nav>
          <div className="support">
            <span>?</span><div><strong>Need help?</strong><small>We speak English & Français</small></div>
          </div>
        </aside>

        <section className="content">
          <div className="intro">
            <div><p>{view.eyebrow}</p><h1>{view.title}</h1></div>
            <button className="primary" onClick={() => showToast(role === "customer" ? "Showing stores near Bonapriso" : role === "vendor" ? "Product editor opened" : "Finding nearby requests")}>{view.action} <span>→</span></button>
          </div>

          {role === "customer" && <CustomerHome onChat={() => setChatOpen(true)} onToast={showToast} />}
          {role === "vendor" && <VendorHome onChat={() => setChatOpen(true)} onToast={showToast} />}
          {role === "rider" && <RiderHome onChat={() => setChatOpen(true)} onToast={showToast} />}
        </section>
      </div>

      {chatOpen && (
        <div className="drawer-wrap" role="dialog" aria-modal="true" aria-label="Order conversation">
          <button className="scrim" onClick={() => setChatOpen(false)} aria-label="Close chat" />
          <section className="chat">
            <header>
              <button onClick={() => setChatOpen(false)}>←</button>
              <div><strong>Order #KL-2084</strong><span><i /> Customer · Vendor · Rider</span></div>
              <button>•••</button>
            </header>
            <div className="chat-route">
              <span>🍲</span><div><strong>Chez Mado → Bonapriso</strong><small>Brice is 8 min away</small></div>
              <button onClick={() => showToast("Calling Brice…")}>☎</button>
            </div>
            <div className="messages">
              <p className="chat-day">TODAY</p>
              <div className="system-msg">Order accepted by Chez Mado</div>
              {messages.map((m, i) => <div className={`message ${m.kind === "customer" ? "mine" : ""}`} key={i}><b>{m.who}</b><p>{m.text}</p><time>{m.time}</time></div>)}
              <div className="system-msg">Brice shared live location · <b>View map</b></div>
            </div>
            <div className="composer">
              <button>＋</button><input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage()} placeholder="Message everyone…" />
              <button className="send" onClick={sendMessage}>↑</button>
            </div>
          </section>
        </div>
      )}
      {toast && <div className="toast">✓ {toast}</div>}
    </main>
  );
}

function CustomerHome({ onChat, onToast }: { onChat: () => void; onToast: (s: string) => void }) {
  return <>
    <article className="active-delivery">
      <div className="delivery-copy">
        <div className="label"><i /> ON THE WAY <span>8 min</span></div>
        <h2>Your lunch is almost there.</h2>
        <p>Brice has picked up your order from Chez Mado.</p>
        <div className="courier">
          <div className="photo">BR</div><div><strong>Brice N.</strong><small>★ 4.9 · 386 deliveries</small></div>
          <button onClick={() => onToast("Calling Brice…")}>☎</button><button onClick={onChat}>◌ <b>2</b></button>
        </div>
      </div>
      <div className="map">
        <div className="road r1" /><div className="road r2" /><div className="road r3" />
        <span className="map-label one">Rue Njo-Njo</span><span className="map-label two">Avenue de Gaulle</span>
        <div className="vendor-pin">🍲</div><div className="route-line" /><div className="rider-pin">🛵</div><div className="home-pin">⌂</div>
      </div>
    </article>
    <div className="section-head"><div><p>AROUND YOU</p><h2>Made for right now</h2></div><button onClick={() => onToast("All nearby stores loaded")}>See all →</button></div>
    <div className="categories">
      {["🍽️ Food", "🛒 Groceries", "👕 Fashion", "💊 Pharmacy", "📦 Send a parcel"].map((c, i) => <button className={i === 0 ? "active" : ""} key={c}>{c}</button>)}
    </div>
    <div className="product-grid">
      {products.map((p) => <article className="product" key={p.name} onClick={() => onToast(`${p.name} added to basket`)}>
        <div className="product-img" style={{ background: p.color }}><span>{p.emoji}</span><button>＋</button></div>
        <h3>{p.name}</h3><p>{p.vendor} · ★ {p.rating}</p><div><strong>{p.price.toLocaleString()} FCFA</strong><span>{p.eta}</span></div>
      </article>)}
    </div>
  </>;
}

function VendorHome({ onChat, onToast }: { onChat: () => void; onToast: (s: string) => void }) {
  return <>
    <div className="stat-grid">
      <article><span>SALES TODAY</span><strong>184,500 <small>FCFA</small></strong><p>↑ 12% from yesterday</p></article>
      <article><span>ACTIVE ORDERS</span><strong>8</strong><p>3 awaiting dispatch</p></article>
      <article><span>DELIVERIES</span><strong>17</strong><p>94% on-time</p></article>
    </div>
    <div className="operations">
      <article className="order-board">
        <div className="section-head"><div><p>LIVE OPERATIONS</p><h2>Orders in motion</h2></div><button onClick={() => onToast("Order list refreshed")}>Refresh ↻</button></div>
        {[["#KL-2084", "Mireille N.", "Brice N.", "On the way", "18,500"], ["#KL-2087", "Alain T.", "Unassigned", "Needs rider", "8,000"], ["#KL-2091", "Sarah E.", "Loïc M.", "Preparing", "12,750"]].map((o) =>
          <div className="order-row" key={o[0]}><span className="order-icon">▣</span><div><strong>{o[0]} · {o[1]}</strong><small>{o[2]} · {o[4]} FCFA</small></div><em className={o[3] === "Needs rider" ? "urgent" : ""}>{o[3]}</em><button onClick={onChat}>Message</button></div>
        )}
      </article>
      <article className="dispatch-card"><p>DELIVERY COVERAGE</p><h2>Your dispatch pulse</h2><div className="radar"><span>12</span><small>riders nearby</small></div><div className="dispatch-line"><span>Average pickup</span><strong>7 min</strong></div><div className="dispatch-line"><span>Delivery success</span><strong>96%</strong></div><button className="primary" onClick={() => onToast("Dispatch panel opened")}>Open dispatch</button></article>
    </div>
  </>;
}

function RiderHome({ onChat, onToast }: { onChat: () => void; onToast: (s: string) => void }) {
  return <>
    <article className="rider-hero">
      <div><p>TODAY’S EARNINGS</p><h2>14,250 <small>FCFA</small></h2><span>6 completed deliveries · 4h 12m online</span></div>
      <div className="rider-score"><strong>92</strong><span>Weekly score</span></div>
    </article>
    <div className="operations rider-ops">
      <article className="order-board">
        <div className="section-head"><div><p>AVAILABLE NEARBY</p><h2>Choose your next trip</h2></div><button onClick={() => onToast("Requests updated")}>Update ↻</button></div>
        {[["Chez Mado", "Bonapriso", "2.4 km", "1,500"], ["Akwa Pharmacy", "Bonanjo", "4.1 km", "2,200"], ["Marché Central", "Deido", "5.8 km", "2,800"]].map((o, i) =>
          <div className="trip-row" key={o[0]}><div className="trip-route"><i /><span /><i /></div><div><strong>{o[0]} → {o[1]}</strong><small>{o[2]} · Pickup in {6 + i * 3} min</small></div><b>{o[3]} FCFA</b><button onClick={() => onToast(`Trip to ${o[1]} accepted`)}>Accept</button></div>
        )}
      </article>
      <article className="current-trip"><p>ACTIVE DELIVERY</p><h2>Chez Mado → Mireille</h2><div className="mini-map"><div className="road r1" /><div className="road r2" /><span>🛵</span><b>8 min</b></div><div className="customer-line"><div className="photo">MN</div><div><strong>Mireille N.</strong><small>Bonapriso, Rue 1.204</small></div><button onClick={onChat}>Message</button></div><button className="primary" onClick={() => onToast("Navigation started")}>Start navigation →</button></article>
    </div>
  </>;
}
