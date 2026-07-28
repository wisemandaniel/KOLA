"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bike,
  Check,
  MessageCircle,
  PackageCheck,
  ShieldCheck,
  Store,
} from "lucide-react";

type Step = "phone" | "code";

export default function LoginClient({
  returnTo,
  whatsappReady,
  initialError,
}: {
  returnTo: string;
  whatsappReady: boolean;
  initialError: string;
}) {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setInterval(
      () => setResendIn((current) => Math.max(0, current - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [resendIn]);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  const requestCode = async (event?: FormEvent) => {
    event?.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/whatsapp/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const result = (await response.json()) as {
        challengeId?: string;
        maskedPhone?: string;
        error?: string;
      };
      if (!response.ok || !result.challengeId) {
        throw new Error(result.error ?? "We could not send your verification code.");
      }
      setChallengeId(result.challengeId);
      setMaskedPhone(result.maskedPhone ?? phone);
      setCode("");
      setStep("code");
      setResendIn(45);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "We could not send your verification code.",
      );
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/whatsapp/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeId, code, returnTo }),
      });
      const result = (await response.json()) as {
        redirectTo?: string;
        error?: string;
      };
      if (!response.ok || !result.redirectTo) {
        throw new Error(result.error ?? "We could not verify that code.");
      }
      window.location.assign(result.redirectTo);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "We could not verify that code.",
      );
      setBusy(false);
    }
  };

  const localPhone = phone.replace(/\D/g, "").slice(0, 9);
  const phoneReady = /^6\d{8}$/.test(localPhone);
  const codeReady = /^\d{6}$/.test(code);

  return (
    <main className="auth-page">
      <header className="auth-header">
        <Link className="pro-logo" href="/">
          <span>k</span>
          kola
        </Link>
        <Link href="/" className="auth-back-link">
          <ArrowLeft />
          Back to Kola
        </Link>
      </header>

      <div className="auth-shell">
        <section className="auth-card motion-in">
          <div className="auth-card-heading">
            <span className="auth-kicker">
              <ShieldCheck />
              Secure account access
            </span>
            <h1>{step === "phone" ? "Welcome to Kola" : "Check your WhatsApp"}</h1>
            <p>
              {step === "phone"
                ? "Sign in or create your account with the mobile number you already use."
                : `We sent a 6-digit verification code to ${maskedPhone}.`}
            </p>
          </div>

          {step === "phone" ? (
            <form className="auth-form" onSubmit={requestCode}>
              <label htmlFor="phone">WhatsApp number</label>
              <div className="auth-phone-field">
                <span>
                  <i>🇨🇲</i>
                  +237
                </span>
                <input
                  id="phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  autoFocus
                  value={localPhone}
                  onChange={(event) =>
                    setPhone(event.target.value.replace(/\D/g, "").slice(0, 9))
                  }
                  placeholder="6XX XXX XXX"
                  aria-describedby="phone-help"
                />
              </div>
              <small id="phone-help">
                {whatsappReady
                  ? "We will send a one-time code through WhatsApp. No password needed."
                  : "WhatsApp verification is being connected. Sign-in will be available as soon as activation is complete."}
              </small>
              {error && <div className="auth-error">{error}</div>}
              <button
                className="auth-primary"
                disabled={!whatsappReady || !phoneReady || busy}
              >
                <MessageCircle />
                {busy
                  ? "Sending code…"
                  : whatsappReady
                    ? "Continue with WhatsApp"
                    : "WhatsApp sign-in coming online"}
                {!busy && whatsappReady && <ArrowRight />}
              </button>
            </form>
          ) : (
            <form className="auth-form" onSubmit={verifyCode}>
              <label htmlFor="code">Verification code</label>
              <input
                ref={codeRef}
                className="auth-code-input"
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="000000"
                aria-describedby="code-help"
              />
              <small id="code-help">The code expires after 10 minutes.</small>
              {error && <div className="auth-error">{error}</div>}
              <button className="auth-primary" disabled={!codeReady || busy}>
                {busy ? "Verifying…" : "Verify and continue"}
                {!busy && <ArrowRight />}
              </button>
              <div className="auth-code-actions">
                <button
                  type="button"
                  onClick={() => {
                    setStep("phone");
                    setError("");
                  }}
                >
                  Change number
                </button>
                <button
                  type="button"
                  disabled={resendIn > 0 || busy}
                  onClick={() => requestCode()}
                >
                  {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
                </button>
              </div>
            </form>
          )}
          <p className="auth-legal">
            By continuing, you agree to Kola&apos;s <Link href="/legal/terms">Terms</Link>{" "}
            and acknowledge our <Link href="/legal/privacy">Privacy Policy</Link>.
          </p>
        </section>

        <aside className="auth-preview motion-in delay-one">
          <div className="auth-preview-copy">
            <span>ONE ACCOUNT, THREE WORKSPACES</span>
            <h2>Commerce moves better when everyone stays connected.</h2>
            <p>
              Customers, businesses and delivery riders use the same order timeline
              and conversation.
            </p>
          </div>
          <div className="auth-flow-card">
            <div className="auth-flow-top">
              <span>Order KL-2084</span>
              <b>On the way</b>
            </div>
            <div className="auth-flow-route">
              <i><Store /></i>
              <span><em /></span>
              <i className="active"><Bike /></i>
              <span />
              <i><PackageCheck /></i>
            </div>
            <div className="auth-flow-message">
              <span>BN</span>
              <div>
                <b>Brice · Delivery rider</b>
                <p>I have your order. I&apos;ll call when I reach the gate.</p>
              </div>
              <Check />
            </div>
          </div>
          <div className="auth-trust-row">
            <span><Check />Private order conversations</span>
            <span><Check />Secure one-time verification</span>
          </div>
        </aside>
      </div>
    </main>
  );
}
