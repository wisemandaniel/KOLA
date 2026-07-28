import { env } from "cloudflare:workers";
import Link from "next/link";
import { ArrowRight, MapPin, ShieldCheck, Star, Store } from "lucide-react";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

export default async function StorefrontPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const vendor = await env.DB.prepare(
    `SELECT id,name,slug,category,address,city,rating
     FROM vendors WHERE slug=? AND status='active' LIMIT 1`,
  )
    .bind(slug)
    .first<Row>();

  if (!vendor) {
    return (
      <main className="public-store missing">
        <div className="storefront-empty">
          <Store />
          <h1>Store not found</h1>
          <p>This Kola storefront is unavailable or no longer active.</p>
          <Link href="/">Return to Kola</Link>
        </div>
      </main>
    );
  }

  const [products, reviews] = await env.DB.batch([
    env.DB.prepare(
      `SELECT id,name,description,category,price,stock,image_key
       FROM products WHERE vendor_id=? AND active=1 ORDER BY created_at DESC`,
    ).bind(vendor.id),
    env.DB.prepare(
      `SELECT r.rating,r.comment,r.created_at,u.display_name
       FROM reviews r JOIN users u ON u.id=r.author_id
       WHERE r.subject_type='vendor' AND r.subject_id=?
       ORDER BY r.created_at DESC LIMIT 8`,
    ).bind(vendor.id),
  ]);

  return (
    <main className="public-store">
      <header className="storefront-nav">
        <Link className="app-logo" href="/">
          <span>k</span>
          <b>kola</b>
        </Link>
        <Link className="primary-button" href="/login?return_to=%2Fdashboard">
          Shop on Kola <ArrowRight />
        </Link>
      </header>

      <section className="storefront-hero">
        <div className="storefront-avatar">
          {String(vendor.name).slice(0, 2).toUpperCase()}
        </div>
        <div>
          <span>{String(vendor.category)}</span>
          <h1>{String(vendor.name)}</h1>
          <p>
            <MapPin /> {String(vendor.address)}, {String(vendor.city)}
          </p>
        </div>
        <div className="storefront-rating">
          <Star />
          <b>{Number(vendor.rating ?? 5).toFixed(1)}</b>
          <span>Verified Kola store</span>
        </div>
      </section>

      <section className="storefront-content">
        <div className="storefront-heading">
          <div>
            <span>PRODUCT CATALOGUE</span>
            <h2>Available now</h2>
          </div>
          <p>
            <ShieldCheck /> Secure ordering and coordinated local delivery through Kola.
          </p>
        </div>
        <div className="storefront-products">
          {products.results.map((product) => (
            <article key={String(product.id)}>
              <div className="storefront-product-image">
                {product.image_key ? (
                  <img
                    src={`/api/product-media/${encodeURIComponent(String(product.id))}`}
                    alt={String(product.name)}
                  />
                ) : (
                  <Store />
                )}
                {Number(product.stock) <= 3 && Number(product.stock) > 0 && (
                  <span>Only {Number(product.stock)} left</span>
                )}
              </div>
              <div>
                <small>{String(product.category)}</small>
                <h3>{String(product.name)}</h3>
                <p>{String(product.description || "Available for local delivery.")}</p>
                <strong>{Number(product.price).toLocaleString()} FCFA</strong>
              </div>
            </article>
          ))}
        </div>
        {!products.results.length && (
          <div className="storefront-empty compact">
            <Store />
            <h2>Products coming soon</h2>
            <p>This store is preparing its Kola catalogue.</p>
          </div>
        )}

        {reviews.results.length > 0 && (
          <section className="storefront-reviews">
            <span>CUSTOMER REVIEWS</span>
            <h2>What customers say</h2>
            <div>
              {reviews.results.map((review, index) => (
                <article key={`${String(review.created_at)}-${index}`}>
                  <div>
                    <b>{String(review.display_name)}</b>
                    <span>{Number(review.rating)} / 5</span>
                  </div>
                  <p>{String(review.comment || "Great experience.")}</p>
                </article>
              ))}
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
