import { useCallback, useEffect, useState } from "react";
import { apiRequest, authHeaders, errorMessage } from "../../lib/api";
import {
  ORDER_TRANSITIONS,
  fmtDate,
  fmtDateTime,
  inr,
  shortId,
  statusTone,
} from "../../lib/format";
import type { AdminOrder, OrderStatus } from "../../lib/types";

function OrderRow({
  order,
  token,
  onUpdated,
}: {
  order: AdminOrder;
  token: string;
  onUpdated: (order: AdminOrder) => void;
}) {
  const [message, setMessage] = useState("");
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const next = ORDER_TRANSITIONS[order.orderStatus];

  const [reviseOpen, setReviseOpen] = useState(false);
  const [newFrom, setNewFrom] = useState("");
  const [newTo, setNewTo] = useState("");
  const [reviseReason, setReviseReason] = useState("");

  const toInputDate = (iso?: string) => (iso ? iso.slice(0, 10) : "");

  async function reviseEstimate() {
    setBusy(true);
    setError("");
    try {
      const res = await apiRequest<{ order: AdminOrder }>(
        `/orders/${order._id}/estimate`,
        {
          method: "PATCH",
          headers: authHeaders(token),
          body: JSON.stringify({ from: newFrom, to: newTo, reason: reviseReason }),
        }
      );
      onUpdated({ ...res.order, user: order.user });
      setReviseOpen(false);
      setReviseReason("");
    } catch (err) {
      setError(errorMessage(err, "Could not revise the estimate."));
    } finally {
      setBusy(false);
    }
  }

  async function change(status: OrderStatus) {
    if (
      status === "Cancelled" &&
      !window.confirm("Cancel this order? Stock will be restored.")
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await apiRequest<{ order: AdminOrder }>(
        `/orders/${order._id}/status`,
        {
          method: "PATCH",
          headers: authHeaders(token),
          body: JSON.stringify({
            status,
            message: message || undefined,
            carrier: status === "Shipped" ? carrier || undefined : undefined,
            trackingNumber:
              status === "Shipped" ? trackingNumber || undefined : undefined,
          }),
        }
      );
      // The status endpoint returns the order without the populated customer.
      onUpdated({ ...res.order, user: order.user });
      setMessage("");
    } catch (err) {
      setError(errorMessage(err, "Could not update the order."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="tc-card">
      <header className="tc-card-head">
        <div>
          <h3>
            #{shortId(order._id)} · {inr(order.total)}
          </h3>
          <small>
            {order.user?.name ?? "Unknown customer"} ({order.user?.email ?? "—"}) ·{" "}
            {fmtDateTime(order.createdAt)}
          </small>
        </div>
        <span className={`tc-pill ${statusTone(order.orderStatus)}`}>
          {order.orderStatus}
        </span>
      </header>

      <p className="tc-muted">
        {order.items.map((i) => `${i.name} × ${i.quantity}`).join(", ")}
      </p>
      <p className="tc-muted">
        Ship to: {order.shippingAddress.fullName}, {order.shippingAddress.addressLine},{" "}
        {order.shippingAddress.city} {order.shippingAddress.postalCode} ·{" "}
        {order.shippingAddress.phone}
      </p>

      {next.length > 0 && (
        <div className="tc-admin-actions">
          <div className="tc-revise">
            <p className="tc-muted">
              Estimated delivery: {fmtDate(order.estimatedDelivery?.from)} –{" "}
              {fmtDate(order.estimatedDelivery?.to)}
              {(order.estimateHistory?.length ?? 0) > 1 &&
                ` · revised ${(order.estimateHistory?.length ?? 1) - 1}×`}
            </p>
            {!reviseOpen ? (
              <button
                type="button"
                className="tc-btn ghost"
                onClick={() => {
                  setNewFrom(toInputDate(order.estimatedDelivery?.from));
                  setNewTo(toInputDate(order.estimatedDelivery?.to));
                  setReviseOpen(true);
                }}
              >
                Revise delivery date
              </button>
            ) : (
              <div className="tc-revise-form">
                <div className="tc-grid-2">
                  <label>
                    New earliest date
                    <input type="date" value={newFrom} onChange={(e) => setNewFrom(e.target.value)} />
                  </label>
                  <label>
                    New latest date
                    <input type="date" value={newTo} onChange={(e) => setNewTo(e.target.value)} />
                  </label>
                </div>
                <input
                  placeholder="Reason shown to the customer (required)"
                  minLength={5}
                  maxLength={200}
                  value={reviseReason}
                  onChange={(e) => setReviseReason(e.target.value)}
                />
                <div className="tc-actions">
                  <button type="button" className="tc-btn" disabled={busy} onClick={() => void reviseEstimate()}>
                    Save new date
                  </button>
                  <button type="button" className="tc-btn ghost" onClick={() => setReviseOpen(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <input
            placeholder="Message shown to the customer (optional)"
            maxLength={200}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          {next.includes("Shipped") && (
            <>
              <input
                placeholder="Carrier (optional)"
                maxLength={80}
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
              />
              <input
                placeholder="Tracking no. (optional)"
                maxLength={80}
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
              />
            </>
          )}
          <div className="tc-actions">
            {next.map((status) => (
              <button
                key={status}
                type="button"
                disabled={busy}
                className={`tc-btn ${status === "Cancelled" ? "danger" : ""}`}
                onClick={() => void change(status)}
              >
                Mark {status.toLowerCase()}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p className="tc-error" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}

export default function AdminOrders({ token }: { token: string }) {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const query = filter ? `?status=${encodeURIComponent(filter)}` : "";
      const res = await apiRequest<{ orders: AdminOrder[] }>(
        `/admin/orders${query}`,
        { headers: authHeaders(token) }
      );
      setOrders(res.orders);
      setError("");
    } catch (err) {
      setError(errorMessage(err, "Unable to load orders."));
    } finally {
      setLoading(false);
    }
  }, [token, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div className="tc-toolbar">
        <label>
          Status
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All</option>
            {Object.keys(ORDER_TRANSITIONS).map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p className="tc-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p>Loading orders...</p>
      ) : orders.length === 0 ? (
        <p className="tc-muted">No orders match this filter.</p>
      ) : (
        <div className="tc-stack">
          {orders.map((order) => (
            <OrderRow
              key={order._id}
              order={order}
              token={token}
              onUpdated={(updated) =>
                setOrders((prev) =>
                  prev.map((o) => (o._id === updated._id ? updated : o))
                )
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
