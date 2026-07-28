import Link from "next/link";
import { notFound } from "next/navigation";

const documents = {
  terms: {
    title: "Terms of Service",
    intro:
      "These terms govern access to Kola’s commerce, delivery and communication services in Cameroon.",
    sections: [
      ["Using Kola", "You must provide accurate account and order information, keep your device secure, and use Kola only for lawful commerce. Businesses are responsible for their catalogues, prices, product quality and required licences."],
      ["Orders and delivery", "An order becomes active when it is accepted by the business. Delivery estimates are estimates, not guarantees. Customers, businesses and riders must use the private order channel responsibly and must not share pickup or delivery codes before the relevant handover."],
      ["Payments and fees", "Available payment methods are shown at checkout. Cash, Mobile Money and platform fees may differ by order. A Mobile Money payment is complete only after Kola receives a successful provider status."],
      ["Suspension and safety", "Kola may restrict accounts or content that creates fraud, safety, legal or platform-integrity risks. Emergency services should be contacted directly when someone is in immediate danger."],
      ["Liability", "Kola provides coordination software and takes reasonable care in operating it. To the extent permitted by applicable law, indirect losses and losses caused by information or conduct outside Kola’s control are excluded."],
      ["Changes and contact", "Material changes will be communicated in the app. Questions or disputes can be submitted through Kola Support in the Account workspace."],
    ],
  },
  privacy: {
    title: "Privacy Policy",
    intro:
      "This policy explains how Kola handles personal data for accounts, orders, delivery and support.",
    sections: [
      ["Data we collect", "We process account details, phone numbers, delivery addresses, order and payment records, messages, uploaded media, rider verification documents, device information and delivery location updates when those features are used."],
      ["Why we use it", "Data is used to authenticate accounts, fulfil orders, coordinate riders, process payments, prevent abuse, provide support, meet legal obligations and improve service reliability."],
      ["Who receives it", "Order information is shared only with the customer, relevant business, assigned rider and authorised Kola operators. Service providers receive the minimum information needed for messaging, payments, storage, authentication or maps."],
      ["Retention and security", "Records are retained only as long as needed for operations, disputes, safety, accounting and legal obligations. Kola uses access controls, encrypted transport, private storage and audit records, but no internet service can promise absolute security."],
      ["Your choices", "You can manage notification preferences and addresses in Account. Requests to access, correct or delete eligible data can be submitted through Kola Support. Some records may need to be retained for legal or fraud-prevention reasons."],
      ["International processing", "Some infrastructure and service providers may process data outside Cameroon under contractual and technical safeguards appropriate to the service."],
    ],
  },
  refunds: {
    title: "Cancellation & Refund Policy",
    intro:
      "This policy describes how cancellations, failed deliveries and payment reversals are handled.",
    sections: [
      ["Before acceptance", "Customers may cancel a pending order in the app. Reserved stock is returned automatically. Any confirmed electronic payment will be reviewed for reversal."],
      ["After acceptance", "Once preparation or pickup begins, cancellation depends on the business, rider progress and product type. Perishable or customised goods may not be refundable after preparation begins."],
      ["Missing, damaged or incorrect items", "Report the issue from the order’s support flow as soon as possible and include useful details or photos. Kola will coordinate review with the business and rider."],
      ["Mobile Money reversals", "Provider reversals can take additional processing time. A refund is complete only after the payment provider confirms it. Never send money to a personal number claiming to process a Kola refund."],
      ["Disputes", "If an issue is not resolved through the order conversation, open a support ticket. Kola may review order events, messages, handover codes and provider records."],
    ],
  },
} as const;

export default async function LegalPage({
  params,
}: {
  params: Promise<{ document: string }>;
}) {
  const { document } = await params;
  const content = documents[document as keyof typeof documents];
  if (!content) notFound();
  return (
    <main className="legal-page">
      <header>
        <Link className="pro-logo" href="/"><span>k</span>kola</Link>
        <Link href="/">Back to Kola</Link>
      </header>
      <article>
        <p className="legal-kicker">KOLA · CAMEROON</p>
        <h1>{content.title}</h1>
        <p className="legal-updated">Effective 28 July 2026</p>
        <p className="legal-intro">{content.intro}</p>
        {content.sections.map(([title, text]) => (
          <section key={title}>
            <h2>{title}</h2>
            <p>{text}</p>
          </section>
        ))}
      </article>
      <nav>
        <Link href="/legal/terms">Terms</Link>
        <Link href="/legal/privacy">Privacy</Link>
        <Link href="/legal/refunds">Refunds</Link>
      </nav>
    </main>
  );
}
