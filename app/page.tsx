import Link from "next/link";
import { ArrowRight, Check, MapPin, MessageCircle, PackageCheck, ShoppingBag, Store, Truck, Users } from "lucide-react";
import { getChatGPTUser } from "./chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const user = await getChatGPTUser();
  const start = user ? "/dashboard" : "/signin-with-chatgpt?return_to=%2Fonboarding";
  return <main className="pro-site">
    <header className="pro-nav">
      <Link className="pro-logo" href="/"><span>k</span>kola</Link>
      <nav><a href="#product">Product</a><a href="#logistics">Logistics</a><a href="#businesses">Businesses</a><a href="#pricing">Pricing</a></nav>
      <div><Link className="quiet-link" href="/track/KL-2084">Track order</Link><Link className="outline-button" href={start}>Sign in</Link><Link className="blue-button" href={start}>Start free</Link></div>
    </header>

    <section className="pro-hero">
      <div className="pro-hero-copy">
        <div className="eyebrow-chip"><span>New</span> Delivery operations built in</div>
        <h1>Your online store,<br/>orders and delivery.<br/><em>All in one place.</em></h1>
        <p>Create a storefront, take structured orders and coordinate local delivery without juggling spreadsheets, phone calls and multiple apps.</p>
        <div className="hero-actions"><Link className="blue-button large" href={start}>Create your store <ArrowRight size={17}/></Link><Link className="quiet-link" href="/track/KL-2084">View a live delivery</Link></div>
        <div className="proof-line"><span><Check size={15}/>No setup fee</span><span><Check size={15}/>No commission on Basic</span><span><Check size={15}/>Cancel anytime</span></div>
      </div>
      <ProductPreview/>
    </section>

    <section className="logo-strip"><span>Built for businesses selling through</span><b>WhatsApp</b><b>Instagram</b><b>Facebook</b><b>In person</b></section>

    <section className="pro-section" id="product">
      <div className="section-heading"><span>SELL ONLINE</span><h2>From chat message to clean order.</h2><p>Give customers a simple catalogue and checkout, while your team manages every order from one dashboard.</p></div>
      <div className="feature-grid">
        <Feature icon={<Store/>} title="Your own storefront" text="Publish products, prices, stock and opening hours on a mobile-first store link."/>
        <Feature icon={<ShoppingBag/>} title="Structured checkout" text="Collect item choices, addresses, delivery instructions and payment method correctly."/>
        <Feature icon={<Users/>} title="Team workspace" text="Let staff prepare orders, assign delivery and keep customers updated from one place."/>
      </div>
    </section>

    <section className="ops-section" id="logistics">
      <div className="ops-copy"><span>DELIVERY OPERATIONS</span><h2>Delivery is part of the order—not a separate process.</h2><p>Assign a rider, follow pickup and drop-off, and keep the customer, vendor and rider in one order conversation.</p><ul><li><PackageCheck/>Dispatch from the order dashboard</li><li><MapPin/>Live location and delivery milestones</li><li><MessageCircle/>Shared order conversation</li><li><Truck/>Proof of pickup and delivery</li></ul><Link className="white-button" href="/track/KL-2084">Open tracking demo <ArrowRight size={16}/></Link></div>
      <OperationsPreview/>
    </section>

    <section className="pro-section split" id="businesses">
      <div className="section-heading left"><span>BUILT FOR CAMEROON</span><h2>Commerce tools that fit how local businesses work.</h2><p>English and French, FCFA pricing, landmark-based delivery instructions and payment methods familiar to your customers.</p></div>
      <div className="business-list"><div><b>Restaurants</b><span>Menus, modifiers, preparation times and delivery zones</span></div><div><b>Retail & fashion</b><span>Variants, stock, pickup and same-day delivery</span></div><div><b>Groceries</b><span>Substitutions, scheduled delivery and large baskets</span></div><div><b>Pharmacies</b><span>Private order handling and tracked fulfilment</span></div></div>
    </section>

    <section className="pricing-section" id="pricing"><div><span>START FREE</span><h2>Launch before you upgrade.</h2><p>Use Kola Basic to set up your store and test the full order flow. Upgrade when your team needs more volume and automation.</p></div><article><p>BASIC</p><h3>0 FCFA <small>/ month</small></h3><ul><li><Check/>Up to 50 orders monthly</li><li><Check/>Online storefront</li><li><Check/>Order and delivery management</li><li><Check/>Customer, vendor and rider chat</li></ul><Link className="blue-button large" href={start}>Start free <ArrowRight size={16}/></Link></article></section>

    <section className="final-cta"><h2>Take your next order with Kola.</h2><p>Set up your store in minutes. Add delivery when you need it.</p><Link className="blue-button large" href={start}>Create your store <ArrowRight size={16}/></Link></section>
    <footer className="pro-footer"><Link className="pro-logo" href="/"><span>k</span>kola</Link><p>Online commerce and local delivery for Cameroon.</p><nav><Link href="/track/KL-2084">Track order</Link><a href="#pricing">Pricing</a><Link href={start}>Sign in</Link></nav></footer>
  </main>;
}

function Feature({icon,title,text}:{icon:React.ReactNode;title:string;text:string}){return <article className="feature-card"><span>{icon}</span><h3>{title}</h3><p>{text}</p></article>}

function ProductPreview(){return <div className="product-preview"><div className="preview-top"><div><i/><i/><i/></div><span>chezmado.kola.cm</span><b>•••</b></div><div className="store-head"><div className="store-avatar">CM</div><div><strong>Chez Mado</strong><span><MapPin size={12}/>Bonapriso, Douala · Open</span></div><button><ShoppingBag size={17}/>0</button></div><div className="preview-search">Search products</div><div className="preview-tabs"><b>Popular</b><span>Main dishes</span><span>Drinks</span></div><div className="preview-products"><Product image="https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=500&q=80" name="Poulet DG" price="5,000"/><Product image="https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=500&q=80" name="Ndolé royal" price="3,500"/></div><div className="mini-order"><span className="success-dot"><Check size={14}/></span><div><strong>Order accepted</strong><small>Delivery is being arranged</small></div><b>KL-2084</b></div></div>}
function Product({image,name,price}:{image:string;name:string;price:string}){return <article><img src={image} alt=""/><strong>{name}</strong><span>Chez Mado</span><div><b>{price} FCFA</b><button>+</button></div></article>}
function OperationsPreview(){return <div className="ops-preview"><header><div><span>KM</span><strong>Kola operations</strong></div><small>Monday, 27 July</small></header><div className="ops-stats"><div><span>ORDERS TODAY</span><b>24</b></div><div><span>IN DELIVERY</span><b>7</b></div><div><span>ON-TIME RATE</span><b>94%</b></div></div><div className="order-table"><div className="table-head"><span>ORDER</span><span>CUSTOMER</span><span>DELIVERY</span><span>STATUS</span></div>{[["KL-2084","Mireille N.","Brice N.","On the way"],["KL-2087","Alain T.","Finding rider","Ready"],["KL-2091","Sarah E.","Loïc M.","Preparing"]].map((r)=><div className="table-row" key={r[0]}><b>{r[0]}</b><span>{r[1]}</span><span>{r[2]}</span><em>{r[3]}</em></div>)}</div><div className="delivery-card"><div className="rider-avatar">BN</div><div><strong>Brice picked up KL-2084</strong><span>2.4 km away · ETA 8 minutes</span></div><button>View tracking</button></div></div>}
