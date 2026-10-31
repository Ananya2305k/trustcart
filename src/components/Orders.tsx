import { useCallback, useEffect, useState } from "react";
import {
  Ban,
  Check,
  Headphones,
  Info,
  Package,
  RefreshCw,
  Truck,
  WalletCards,
  X,
} from "lucide-react";
import { apiRequest, authHeaders, errorMessage } from "../lib/api";
import {
  ORDER_STEPS,
  fmtDate,
  fmtDateTime,
  inr,
  isRefundEligible,
  shortId,
  statusTone,
} from "../lib/format";
import type { Order, Refund, TrackingEvent } from "../lib/types";

interface OrdersProps {
  token: string;
  onRequestRefund: (orderId: string) => void;
  onAskSupport: (orderId: string) => void;
}

const ACTOR_LABEL: Record<string, string> = {
  system: "Recorded automatically",
  customer: "Recorded by you",
  admin: "Recorded by the seller",
};

export function OrderProgress({ order }: { order: Order }) {
  if (order.orderStatus === "Cancelled") {
    const cancelled = [...order.trackingHistory]
      .reverse()
      .find((event) => event.status === "Cancelled");
    return (
      <div className="tc-cancelled">
        <Ban size={16} /> Cancelled
        {cancelled ? ` on ${fmtDateTime(cancelled.timestamp)}` : ""}
      </div>
    );
  }

  const currentIndex = ORDER_STEPS.indexOf(order.orderStatus);

  return (
    <ol className="tc-stepper" aria-label="Order progress">
      {ORDER_STEPS.map((step, index) => {
        const event = order.trackingHistory.find((e) => e.status === step);
        const state =
          index < currentIndex || (index === currentIndex && step === "Delivered")
            ? "done"
            : index === currentIndex
              ? "current"
              : "todo";

        return (
          <li key={step} className={`tc-step ${state}`}>
            <span className="tc-step-dot">
              {state === "done" ? <Check size={12} /> : index + 1}
            </span>
            <strong>{step}</strong>
            <small>{event ? fmtDateTime(event.timestamp) : "Not yet"}</small>
          </li>
        );
      })}
    </ol>
  );
}

function DeliveryLine({ order }: { order: Order }) {
  if (order.orderStatus === "Delivered") {
    const event = order.trackingHistory.find((e) => e.status === "Delivered");
    return (
      <p className="tc-delivery">
        <Truck size={15} /> Marked delivered on {fmtDateTime(event?.timestamp)}
      </p>
    );
  }
  if (order.orderStatus === "Cancelled") return null;

  const from = order.estimatedDelivery?.from;
  const to = order.estimatedDelivery?.to;
  if (!from || !to) return null;

  const history = order.estimateHistory ?? [];
  const revisions = Math.max(0, history.length - 1);
  const original = history[0];

  return (
    <div className="tc-delivery-block">
      <p className="tc-delivery">
        <Truck size={15} /> Estimated delivery: {fmtDate(from)} – {fmtDate(to)}
        <span className="tc-tag estimate">Estimate</span>
        {revisions > 0 && (
          <span className="tc-tag revised">
            Revised {revisions}×
          </span>
        )}
      </p>
      {revisions > 0 && original && (
        <small className="tc-muted">
          Originally promised {fmtDate(original.from)} – {fmtDate(original.to)}.
          See the delivery date history below for the reasons.
        </small>
      )}
      {order.estimateSource && (
        <small className="tc-muted">
          {order.estimateSource === "history"
            ? `Window based on the last ${order.estimateBasis ?? 0} deliveries.`
            : "Default window: there was not enough delivery history when you ordered."}
        </small>
      )}
    </div>
  );
}

function EstimateHistory({ order }: { order: Order }) {
  const history = order.estimateHistory ?? [];
  if (history.length === 0) return null;

  return (
    <>
      <h4>Delivery date history</h4>
      <ol className="tc-timeline">
        {history.map((entry, index) => (
          <li key={index}>
            <div className="tc-timeline-head">
              <strong>
                {fmtDate(entry.from)} – {fmtDate(entry.to)}
              </strong>
              <small>{fmtDateTime(entry.timestamp)}</small>
            </div>
            <p>
              {index === 0 ? "Original promise. " : "Revised. "}
              {entry.reason}
            </p>
            <small className="tc-muted">
              {ACTOR_LABEL[entry.recordedBy ?? "system"]}
            </small>
          </li>
        ))}
      </ol>
    </>
  );
}

