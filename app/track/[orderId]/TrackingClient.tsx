"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Bike,
  Check,
  LockKeyhole,
  MapPin,
  MessageCircle,
  Share2,
  Store,
} from "lucide-react";

type TrackData = {
  order: { id: string; status: string; delivery_address: string };
  delivery?: {
    status: string;
    pickup_address: string;
    dropoff_address: string;
    distance_km: number;
    current_lat?: number;
    current_lng?: number;
    location_updated_at?: number;
  };
  events: { event_type: string; label: string; created_at: number }[];
  courier?: { name: string; rating: number; vehicle: string };
  vendor: { name: string };
};

const steps = ["accepted", "preparing", "picked_up", "on_the_way", "delivered"];

export default function TrackingClient({ orderId }: { orderId: string }) {
  const [data, setData] = useState<TrackData | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/track/${encodeURIComponent(orderId)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("not found");
        setData(await response.json());
      })
      .catch(() => setError("We couldn't find that order."));
  }, [orderId]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 10_000);
    return () => window.clearInterval(timer);
  }, [load]);

  if (error) {
    return (
      <main className="tracking-page">
        <TrackHeader />
        <section className="tracking-error">
          <MapPin />
          <h1>Order not found</h1>
          <p>Check the tracking number and try again.</p>
          <Link href="/">Return home</Link>
        </section>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="tracking-page">
        <TrackHeader />
        <div className="tracking-loading">Locating your delivery...</div>
      </main>
    );
  }

  const status = data.delivery?.status || data.order.status;
  const normalized = status === "picked_up" ? "on_the_way" : status;
  const active = Math.max(0, steps.indexOf(normalized));

  const shareTracking = async () => {
    await navigator.clipboard.writeText(location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main className="tracking-page">
      <TrackHeader />
      <section className="tracking-shell">
        <div className="tracking-title">
          <div>
            <p>LIVE ORDER TRACKING</p>
            <h1>Order #{data.order.id}</h1>
            <span>Updates automatically every 10 seconds</span>
          </div>
          <button onClick={shareTracking}>
            {copied ? <Check size={14} /> : <Share2 size={14} />}
            {copied ? "Link copied" : "Share tracking"}
          </button>
        </div>

        <div className="tracking-grid">
          <article className="tracking-map">
            <div className="track-road a" />
            <div className="track-road b" />
            <div className="track-road c" />
            <div className="track-route" />
            <span className="track-pin shop" aria-label="Vendor">
              <Store size={18} />
            </span>
            <span className="track-pin rider" aria-label="Rider">
              <Bike size={18} />
            </span>
            <span className="track-pin destination" aria-label="Destination">
              <MapPin size={18} />
            </span>
            <div className="eta-card">
              <small>ESTIMATED ARRIVAL</small>
              <strong>{status === "delivered" ? "Delivered" : "8-12 min"}</strong>
              <span>{data.delivery?.distance_km || 2.4} km remaining</span>
            </div>
          </article>

          <aside className="tracking-panel">
            <div className="tracking-status">
              <i />
              <div>
                <small>{status.replaceAll("_", " ").toUpperCase()}</small>
                <h2>{status === "delivered" ? "Your order has arrived." : "Your delivery is moving."}</h2>
                <p>
                  {data.courier?.name || "A rider"} is heading to{" "}
                  {data.delivery?.dropoff_address || data.order.delivery_address}.
                </p>
              </div>
            </div>

            <div className="track-courier">
              <span>{initials(data.courier?.name || "Kola Rider")}</span>
              <div>
                <strong>{data.courier?.name || "Assigning rider"}</strong>
                <small>
                  {data.courier?.rating ? `${data.courier.rating} rating` : "Rating pending"}
                  {" · "}
                  {data.courier?.vehicle || "Courier"}
                </small>
              </div>
              <Link href="/signin-with-chatgpt?return_to=%2Fdashboard">
                <MessageCircle size={13} />
                Message
              </Link>
            </div>

            <div className="timeline">
              {steps.map((step, index) => {
                const event = data.events.find((item) => item.event_type === step);
                return (
                  <div className={`${index <= active ? "done" : ""} ${index === active ? "current" : ""}`} key={step}>
                    <i>{index < active ? <Check size={11} /> : null}</i>
                    <div>
                      <strong>{step.replaceAll("_", " ")}</strong>
                      <small>
                        {index <= active
                          ? event
                            ? new Date(event.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                            : "Completed"
                          : "Waiting"}
                      </small>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="tracking-help">
              <span>Need help with this order?</span>
              <Link href="/signin-with-chatgpt?return_to=%2Fdashboard">Open order support</Link>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function TrackHeader() {
  return (
    <header className="track-header">
      <Link className="brand" href="/">
        <span className="brandmark">K</span>
        <span>KOLA</span>
      </Link>
      <span>
        <LockKeyhole size={12} />
        Secure live tracking
      </span>
      <Link href="/dashboard">Open Kola</Link>
    </header>
  );
}
