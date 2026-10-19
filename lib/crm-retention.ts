import { randomUUID } from "node:crypto";
import { db, one } from "./db";
import { audit } from "./crm";
import { luandaDate } from "./format";

// Explicit maintenance only. The default is a dry run; the website never calls it.
export async function cleanupCrm(apply = false, months = 24) {
  if (!Number.isInteger(months) || months < 1 || months > 120)
    throw new Error("O prazo deve estar entre 1 e 120 meses.");
  const cutoff = new Date();
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  return (await db()).transaction(async (tx) => {
    const rows = (
      await tx.query<{ id: string }>(
        `SELECT c.id FROM customers c WHERE c.created_at<$1 AND c.updated_at<$1
      AND NOT EXISTS(SELECT 1 FROM reservations r WHERE r.customer_id=c.id AND (r.created_at>=$1 OR r.updated_at>=$1 OR r.reservation_date>=$2)) FOR UPDATE OF c`,
        [cutoff.toISOString(), luandaDate(cutoff)],
      )
    ).rows;
    let reservations = 0;
    for (const row of rows) {
      const count = await one<{ count: number }>(
        "SELECT COUNT(*)::integer AS count FROM reservations WHERE customer_id=$1",
        [row.id],
        tx,
      );
      reservations += count!.count;
      if (apply) {
        await tx.query("DELETE FROM reservations WHERE customer_id=$1", [
          row.id,
        ]);
        await tx.query("DELETE FROM customers WHERE id=$1", [row.id]);
      }
    }
    if (apply) {
      await tx.query("DELETE FROM crm_rate_limits WHERE expires_at<NOW()");
      await audit(tx, "privacy", randomUUID(), "retention_applied", null, {
        months,
        customers: rows.length,
        reservations,
      });
    }
    return {
      mode: apply ? "applied" : "preview",
      months,
      customers: rows.length,
      reservations,
    };
  });
}