function Timeline({ events }: { events: TrackingEvent[] }) {
  const sorted = [...events].sort(
    (a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  return (
    <ol className="tc-timeline">
      {sorted.map((event, index) => (
        <li key={`${event.status}-${index}`}>
          <div className="tc-timeline-head">
            <strong>{event.status}</strong>
            <small>{fmtDateTime(event.timestamp)}</small>
          </div>
          <p>{event.message}</p>
          <small className="tc-muted">
            {ACTOR_LABEL[event.recordedBy ?? "system"]}
          </small>
        </li>
      ))}
    </ol>
  );
}

export default function Orders({
  token,
  onRequestRefund,
  onAskSupport,
}: OrdersProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");
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
      setError(errorMessage(err, "Unable to load your orders."));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function cancelOrder(order: Order) {
    if (
      !window.confirm(
        `Cancel order #${shortId(order._id)}? Reserved stock is released and this cannot be undone.`
      )
    ) {
      return;
    }

    setBusyId(order._id);
    setError("");
    try {
      const response = await apiRequest<{ order: Order }>(
        `/orders/${order._id}/cancel`,
        { method: "POST", headers: authHeaders(token) }
      );
      setOrders((previous) =>
        previous.map((o) => (o._id === order._id ? response.order : o))
      );
    } catch (err) {
      setError(errorMessage(err, "Could not cancel this order."));
    } finally {
      setBusyId("");
    }
  }

  if (loading) {
    return (
      <section className="tc-page">
        <p>Loading your orders...</p>
      </section>
    );
  }

  return (
    <section className="tc-page">
      <div className="tc-page-head">
        <p>
          {orders.length} {orders.length === 1 ? "order" : "orders"}. Every
          timeline entry was recorded in TrustCart at the time shown.
        </p>
        <button
          type="button"
          className="tc-btn ghost"
          onClick={() => void load()}
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {error && (
        <p className="tc-error" role="alert">
          {error}
        </p>
      )}

      {orders.length === 0 ? (
        <div className="tc-empty">
          <Package size={36} />
          <h3>No orders yet</h3>
          <p>Orders you place will appear here with their full history.</p>
        </div>
      ) : (
        <div className="tc-stack">
          {orders.map((order) => {
            const refund = refunds.find(
              (r) => r.order?._id === order._id && r.status !== "Rejected"
            );
            const canCancel =
              order.orderStatus === "Placed" ||
              order.orderStatus === "Confirmed";
            const canRefund = isRefundEligible(order) && !refund;
            const open = expanded === order._id;

            return (
              <article className="tc-card" key={order._id}>
                <header className="tc-card-head">
                  <div>
                    <h3>Order #{shortId(order._id)}</h3>
                    <small>Placed {fmtDateTime(order.createdAt)}</small>
                  </div>
                  <span className={`tc-pill ${statusTone(order.orderStatus)}`}>
                    {order.orderStatus}
                  </span>
                </header>

                <OrderProgress order={order} />
                <DeliveryLine order={order} />

                {(order.carrier || order.trackingNumber) && (
                  <p className="tc-note">
                    <Info size={14} /> Shipping details entered by the seller:
                    {order.carrier ? ` ${order.carrier}` : ""}
                    {order.trackingNumber
                      ? ` · Tracking no. ${order.trackingNumber}`
                      : ""}
                    . TrustCart does not receive live carrier scans.
                  </p>
                )}

                <ul className="tc-items">
                  {order.items.map((item, index) => (
                    <li key={`${order._id}-${index}`}>
                      <span>
                        {item.name} × {item.quantity}
                      </span>
                      <span>{inr(item.price * item.quantity)}</span>
                    </li>
                  ))}
                  <li className="muted">
                    <span>Shipping</span>
                    <span>
                      {order.shippingFee === 0 ? "Free" : inr(order.shippingFee)}
                    </span>
                  </li>
                  <li className="total">
                    <span>
                      Total · payment {order.paymentStatus.toLowerCase()}{" "}
                      (simulated)
                    </span>
                    <span>{inr(order.total)}</span>
                  </li>
                </ul>

                {refund && (
                  <p className="tc-note">
                    <WalletCards size={14} /> Refund {refund.status.toLowerCase()}
                    : see Returns &amp; refunds for details.
                  </p>
                )}

                <div className="tc-actions">
                  <button
                    type="button"
                    className="tc-btn ghost"
                    onClick={() => setExpanded(open ? null : order._id)}
                  >
                    {open ? "Hide history" : "Show full history"}
                  </button>
                  {canCancel && (
                    <button
                      type="button"
                      className="tc-btn danger"
                      disabled={busyId === order._id}
                      onClick={() => void cancelOrder(order)}
                    >
                      <X size={15} />
                      {busyId === order._id ? "Cancelling..." : "Cancel order"}
                    </button>
                  )}
                  {canRefund && (
                    <button
                      type="button"
                      className="tc-btn"
                      onClick={() => onRequestRefund(order._id)}
                    >
                      <WalletCards size={15} /> Request refund
                    </button>
                  )}
                  <button
                    type="button"
                    className="tc-btn ghost"
                    onClick={() => onAskSupport(order._id)}
                  >
                    <Headphones size={15} /> Ask about this order
                  </button>
                </div>

                {open && (
                  <div className="tc-expand">
                    <h4>Recorded history</h4>
                    <Timeline events={order.trackingHistory} />
                    <EstimateHistory order={order} />
                    <h4>Delivering to</h4>
                    <p className="tc-address">
                      {order.shippingAddress.fullName}, {order.shippingAddress.addressLine},{" "}
                      {order.shippingAddress.city}, {order.shippingAddress.state}{" "}
                      {order.shippingAddress.postalCode}
                      {order.shippingAddress.country
                        ? `, ${order.shippingAddress.country}`
                        : ""}
                    </p>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
