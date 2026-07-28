"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  Bell,
  Check,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  FileCheck,
  Globe2,
  LifeBuoy,
  Loader2,
  MapPin,
  Plus,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  TicketCheck,
  Trash2,
  UserRound,
  WalletCards,
} from "lucide-react";

type Role = "customer" | "vendor" | "rider";
type Row = Record<string, unknown>;

type PlatformData = {
  profile: {
    displayName: string;
    phone?: string;
    city?: string;
    language: string;
    notificationPreferences: string;
    isAdmin: boolean;
  };
  addresses: Row[];
  notifications: Row[];
  tickets: Row[];
  supportMessages: Row[];
  reviews: Row[];
  paymentAttempts: Row[];
  verificationRequests: Row[];
  promotions: Row[];
  analytics: Row;
  admin: Row | null;
  integrations: Record<string, boolean>;
};

type OrderLite = {
  id: string;
  total: number;
  payment_status: string;
  status: string;
};

async function platformAction(action: string, payload: Row = {}) {
  const response = await fetch("/api/platform", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const result = (await response.json()) as Row;
  if (!response.ok) throw new Error(String(result.error ?? "Action failed."));
  return result;
}

function usePlatform(onNotice: (message: string) => void) {
  const [data, setData] = useState<PlatformData | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/platform", { cache: "no-store" });
      const result = (await response.json()) as PlatformData & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Account services unavailable.");
      setData(result);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Could not load account services.");
    } finally {
      setLoading(false);
    }
  }, [onNotice]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  return { data, loading, refresh };
}

