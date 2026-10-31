import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { WalletCards } from "lucide-react";
import { apiRequest, authHeaders, errorMessage } from "../lib/api";
import {
  REFUND_WINDOW_DAYS,
  fmtDateTime,
  inr,
  isRefundEligible,
  shortId,
  statusTone,
} from "../lib/format";
import type { Order, Refund } from "../lib/types";

export const REFUND_REASONS = [
  "Item damaged or defective",
  "Wrong item received",
  "Item not as described",
  "No longer needed",
  "Other",
];

const STAGE_HELP: Record<string, string> = {
  Requested: "We received your request. A person will start reviewing it.",
  "Under review": "Your request is being reviewed.",
  Approved: "Approved. The refund payout is the last step.",
  Rejected: "This request was rejected. The reason is shown below.",
  Refunded: "The refund was issued (simulated payment in this demo).",
};

interface RefundsProps {
  token: string;
  initialOrderId?: string;
}

export default function Refunds({ token, initialOrderId }: RefundsProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [orderId, setOrderId] = useState(initialOrderId ?? "");
  const [reason, setReason] = useState(REFUND_REASONS[0]);
  const [details, setDetails] = useState("");

  const load = useCallback(async () => {
    try {
      const [orderRes, refundRes] = await Promise.all([
        apiRequest<{ orders: Order[] }>("/orders", {
          headers: authHeaders(token),
        }),
        apiRequest<{ refunds: Refund[] }>("/refunds", {
          headers: authHeaders(token),
        }),
      ]);
      setOrders(orderRes.orders);
      setRefunds(refundRes.refunds);
    } catch (err) {
      setError(errorMessage(err, "Unable to load refunds."));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const eligible = orders.filter(
    (order) =>
      isRefundEligible(order) &&
      !refunds.some((r) => r.order?._id === order._id && r.status !== "Rejected")
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await apiRequest("/refunds", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ orderId, reason, details }),
      });
      setOrderId("");
      setDetails("");
      await load();
    } catch (err) {
      setError(errorMessage(err, "Could not submit your refund request."));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <section className="tc-page">
        <p>Loading refunds...</p>
      </section>
    );
  }

  return (
    <section className="tc-page">
      {error && (
        <p className="tc-error" role="alert">
          {error}
        </p>
      )}

      <form className="tc-card tc-form" onSubmit={submit}>
        <h3>Request a refund</h3>
        <p className="tc-muted">
          Available for orders delivered within the last {REFUND_WINDOW_DAYS}{" "}
          days that have no open refund request.
        </p>

        {eligible.length === 0 ? (
          <p className="tc-muted">No orders are eligible right now.</p>
        ) : (
          <>
            <label>
              Order
              <select
                required
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
              >
                <option value="">Choose an order</option>
                {eligible.map((order) => (
                  <option key={order._id} value={order._id}>
                    #{shortId(order._id)} · {inr(order.total)} ·{" "}
                    {order.items.map((i) => i.name).join(", ").slice(0, 50)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Reason
              <select value={reason} onChange={(e) => setReason(e.target.value)}>
                {REFUND_REASONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>

            <label>
              Details (optional)
              <textarea
                rows={3}
                maxLength={1000}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Anything that helps us review your request"
              />
            </label>

            <button className="tc-btn" type="submit" disabled={submitting}>
              {submitting ? "Submitting..." : "Submit request"}
            </button>
          </>
        )}
      </form>

      {refunds.length === 0 ? (
        <div className="tc-empty">
          <WalletCards size={36} />
          <h3>No refund requests</h3>
          <p>Requests you make will show each stage with a timestamp.</p>
        </div>
      ) : (
        <div className="tc-stack">
          {refunds.map((refund) => (
            <article className="tc-card" key={refund._id}>
              <header className="tc-card-head">
                <div>
                  <h3>
                    {inr(refund.amount)} · Order #
                    {refund.order ? shortId(refund.order._id) : "—"}
                  </h3>
                  <small>
                    {refund.reason} · requested {fmtDateTime(refund.createdAt)}
                  </small>
                </div>
                <span className={`tc-pill ${statusTone(refund.status)}`}>
                  {refund.status}
                </span>
              </header>

              <p className="tc-muted">{STAGE_HELP[refund.status]}</p>

              {refund.adminNote && (
                <p className="tc-note">Note from the seller: {refund.adminNote}</p>
              )}

              <ol className="tc-timeline">
                {refund.history.map((entry, index) => (
                  <li key={index}>
                    <div className="tc-timeline-head">
                      <strong>{entry.status}</strong>
                      <small>{fmtDateTime(entry.timestamp)}</small>
                    </div>
                    <p>{entry.message}</p>
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
