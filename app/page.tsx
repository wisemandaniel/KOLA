import Link from "next/link";
import {
  ArrowRight,
  Bike,
  Check,
  ChevronDown,
  MapPin,
  MessageCircle,
  PackageCheck,
  ShoppingBag,
  Store,
  Truck,
  Users,
} from "lucide-react";
import { getAuthenticatedUser } from "./auth";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const user = await getAuthenticatedUser();
  const start = user ? "/dashboard" : "/login?return_to=%2Fonboarding";

  return (
    <main className="pro-site">
      <header className="pro-nav">
        <Link className="pro-logo" href="/">
          <span>k</span>
          kola
        </Link>
        <nav>
          <a href="#product">Product</a>
          <a href="#logistics">Delivery</a>
          <a href="#businesses">Businesses</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <div>
          <Link className="quiet-link" href="/track/KL-2084">Track an order</Link>
          <Link className="outline-button" href={start}>Log in</Link>
          <Link className="blue-button" href={start}>Start free</Link>
        </div>
      </header>

      <section className="pro-hero">
        <div className="pro-hero-copy motion-in">
          <div className="eyebrow-chip">
            <span>Cameroon</span>
            Commerce and delivery, together
          </div>
          <h1>Sell online.<br />Deliver every order.</h1>
          <p>
            Give your customers a beautiful store, receive clean orders, and coordinate
            local delivery from one simple workspace.
          </p>
          <div className="hero-actions">
            <Link className="blue-button large" href={start}>
              Start for free <ArrowRight size={17} />
            </Link>
            <Link className="quiet-link" href="/track/KL-2084">
              See live tracking <ArrowRight size={15} />
            </Link>
          </div>
          <div className="proof-line">
            <span><Check size={15} />No setup fee</span>
            <span><Check size={15} />Built for FCFA</span>
            <span><Check size={15} />Mobile first</span>
          </div>
        </div>
        <ProductPreview />
      </section>

      <section className="logo-strip">
        <span>One storefront for every way you sell</span>
        <b>WhatsApp</b>
        <b>Instagram</b>
        <b>Facebook</b>
        <b>Walk-in</b>
      </section>

      <section className="pro-section muted-section reveal" id="product">
        <div className="section-heading">
          <span>ONLINE COMMERCE</span>
          <h2>Turn conversations into clean orders.</h2>
          <p>
            Customers shop independently. Your team receives every item, option, address,
            and payment choice in a consistent format.
          </p>
        </div>
        <div className="feature-grid">
          <Feature
            icon={<Store />}
            title="A beautiful storefront"
            text="Publish products, prices, stock and opening hours on a fast mobile store."
          />
          <Feature
            icon={<ShoppingBag />}
            title="Checkout built for mobile"
            text="Collect complete baskets, landmark-based addresses and delivery instructions."
          />
          <Feature
            icon={<Users />}
            title="One team workspace"
            text="Prepare orders, coordinate riders and keep customers updated without extra tools."
          />
        </div>
      </section>

      <section className="ops-section reveal" id="logistics">
        <div className="ops-copy">
          <span>DELIVERY OPERATIONS</span>
          <h2>Delivery belongs inside the order.</h2>
          <p>
            From ready-for-pickup to delivered, Kola keeps the business, rider, and
            customer on the same timeline.
          </p>
          <ul>
            <li><PackageCheck />Dispatch from the order workspace</li>
            <li><MapPin />Live location and delivery milestones</li>
            <li><MessageCircle />A shared order conversation</li>
            <li><Truck />Clear pickup and delivery confirmation</li>
          </ul>
          <Link className="white-button" href="/track/KL-2084">
            Open live tracking <ArrowRight size={16} />
          </Link>
        </div>
        <OperationsPreview />
      </section>

      <section className="pro-section split reveal" id="businesses">
        <div className="section-heading left">
          <span>MADE FOR CAMEROON</span>
          <h2>Familiar for customers. Practical for teams.</h2>
          <p>
            FCFA pricing, English and French-ready workflows, local landmarks, mobile
            ordering, and delivery coordination designed for how commerce works here.
          </p>
        </div>
        <div className="business-list">
          <div><b>Restaurants</b><span>Menus, preparation time, delivery zones and rider handoff</span></div>
          <div><b>Retail and fashion</b><span>Variants, inventory, pickup and same-day delivery</span></div>
          <div><b>Groceries</b><span>Large baskets, substitutions and scheduled delivery</span></div>
          <div><b>Pharmacies</b><span>Private order handling and tracked fulfilment</span></div>
        </div>
      </section>

      <section className="pricing-section reveal" id="pricing">
        <div className="section-heading">
          <span>PRICING</span>
          <h2>Start free. Grow when you are ready.</h2>
          <p>No commissions on the free plan. No long contract.</p>
        </div>
        <div className="pricing-grid">
          <PriceCard
            name="Basic"
            price="0 FCFA"
            note="For testing your first store"
            features={["50 orders monthly", "Mobile storefront", "Order management", "Customer tracking"]}
            href={start}
            cta="Start free"
          />
          <PriceCard
            featured
            name="Business"
            price="15,000 FCFA"
            note="For growing local businesses"
            features={["Unlimited orders", "Team workspace", "Delivery operations", "Order conversations"]}
            href={start}
            cta="Get started"
          />
          <PriceCard
            name="Operations"
            price="Custom"
            note="For multi-store and fleet teams"
            features={["Multiple stores", "Rider operations", "Priority onboarding", "Custom workflows"]}
            href={start}
            cta="Build your workspace"
          />
        </div>
      </section>

      <section className="faq-section reveal">
        <div className="section-heading">
          <span>FAQ</span>
          <h2>Questions, answered.</h2>
        </div>
        <div className="faq-list">
          <details>
            <summary>Can customers order without installing an app?<ChevronDown /></summary>
            <p>Yes. Every store and tracking link works directly in a mobile browser.</p>
          </details>
          <details>
            <summary>Can I use my own delivery riders?<ChevronDown /></summary>
            <p>Yes. Your rider team can accept jobs, share location and update each delivery.</p>
          </details>
          <details>
            <summary>Can customers and riders message each other?<ChevronDown /></summary>
            <p>Yes. Every order has a private conversation for its customer, business and assigned rider.</p>
          </details>
        </div>
      </section>

      <section className="final-cta reveal">
        <Bike />
        <h2>Clean orders. Coordinated delivery.</h2>
        <p>Start your Kola workspace in minutes.</p>
        <Link className="white-button" href={start}>
          Start for free <ArrowRight size={16} />
        </Link>
      </section>

      <footer className="pro-footer">
        <Link className="pro-logo" href="/"><span>k</span>kola</Link>
        <p>Online commerce and local delivery for Cameroon.</p>
        <nav>
          <Link href="/track/KL-2084">Track order</Link>
          <a href="#pricing">Pricing</a>
          <Link href={start}>Log in</Link>
        </nav>
      </footer>
    </main>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <article className="feature-card">
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

function PriceCard({
  name,
  price,
  note,
  features,
  href,
  cta,
  featured = false,
}: {
  name: string;
  price: string;
  note: string;
  features: string[];
  href: string;
  cta: string;
  featured?: boolean;
}) {
  return (
    <article className={`price-card ${featured ? "featured" : ""}`}>
      <div>
        <h3>{name}</h3>
        {featured && <span>Most popular</span>}
      </div>
      <strong>{price}</strong>
      <p>{note}</p>
      <Link href={href}>{cta}</Link>
      <small>INCLUDES</small>
      <ul>{features.map((feature) => <li key={feature}><Check />{feature}</li>)}</ul>
    </article>
  );
}

function ProductPreview() {
  return (
    <div className="hero-product-stage motion-in delay-one">
      <div className="product-preview">
        <div className="preview-top">
          <div><i /><i /><i /></div>
          <span>chezmado.kola.cm</span>
          <b>•••</b>
        </div>
        <div className="store-head">
          <div className="store-avatar">CM</div>
          <div>
            <strong>Chez Mado</strong>
            <span><MapPin size={12} />Bonapriso, Douala · Open</span>
          </div>
          <button><ShoppingBag size={17} />0</button>
        </div>
        <div className="preview-search">Search products</div>
        <div className="preview-tabs"><b>Popular</b><span>Main dishes</span><span>Drinks</span></div>
        <div className="preview-products">
          <Product
            image="https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=700&q=82"
            name="Poulet DG"
            price="5,000"
          />
          <Product
            image="https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=700&q=82"
            name="Ndolé royal"
            price="3,500"
          />
        </div>
        <div className="mini-order">
          <span className="success-dot"><Check size={14} /></span>
          <div><strong>Order accepted</strong><small>Delivery is being arranged</small></div>
          <b>KL-2084</b>
        </div>
      </div>
      <div className="floating-delivery">
        <span><Bike /></span>
        <div><small>DELIVERY IN PROGRESS</small><b>8–12 min away</b><p>Bonapriso → Akwa</p></div>
        <i />
      </div>
    </div>
  );
}

function Product({ image, name, price }: { image: string; name: string; price: string }) {
  return (
    <article>
      {/* Product imagery is intentionally merchant-provided and rendered directly. */}
      <img src={image} alt="" />
      <strong>{name}</strong>
      <span>Chez Mado</span>
      <div><b>{price} FCFA</b><button aria-label={`Add ${name}`}>+</button></div>
    </article>
  );
}

function OperationsPreview() {
  const rows = [
    ["KL-2084", "Mireille N.", "Brice N.", "On the way"],
    ["KL-2087", "Alain T.", "Finding rider", "Ready"],
    ["KL-2091", "Sarah E.", "Loïc M.", "Preparing"],
  ];

  return (
    <div className="ops-preview">
      <header>
        <div><span>KM</span><strong>Kola operations</strong></div>
        <small>Today, 10:42</small>
      </header>
      <div className="ops-stats">
        <div><span>ORDERS TODAY</span><b>24</b></div>
        <div><span>IN DELIVERY</span><b>7</b></div>
        <div><span>ON-TIME RATE</span><b>94%</b></div>
      </div>
      <div className="order-table">
        <div className="table-head"><span>ORDER</span><span>CUSTOMER</span><span>DELIVERY</span><span>STATUS</span></div>
        {rows.map((row) => (
          <div className="table-row" key={row[0]}>
            <b>{row[0]}</b><span>{row[1]}</span><span>{row[2]}</span><em>{row[3]}</em>
          </div>
        ))}
      </div>
      <div className="delivery-card">
        <div className="rider-avatar">BN</div>
        <div><strong>Brice picked up KL-2084</strong><span>2.4 km away · ETA 8 minutes</span></div>
        <button>View tracking</button>
      </div>
    </div>
  );
}