export function AccountCenter({
  role,
  orders,
  initialSection = "overview",
  onNotice,
}: {
  role: Role;
  orders: OrderLite[];
  initialSection?: string;
  onNotice: (message: string) => void;
}) {
  const { data, loading, refresh } = usePlatform(onNotice);
  const [section, setSection] = useState(initialSection);
  const [busy, setBusy] = useState(false);

  if (loading || !data) {
    return (
      <div className="platform-loading">
        <Loader2 />
        Loading account services
      </div>
    );
  }

  const sections = [
    ["overview", "Overview", <Activity key="overview" />],
    ["profile", "Profile", <UserRound key="profile" />],
    ["addresses", "Addresses", <MapPin key="addresses" />],
    ["notifications", "Notifications", <Bell key="notifications" />],
    ["support", "Support", <LifeBuoy key="support" />],
    ...(role === "vendor"
      ? [["promotions", "Promotions", <Sparkles key="promotions" />] as const]
      : []),
    ...(role === "rider"
      ? [["verification", "Verification", <FileCheck key="verification" />] as const]
      : []),
    ["integrations", "Integrations", <Globe2 key="integrations" />],
    ...(data.profile.isAdmin
      ? [["admin", "Administration", <ShieldCheck key="admin" />] as const]
      : []),
  ];

  const run = async (action: string, payload: Row, success: string) => {
    setBusy(true);
    try {
      await platformAction(action, payload);
      onNotice(success);
      await refresh();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="platform-center">
      <nav className="platform-tabs" aria-label="Account services">
        {sections.map(([id, label, icon]) => (
          <button
            key={id}
            className={section === id ? "active" : ""}
            onClick={() => setSection(id)}
          >
            {icon}
            <span>{label}</span>
            {id === "notifications" &&
              data.notifications.some((item) => !item.read_at) && <i />}
          </button>
        ))}
      </nav>

      <div className="platform-panel">
        {section === "overview" && (
          <AnalyticsPanel role={role} analytics={data.analytics} />
        )}
        {section === "profile" && (
          <ProfilePanel
            profile={data.profile}
            busy={busy}
            save={(payload) => run("update_profile", payload, "Profile updated")}
          />
        )}
        {section === "addresses" && (
          <AddressPanel
            addresses={data.addresses}
            busy={busy}
            run={run}
            onNotice={onNotice}
          />
        )}
        {section === "notifications" && (
          <NotificationPanel
            items={data.notifications}
            busy={busy}
            markRead={() =>
              run("read_notifications", {}, "Notifications marked as read")
            }
          />
        )}
        {section === "support" && (
          <SupportPanel
            tickets={data.tickets}
            messages={data.supportMessages}
            orders={orders}
            busy={busy}
            create={(payload) => run("create_ticket", payload, "Support ticket created")}
            reply={(payload) => run("support_reply", payload, "Reply sent")}
          />
        )}
        {section === "promotions" && role === "vendor" && (
          <PromotionPanel
            promotions={data.promotions}
            busy={busy}
            run={run}
          />
        )}
        {section === "verification" && role === "rider" && (
          <VerificationPanel
            requests={data.verificationRequests}
            onNotice={onNotice}
            refresh={refresh}
          />
        )}
        {section === "integrations" && (
          <IntegrationPanel integrations={data.integrations} />
        )}
        {section === "admin" && data.admin && (
          <AdminPanel
            data={data.admin}
            busy={busy}
            run={run}
          />
        )}
      </div>
    </section>
  );
}

export function PaymentCenter({
  orders,
  phone,
  onNotice,
}: {
  orders: OrderLite[];
  phone?: string;
  onNotice: (message: string) => void;
}) {
  const { data, loading, refresh } = usePlatform(onNotice);
  const pending = orders.filter(
    (order) => order.payment_status !== "paid" && order.status !== "cancelled",
  );
  const [orderId, setOrderId] = useState(pending[0]?.id ?? "");
  const [provider, setProvider] = useState("mtn_momo");
  const [paymentPhone, setPaymentPhone] = useState(phone ?? "");
  const [busy, setBusy] = useState(false);

  if (loading || !data) {
    return <div className="platform-loading"><Loader2 /> Loading payments</div>;
  }

  const selected = pending.find((order) => order.id === orderId);
  const enabled =
    provider === "mtn_momo"
      ? data.integrations.mtnMomo
      : data.integrations.orangeMoney;

  const requestPayment = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const result = await platformAction("payment_attempt", {
        orderId: selected.id,
        provider,
        phone: paymentPhone,
      });
      if (result.activationRequired) {
        onNotice("Payment provider activation is required before collection can begin.");
      } else if (typeof result.checkoutUrl === "string" && result.checkoutUrl) {
        window.location.assign(result.checkoutUrl);
        return;
      } else {
        onNotice("Payment request sent. Approve it on your phone.");
      }
      await refresh();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Payment request failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="payment-center">
      <div className="payment-method-grid">
        <article className="payment-provider active">
          <span><WalletCards /></span>
          <div>
            <b>Cash on delivery</b>
            <p>Active for every Kola order</p>
          </div>
          <Check />
        </article>
        <button
          className={`payment-provider ${provider === "mtn_momo" ? "selected" : ""}`}
          onClick={() => setProvider("mtn_momo")}
        >
          <span>MTN</span>
          <div><b>MTN Mobile Money</b><p>{data.integrations.mtnMomo ? "Connected" : "Activation required"}</p></div>
          <i className={data.integrations.mtnMomo ? "ready" : ""} />
        </button>
        <button
          className={`payment-provider ${provider === "orange_money" ? "selected" : ""}`}
          onClick={() => setProvider("orange_money")}
        >
          <span>OM</span>
          <div><b>Orange Money</b><p>{data.integrations.orangeMoney ? "Connected" : "Activation required"}</p></div>
          <i className={data.integrations.orangeMoney ? "ready" : ""} />
        </button>
      </div>

      <div className="payment-request-card">
        <div>
          <span>MOBILE MONEY REQUEST</span>
          <h3>Collect payment for an order</h3>
          <p>Payment requests remain disabled until the selected provider is securely activated.</p>
        </div>
        <label>
          Order
          <select value={orderId} onChange={(event) => setOrderId(event.target.value)}>
            <option value="">Choose an unpaid order</option>
            {pending.map((order) => (
              <option key={order.id} value={order.id}>
                {order.id} · {Number(order.total).toLocaleString()} FCFA
              </option>
            ))}
          </select>
        </label>
        <label>
          Mobile number
          <input
            value={paymentPhone}
            onChange={(event) => setPaymentPhone(event.target.value)}
            placeholder="+237 6XX XXX XXX"
          />
        </label>
        <button
          className="primary-button"
          disabled={busy || !selected || paymentPhone.replace(/\D/g, "").length < 12}
          onClick={requestPayment}
        >
          {busy ? <Loader2 /> : <CircleDollarSign />}
          {enabled ? "Request payment" : "Check activation"}
        </button>
      </div>

      <div className="payment-attempts">
        <h3>Recent payment attempts</h3>
        {data.paymentAttempts.length ? (
          data.paymentAttempts.map((attempt) => (
            <article key={String(attempt.id)}>
              <CreditCard />
              <div>
                <b>{String(attempt.order_id)}</b>
                <span>{String(attempt.provider).replaceAll("_", " ")}</span>
              </div>
              <strong>{Number(attempt.amount).toLocaleString()} FCFA</strong>
              <em>{String(attempt.status).replaceAll("_", " ")}</em>
              {String(attempt.provider) === "mtn_momo" &&
                ["pending_provider", "initiating"].includes(String(attempt.status)) && (
                  <button
                    className="secondary-button small"
                    onClick={async () => {
                      try {
                        const result = await platformAction("payment_status", {
                          id: attempt.id,
                        });
                        onNotice(`Payment is ${String(result.status).replaceAll("_", " ")}.`);
                        await refresh();
                      } catch (error) {
                        onNotice(
                          error instanceof Error ? error.message : "Status check failed.",
                        );
                      }
                    }}
                  >
                    Refresh
                  </button>
                )}
            </article>
          ))
        ) : (
          <p className="platform-empty">No Mobile Money requests yet.</p>
        )}
      </div>
    </section>
  );
}

