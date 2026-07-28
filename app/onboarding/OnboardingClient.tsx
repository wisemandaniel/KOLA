"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bike,
  Check,
  ShieldCheck,
  ShoppingBag,
  Store,
} from "lucide-react";

export default function OnboardingClient({
  name,
  phone: initialPhone,
  phoneVerified,
}: {
  name: string;
  phone: string;
  phoneVerified: boolean;
}) {
  const [step, setStep] = useState(1);
  const [role, setRole] = useState("customer");
  const [displayName, setDisplayName] = useState(
    phoneVerified && name.startsWith("+") ? "" : name,
  );
  const [phone, setPhone] = useState(localPhone(initialPhone));
  const [city, setCity] = useState("Douala");
  const [address, setAddress] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessCategory, setBusinessCategory] = useState("Restaurant");
  const [vehicleType, setVehicleType] = useState("motorcycle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const finish = async () => {
    setBusy(true);
    setError("");
    const response = await fetch("/api/workspace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "complete_onboarding",
        role,
        displayName,
        phone,
        city,
        address,
        businessName,
        businessCategory,
        vehicleType,
      }),
    });
    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setError(data.error || "Registration failed");
      setBusy(false);
      return;
    }
    router.push("/dashboard");
  };

  const thirdStepTitle =
    role === "vendor"
      ? "Business details"
      : role === "rider"
        ? "Delivery profile"
        : "Delivery address";

  return (
    <main className="registration">
      <header>
        <Link className="pro-logo" href="/">
          <span>k</span>
          kola
        </Link>
        <span>Account setup</span>
      </header>
      <div className="registration-shell">
        <aside>
          <span className={step >= 1 ? "active" : ""}>
            <i>{step > 1 ? <Check size={13} /> : 1}</i>
            <b>Choose your account</b>
          </span>
          <span className={step >= 2 ? "active" : ""}>
            <i>{step > 2 ? <Check size={13} /> : 2}</i>
            <b>Contact details</b>
          </span>
          <span className={step >= 3 ? "active" : ""}>
            <i>3</i>
            <b>{thirdStepTitle}</b>
          </span>
        </aside>

        <section>
          <p className="reg-kicker">WELCOME, {name.toUpperCase()}</p>
          {step === 1 && (
            <>
              <h1>How will you use Kola?</h1>
              <p className="reg-subtitle">
                Choose the account that matches what you want to do. This controls
                your workspace and permissions.
              </p>
              <div className="reg-roles">
                <RoleButton
                  active={role === "customer"}
                  icon={<ShoppingBag />}
                  title="Customer"
                  text="Shop and track deliveries"
                  onClick={() => setRole("customer")}
                />
                <RoleButton
                  active={role === "vendor"}
                  icon={<Store />}
                  title="Business"
                  text="Sell products and fulfil orders"
                  onClick={() => setRole("vendor")}
                />
                <RoleButton
                  active={role === "rider"}
                  icon={<Bike />}
                  title="Delivery rider"
                  text="Accept and complete deliveries"
                  onClick={() => setRole("rider")}
                />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h1>Your contact details</h1>
              <p className="reg-subtitle">
                We use these details for order updates and delivery coordination.
              </p>
              <label>
                Full name
                <span>Required</span>
              </label>
              <input
                autoComplete="name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Your full name"
              />
              <label>
                Mobile number
                <span>{phoneVerified ? "Verified" : "Required"}</span>
              </label>
              <div className={`phone-field production ${phoneVerified ? "verified" : ""}`}>
                <span>+237</span>
                <input
                  inputMode="tel"
                  readOnly={phoneVerified}
                  value={phone}
                  onChange={(event) =>
                    setPhone(event.target.value.replace(/\D/g, "").slice(0, 9))
                  }
                  placeholder="6XX XXX XXX"
                />
                {phoneVerified && <ShieldCheck aria-label="Verified with WhatsApp" />}
              </div>
              <small className="field-help">
                {phoneVerified
                  ? "Verified securely through WhatsApp."
                  : "This number is used for delivery updates and order coordination."}
              </small>
              <label>
                City
                <span>Required</span>
              </label>
              <select value={city} onChange={(event) => setCity(event.target.value)}>
                <option>Douala</option>
                <option>Yaoundé</option>
                <option>Bafoussam</option>
                <option>Bamenda</option>
                <option>Limbe</option>
                <option>Other</option>
              </select>
            </>
          )}

          {step === 3 && (
            <>
              <h1>
                {role === "vendor"
                  ? "Set up your business"
                  : role === "rider"
                    ? "Your delivery profile"
                    : "Where should we deliver?"}
              </h1>
              <p className="reg-subtitle">
                {role === "vendor"
                  ? "You can change these details later from store settings."
                  : role === "rider"
                    ? "Your profile will be reviewed before delivery payouts are enabled."
                    : "Landmarks and access instructions help riders find you."}
              </p>
              {role === "vendor" && (
                <>
                  <label>
                    Business name
                    <span>Required</span>
                  </label>
                  <input
                    value={businessName}
                    onChange={(event) => setBusinessName(event.target.value)}
                    placeholder="e.g. Chez Mado"
                  />
                  <label>Business type</label>
                  <select
                    value={businessCategory}
                    onChange={(event) => setBusinessCategory(event.target.value)}
                  >
                    <option>Restaurant</option>
                    <option>Grocery</option>
                    <option>Fashion</option>
                    <option>Pharmacy</option>
                    <option>Retail</option>
                    <option>Services</option>
                  </select>
                  <label>
                    Pickup address
                    <span>Required</span>
                  </label>
                  <textarea
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    placeholder="Street, neighbourhood and nearby landmark"
                  />
                </>
              )}
              {role === "rider" && (
                <>
                  <label>
                    Vehicle type
                    <span>Required</span>
                  </label>
                  <select
                    value={vehicleType}
                    onChange={(event) => setVehicleType(event.target.value)}
                  >
                    <option value="motorcycle">Motorcycle</option>
                    <option value="bicycle">Bicycle</option>
                    <option value="car">Car</option>
                    <option value="van">Van</option>
                  </select>
                  <div className="info-panel">
                    Vehicle and identity documents are required before your account
                    can receive customer deliveries.
                  </div>
                </>
              )}
              {role === "customer" && (
                <>
                  <label>
                    Default delivery address
                    <span>Required</span>
                  </label>
                  <textarea
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    placeholder="Street, neighbourhood, landmark and gate details"
                  />
                </>
              )}
            </>
          )}

          {error && <div className="form-error">{error}</div>}
          <div className="reg-actions">
            {step > 1 && (
              <button className="back-button" onClick={() => setStep((value) => value - 1)}>
                <ArrowLeft size={16} />
                Back
              </button>
            )}
            <button
              className="blue-button large"
              disabled={
                busy ||
                (step === 2 &&
                  (!displayName.trim() || phone.replace(/\D/g, "").length !== 9)) ||
                (step === 3 && role !== "rider" && !address.trim()) ||
                (step === 3 && role === "vendor" && !businessName.trim())
              }
              onClick={() => (step < 3 ? setStep((value) => value + 1) : finish())}
            >
              {busy
                ? "Creating account…"
                : step < 3
                  ? <>Continue <ArrowRight size={16} /></>
                  : <>Finish setup <ArrowRight size={16} /></>}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

function RoleButton({
  active,
  icon,
  title,
  text,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  text: string;
  onClick: () => void;
}) {
  return (
    <button className={active ? "active" : ""} onClick={onClick}>
      {icon}
      <div>
        <b>{title}</b>
        <span>{text}</span>
      </div>
    </button>
  );
}

function localPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("237") ? digits.slice(3, 12) : digits.slice(0, 9);
}
