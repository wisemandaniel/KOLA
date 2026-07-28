import { env } from "cloudflare:workers";
import { fetchFapshiPaymentStatus, integrationReadiness } from "../../../../integrations";
import { enforceRateLimit, secureJson } from "../../../../security";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

export async function POST(request: Request) {
  if (!integrationReadiness().fapshi) {
    return secureJson({ error: "Fapshi is not configured." }, 503);
  }
  const limited = await enforceRateLimit({
    request,
    scope: "payments.fapshi.webhook",
    limit: 600,
    windowSeconds: 60 * 60,
  });
  if (limited) return limited;

  let body: Row;
  try {
    body = (await request.json()) as Row;
  } catch {
    return secureJson({ error: "Invalid webhook payload." }, 400);
  }
  const transactionId = String(body.transId ?? "");
  if (!/^[a-zA-Z0-9_-]{3,100}$/.test(transactionId)) {
    return secureJson({ error: "Invalid transaction reference." }, 400);
  }

  const attempt = await env.DB.prepare(
    `SELECT * FROM payment_attempts
     WHERE provider='fapshi' AND provider_reference=? LIMIT 1`,
  )
    .bind(transactionId)
    .first<Row>();
  if (!attempt) return secureJson({ received: true });

  const verified = await fetchFapshiPaymentStatus(transactionId);
  if (
    (verified.externalId && verified.externalId !== String(attempt.order_id)) ||
    (verified.amount != null && verified.amount !== Number(attempt.amount))
  ) {
    await env.DB.prepare(
      `UPDATE payment_attempts
       SET status='failed',failure_reason=?,updated_at=? WHERE id=?`,
    )
      .bind("Fapshi reconciliation mismatch.", Date.now(), attempt.id)
      .run();
    return secureJson({ error: "Payment reconciliation mismatch." }, 409);
  }

  const now = Date.now();
  const statements = [
    env.DB.prepare(
      "UPDATE payment_attempts SET status=?,failure_reason=?,updated_at=? WHERE id=?",
    ).bind(verified.status, verified.reason ?? null, now, attempt.id),
  ];
  if (verified.status === "paid") {
    statements.push(
      env.DB.prepare(
        "UPDATE orders SET payment_status='paid',updated_at=? WHERE id=?",
      ).bind(now, attempt.order_id),
      env.DB.prepare(
        `INSERT INTO payments
          (id,order_id,provider,amount,status,provider_reference,created_at)
         SELECT ?,?,'fapshi',?,'paid',?,?
         WHERE NOT EXISTS (
           SELECT 1 FROM payments WHERE order_id=? AND provider_reference=?
         )`,
      ).bind(
        crypto.randomUUID(),
        attempt.order_id,
        attempt.amount,
        transactionId,
        now,
        attempt.order_id,
        transactionId,
      ),
    );
  }
  await env.DB.batch(statements);
  return secureJson({ received: true, status: verified.status });
}
