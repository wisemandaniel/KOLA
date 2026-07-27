"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function OnboardingClient({ name }: { name: string }) {
  const [role, setRole] = useState("customer"); const [phone, setPhone] = useState(""); const [city, setCity] = useState("Douala"); const [busy, setBusy] = useState(false); const router = useRouter();
  const finish = async () => { setBusy(true); await fetch("/api/workspace", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ action:"complete_onboarding", role, phone, city }) }); router.push("/dashboard"); };
  return <main className="onboarding"><LinkLogo/><section><p>WELCOME TO KOLA</p><h1>Let’s set up your account.</h1><span>Signed in as {name}</span><label>I want to</label><div className="onboarding-roles">{[["customer","🛍️","Buy"],["vendor","🏪","Sell"],["rider","🛵","Deliver"]].map(([value,icon,label])=><button className={role===value?"active":""} key={value} onClick={()=>setRole(value)}><b>{icon}</b><strong>{label}</strong></button>)}</div><label>Phone number</label><div className="phone-field"><span>+237</span><input value={phone} onChange={(e)=>setPhone(e.target.value)} placeholder="6XX XXX XXX"/></div><small>SMS verification will be enabled when the production provider is connected.</small><label>Primary city</label><select value={city} onChange={(e)=>setCity(e.target.value)}><option>Douala</option><option>Yaoundé</option><option>Bafoussam</option><option>Bamenda</option><option>Other</option></select><button className="primary finish-button" disabled={busy||phone.length<8} onClick={finish}>{busy?"Saving…":"Continue to Kola →"}</button></section></main>;
}
function LinkLogo(){return <a className="brand onboarding-brand" href="/"><span className="brandmark">K</span><span>KOLA</span></a>}