function AnalyticsPanel({ role, analytics }: { role: Role; analytics: Row }) {
  const cards =
    role === "vendor"
      ? [
          ["Total orders", analytics.orders ?? 0],
          ["Paid revenue", `${Number(analytics.revenue ?? 0).toLocaleString()} FCFA`],
          ["Average order", `${Number(analytics.average_order ?? 0).toLocaleString()} FCFA`],
          ["Active orders", analytics.active_orders ?? 0],
        ]
      : role === "rider"
        ? [
            ["Assigned deliveries", analytics.deliveries ?? 0],
            ["Completed", analytics.completed ?? 0],
            ["Earned", `${Number(analytics.earnings ?? 0).toLocaleString()} FCFA`],
            ["Average distance", `${Number(analytics.average_distance ?? 0).toFixed(1)} km`],
          ]
        : [
            ["Orders placed", analytics.orders ?? 0],
            ["Delivered", analytics.delivered ?? 0],
            ["Total order value", `${Number(analytics.spend ?? 0).toLocaleString()} FCFA`],
          ];
  return (
    <>
      <PanelHeading title="Your Kola activity" text="A live summary calculated from your account records." />
      <div className="platform-metrics">
        {cards.map(([label, value]) => (
          <article key={String(label)}><span>{label}</span><b>{String(value)}</b></article>
        ))}
      </div>
      {Array.isArray(analytics.topProducts) && analytics.topProducts.length > 0 && (
        <div className="top-products">
          <h3>Top products</h3>
          {(analytics.topProducts as Row[]).map((product, index) => (
            <div key={String(product.name)}>
              <i>{index + 1}</i>
              <span>{String(product.name)}</span>
              <b>{Number(product.quantity)} sold</b>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function ProfilePanel({
  profile,
  busy,
  save,
}: {
  profile: PlatformData["profile"];
  busy: boolean;
  save: (payload: Row) => void;
}) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [language, setLanguage] = useState(profile.language);
  const [notifications, setNotifications] = useState(profile.notificationPreferences);
  return (
    <>
      <PanelHeading title="Profile and preferences" text="Keep your public identity and communication preferences current." />
      <div className="platform-form">
        <label>Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
        <label>Language<select value={language} onChange={(event) => setLanguage(event.target.value)}><option value="en">English</option><option value="fr">Français</option></select></label>
        <label>Notifications<select value={notifications} onChange={(event) => setNotifications(event.target.value)}><option value="all">All activity</option><option value="orders">Orders only</option><option value="none">None</option></select></label>
        <button className="primary-button" disabled={busy || displayName.trim().length < 2} onClick={() => save({ displayName, language, notificationPreferences: notifications })}><Save />Save preferences</button>
      </div>
    </>
  );
}

function AddressPanel({
  addresses,
  busy,
  run,
  onNotice,
}: {
  addresses: Row[];
  busy: boolean;
  run: (action: string, payload: Row, success: string) => void;
  onNotice: (message: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("Home");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("Douala");
  const [instructions, setInstructions] = useState("");
  const [coordinates, setCoordinates] = useState<{ latitude?: number; longitude?: number }>({});

  const locate = () => {
    if (!navigator.geolocation) return onNotice("Location is unavailable on this device.");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoordinates({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        onNotice("Location pin added to this address.");
      },
      () => onNotice("Location permission was not granted."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <>
      <PanelHeading title="Saved addresses" text="Save delivery details and optional map coordinates." action={<button className="secondary-button" onClick={() => setAdding((value) => !value)}><Plus />Add address</button>} />
      {adding && (
        <div className="platform-form address-form">
          <label>Label<input value={label} onChange={(event) => setLabel(event.target.value)} /></label>
          <label>City<input value={city} onChange={(event) => setCity(event.target.value)} /></label>
          <label className="wide">Address<input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Street, neighbourhood and landmark" /></label>
          <label className="wide">Instructions<input value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Gate, floor or delivery note" /></label>
          <button className="secondary-button" onClick={locate}><MapPin />{coordinates.latitude ? "Location pinned" : "Use current location"}</button>
          <button className="primary-button" disabled={busy || address.trim().length < 5} onClick={() => run("save_address", { label, address, city, instructions, ...coordinates }, "Address saved")}><Save />Save address</button>
        </div>
      )}
      <div className="address-list">
        {addresses.map((item) => (
          <article key={String(item.id)}>
            <span><MapPin /></span>
            <div><b>{String(item.label)}</b><p>{String(item.address)}, {String(item.city)}</p>{item.latitude != null && <small>Location pin saved</small>}</div>
            {Boolean(item.is_default) ? <em>Default</em> : <button onClick={() => run("default_address", { id: item.id }, "Default address updated")}>Make default</button>}
            {!item.is_default && <button className="danger-icon" onClick={() => run("delete_address", { id: item.id }, "Address removed")}><Trash2 /></button>}
          </article>
        ))}
        {!addresses.length && <p className="platform-empty">No saved addresses yet.</p>}
      </div>
    </>
  );
}

function NotificationPanel({ items, busy, markRead }: { items: Row[]; busy: boolean; markRead: () => void }) {
  return (
    <>
      <PanelHeading title="Notifications" text="Order, delivery, support, and account updates." action={<button className="secondary-button" disabled={busy || !items.some((item) => !item.read_at)} onClick={markRead}><Check />Mark all read</button>} />
      <div className="notification-list">
        {items.map((item) => (
          <article className={item.read_at ? "" : "unread"} key={String(item.id)}>
            <span><Bell /></span>
            <div><b>{String(item.title)}</b><p>{String(item.body)}</p><small>{new Date(Number(item.created_at)).toLocaleString()}</small></div>
            {!item.read_at && <i />}
          </article>
        ))}
        {!items.length && <p className="platform-empty">You are all caught up.</p>}
      </div>
    </>
  );
}

function SupportPanel({ tickets, messages, orders, busy, create, reply }: { tickets: Row[]; messages: Row[]; orders: OrderLite[]; busy: boolean; create: (payload: Row) => void; reply: (payload: Row) => void }) {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("order");
  const [orderId, setOrderId] = useState("");
  return (
    <>
      <PanelHeading title="Kola support" text="Create a traceable support request for orders, payments, or account issues." />
      <div className="support-grid">
        <div className="platform-form">
          <label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="order">Order</option><option value="delivery">Delivery</option><option value="payment">Payment</option><option value="account">Account</option><option value="other">Other</option></select></label>
          <label>Related order<select value={orderId} onChange={(event) => setOrderId(event.target.value)}><option value="">No order</option>{orders.map((order) => <option key={order.id}>{order.id}</option>)}</select></label>
          <label className="wide">Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
          <label className="wide">What happened?<textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label>
          <button className="primary-button" disabled={busy || subject.trim().length < 4 || description.trim().length < 10} onClick={() => create({ subject, description, category, orderId })}><LifeBuoy />Create ticket</button>
        </div>
        <div className="ticket-list">
          {tickets.map((ticket) => (
            <SupportTicket
              key={String(ticket.id)}
              ticket={ticket}
              messages={messages.filter((message) => message.ticket_id === ticket.id)}
              busy={busy}
              reply={reply}
            />
          ))}
          {!tickets.length && <p className="platform-empty">No support tickets.</p>}
        </div>
      </div>
    </>
  );
}

function SupportTicket({ ticket, messages, busy, reply }: { ticket: Row; messages: Row[]; busy: boolean; reply: (payload: Row) => void }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const send = () => {
    const clean = message.trim();
    if (!clean) return;
    reply({ id: ticket.id, message: clean });
    setMessage("");
  };
  return (
    <article className={`support-ticket-card ${open ? "open" : ""}`}>
      <button className="support-ticket-summary" onClick={() => setOpen((value) => !value)}>
        <TicketCheck />
        <span><b>{String(ticket.subject)}</b><small>{String(ticket.id)} · {String(ticket.category)}</small></span>
        <em>{String(ticket.status).replaceAll("_", " ")}</em>
        <ChevronRight />
      </button>
      {open && (
        <div className="support-thread">
          {messages.map((item) => (
            <div key={String(item.id)}>
              <b>{String(item.sender_name)}</b>
              <p>{String(item.body)}</p>
              <small>{new Date(Number(item.created_at)).toLocaleString()}</small>
            </div>
          ))}
          {String(ticket.status) !== "closed" && (
            <div className="support-reply">
              <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write a reply" onKeyDown={(event) => { if (event.key === "Enter") send(); }} />
              <button disabled={busy || !message.trim()} onClick={send}><Send /></button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function PromotionPanel({ promotions, busy, run }: { promotions: Row[]; busy: boolean; run: (action: string, payload: Row, success: string) => void }) {
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState("percentage");
  const [discountValue, setDiscountValue] = useState("10");
  const [minimumOrder, setMinimumOrder] = useState("0");
  return (
    <>
      <PanelHeading title="Promotions" text="Create controlled discount codes for your storefront." />
      <div className="platform-form promotion-form">
        <label>Code<input value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="WELCOME10" /></label>
        <label>Type<select value={discountType} onChange={(event) => setDiscountType(event.target.value)}><option value="percentage">Percentage</option><option value="fixed">Fixed FCFA</option></select></label>
        <label>Value<input type="number" value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} /></label>
        <label>Minimum order<input type="number" value={minimumOrder} onChange={(event) => setMinimumOrder(event.target.value)} /></label>
        <button className="primary-button" disabled={busy || code.length < 3} onClick={() => run("create_promotion", { code, discountType, discountValue: Number(discountValue), minimumOrder: Number(minimumOrder) }, "Promotion created")}><Sparkles />Create promotion</button>
      </div>
      <div className="promotion-list">
        {promotions.map((promotion) => (
          <article key={String(promotion.id)}>
            <span>{String(promotion.code)}</span>
            <div><b>{String(promotion.discount_type) === "percentage" ? `${Number(promotion.discount_value)}% off` : `${Number(promotion.discount_value).toLocaleString()} FCFA off`}</b><small>{Number(promotion.usage_count)} uses</small></div>
            <button className={promotion.active ? "active" : ""} onClick={() => run("toggle_promotion", { id: promotion.id }, "Promotion updated")}>{promotion.active ? "Active" : "Paused"}</button>
          </article>
        ))}
      </div>
    </>
  );
}

function VerificationPanel({ requests, onNotice, refresh }: { requests: Row[]; onNotice: (message: string) => void; refresh: () => Promise<void> }) {
  const [documentType, setDocumentType] = useState("national_id");
  const [busy, setBusy] = useState(false);
  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set("documentType", documentType);
      form.set("file", file);
      const response = await fetch("/api/verification/upload", { method: "POST", body: form });
      const result = (await response.json()) as Row;
      if (!response.ok) throw new Error(String(result.error ?? "Upload failed."));
      onNotice("Verification document submitted securely.");
      await refresh();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PanelHeading title="Rider verification" text="Submit identity or vehicle documents to the protected Kola review queue." />
      <div className="verification-upload">
        <FileCheck />
        <div><b>Upload verification document</b><p>JPG, PNG, WebP, or PDF · maximum 8 MB</p></div>
        <select value={documentType} onChange={(event) => setDocumentType(event.target.value)}><option value="national_id">National ID</option><option value="drivers_license">Driver&apos;s licence</option><option value="vehicle_registration">Vehicle registration</option></select>
        <label className="primary-button">{busy ? <Loader2 /> : <Plus />}{busy ? "Uploading" : "Choose file"}<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden disabled={busy} onChange={(event) => void upload(event.target.files?.[0])} /></label>
      </div>
      <div className="verification-list">
        {requests.map((request) => (
          <article key={String(request.id)}><FileCheck /><div><b>{String(request.document_type).replaceAll("_", " ")}</b><span>{new Date(Number(request.created_at)).toLocaleDateString()}</span></div><em>{String(request.status)}</em></article>
        ))}
      </div>
    </>
  );
}

function IntegrationPanel({ integrations }: { integrations: Record<string, boolean> }) {
  const items = [
    ["Cash on delivery", "cash", "Available"],
    ["MTN Mobile Money", "mtnMomo", "Payment credentials"],
    ["Orange Money", "orangeMoney", "Payment credentials"],
    ["Google sign-in", "google", "OAuth credentials"],
    ["Facebook sign-in", "facebook", "OAuth credentials"],
    ["Push notifications", "push", "Web Push credentials"],
    ["OpenStreetMap tracking", "maps", "Map rendering"],
    ["Route optimisation", "routeOptimization", "Routing provider key"],
  ];
  return (
    <>
      <PanelHeading title="Production integrations" text="External services remain disabled until their credentials are stored securely." />
      <div className="integration-list">
        {items.map(([label, key, note]) => (
          <article key={key}><span>{integrations[key] ? <Check /> : <Globe2 />}</span><div><b>{label}</b><p>{integrations[key] ? "Connected and available" : note}</p></div><em className={integrations[key] ? "ready" : ""}>{integrations[key] ? "Ready" : "Activation needed"}</em></article>
        ))}
      </div>
    </>
  );
}

function AdminPanel({ data, busy, run }: { data: Row; busy: boolean; run: (action: string, payload: Row, success: string) => void }) {
  const cards = [["Users", data.users], ["Active vendors", data.vendors], ["Orders", data.orders], ["Open tickets", data.openTickets], ["Rider reviews", data.pendingRiders]];
  const tickets = Array.isArray(data.tickets) ? data.tickets as Row[] : [];
  const verifications = Array.isArray(data.verifications) ? data.verifications as Row[] : [];
  return (
    <>
      <PanelHeading title="Administration" text="Protected operational oversight for authorised Kola administrators." />
      <div className="admin-export-row">
        <div><b>Business data export</b><p>Download a protected operational snapshot for backup and reconciliation.</p></div>
        <a className="secondary-button small" href="/api/admin/export">Download JSON</a>
      </div>
      <div className="platform-metrics admin">{cards.map(([label, value]) => <article key={String(label)}><span>{String(label)}</span><b>{String(value ?? 0)}</b></article>)}</div>
      <div className="admin-ticket-list">
        <h3>Recent support tickets</h3>
        {tickets.map((ticket) => (
          <AdminTicket key={String(ticket.id)} ticket={ticket} busy={busy} run={run} />
        ))}
      </div>
      <div className="admin-ticket-list verification-admin-list">
        <h3>Rider verification queue</h3>
        {verifications.map((request) => (
          <article key={String(request.id)}>
            <div>
              <b>{String(request.user_name)} · {String(request.document_type).replaceAll("_", " ")}</b>
              <span>{new Date(Number(request.created_at)).toLocaleString()} · {String(request.status)}</span>
            </div>
            <a className="secondary-button small" href={`/api/verification/${encodeURIComponent(String(request.id))}`} target="_blank" rel="noreferrer">Review file</a>
            {String(request.status) === "submitted" && <>
              <button className="secondary-button small danger" disabled={busy} onClick={() => run("admin_verification", { id: request.id, status: "rejected" }, "Verification rejected")}>Reject</button>
              <button className="primary-button small" disabled={busy} onClick={() => run("admin_verification", { id: request.id, status: "approved" }, "Rider verified")}>Approve</button>
            </>}
          </article>
        ))}
        {!verifications.length && <p className="platform-empty">No rider documents submitted.</p>}
      </div>
    </>
  );
}

function AdminTicket({ ticket, busy, run }: { ticket: Row; busy: boolean; run: (action: string, payload: Row, success: string) => void }) {
  const [message, setMessage] = useState("");
  const send = () => {
    const clean = message.trim();
    if (!clean) return;
    run("support_reply", { id: ticket.id, message: clean }, "Support reply sent");
    setMessage("");
  };
  return (
    <article className="admin-ticket">
      <div><b>{String(ticket.subject)}</b><span>{String(ticket.user_name)} · {String(ticket.id)}</span></div>
      <select disabled={busy} value={String(ticket.status)} onChange={(event) => run("admin_ticket_status", { id: ticket.id, status: event.target.value }, "Ticket updated")}><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select>
      <div className="admin-reply"><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Reply to customer" onKeyDown={(event) => { if (event.key === "Enter") send(); }} /><button disabled={busy || !message.trim() || String(ticket.status) === "closed"} onClick={send}><Send /></button></div>
    </article>
  );
}

function PanelHeading({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return <div className="platform-heading"><div><h2>{title}</h2><p>{text}</p></div>{action}</div>;
}
