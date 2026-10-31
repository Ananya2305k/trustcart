import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Headphones, Send } from "lucide-react";
import { apiRequest, authHeaders, errorMessage } from "../lib/api";
import { fmtDateTime, inr, shortId, statusTone } from "../lib/format";
import type { Order, Ticket } from "../lib/types";

interface SupportProps {
  token: string;
  initialOrderId?: string;
}

export default function Support({ token, initialOrderId }: SupportProps) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [creating, setCreating] = useState(Boolean(initialOrderId));
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [orderId, setOrderId] = useState(initialOrderId ?? "");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ticketRes, orderRes] = await Promise.all([
        apiRequest<{ tickets: Ticket[] }>("/tickets", {
          headers: authHeaders(token),
        }),
        apiRequest<{ orders: Order[] }>("/orders", {
          headers: authHeaders(token),
        }),
      ]);
      setTickets(ticketRes.tickets);
      setOrders(orderRes.orders);
    } catch (err) {
      setError(errorMessage(err, "Unable to load support tickets."));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = tickets.find((t) => t._id === selectedId) ?? null;

  function replaceTicket(updated: Ticket) {
    setTickets((previous) => {
      const exists = previous.some((t) => t._id === updated._id);
      return exists
        ? previous.map((t) => (t._id === updated._id ? updated : t))
        : [updated, ...previous];
    });
  }

  async function createTicket(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await apiRequest<{ ticket: Ticket }>("/tickets", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ subject, message, orderId: orderId || undefined }),
      });
      replaceTicket(response.ticket);
      setSelectedId(response.ticket._id);
      setCreating(false);
      setSubject("");
      setMessage("");
      setOrderId("");
    } catch (err) {
      setError(errorMessage(err, "Could not create the ticket."));
    } finally {
      setBusy(false);
    }
  }

  async function sendReply(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setError("");
    setBusy(true);
    try {
      const response = await apiRequest<{ ticket: Ticket }>(
        `/tickets/${selected._id}/messages`,
        {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ text: reply }),
        }
      );
      replaceTicket(response.ticket);
      setReply("");
    } catch (err) {
      setError(errorMessage(err, "Could not send your message."));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <section className="tc-page">
        <p>Loading support...</p>
      </section>
    );
  }

  return (
    <section className="tc-page">
      <div className="tc-page-head end">
        <button
          type="button"
          className="tc-btn"
          onClick={() => {
            setCreating(true);
            setSelectedId(null);
          }}
        >
          <Headphones size={15} /> New ticket
        </button>
      </div>

      {error && (
        <p className="tc-error" role="alert">
          {error}
        </p>
      )}

      <div className={`tc-split ${tickets.length === 0 ? "single" : ""}`}>
        {(tickets.length > 0 || !creating) && (
        <div className="tc-stack">
          {tickets.length === 0 && !creating ? (
            <div className="tc-empty">
              <Headphones size={36} />
              <h3>No tickets yet</h3>
              <p>Open a ticket and we will reply here.</p>
            </div>
          ) : (
            tickets.map((ticket) => (
              <button
                type="button"
                key={ticket._id}
                className={`tc-list-item ${ticket._id === selectedId ? "active" : ""}`}
                onClick={() => {
                  setSelectedId(ticket._id);
                  setCreating(false);
                }}
              >
                <span>
                  <strong>{ticket.subject}</strong>
                  <small>Updated {fmtDateTime(ticket.updatedAt)}</small>
                </span>
                <span className={`tc-pill ${statusTone(ticket.status)}`}>
                  {ticket.status}
                </span>
              </button>
            ))
          )}
        </div>
        )}

        <div>
          {creating && (
            <form className="tc-card tc-form" onSubmit={createTicket}>
              <h3>New ticket</h3>
              <label>
                Subject
                <input
                  required
                  minLength={3}
                  maxLength={120}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </label>
              <label>
                Related order (optional)
                <select
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                >
                  <option value="">Not about a specific order</option>
                  {orders.map((order) => (
                    <option key={order._id} value={order._id}>
                      #{shortId(order._id)} · {order.orderStatus} ·{" "}
                      {inr(order.total)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                How can we help?
                <textarea
                  required
                  minLength={10}
                  maxLength={2000}
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </label>
              <div className="tc-actions">
                <button className="tc-btn" type="submit" disabled={busy}>
                  {busy ? "Sending..." : "Submit ticket"}
                </button>
                <button
                  type="button"
                  className="tc-btn ghost"
                  onClick={() => setCreating(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {!creating && selected && (
            <article className="tc-card">
              <header className="tc-card-head">
                <div>
                  <h3>{selected.subject}</h3>
                  <small>Opened {fmtDateTime(selected.createdAt)}</small>
                </div>
                <span className={`tc-pill ${statusTone(selected.status)}`}>
                  {selected.status}
                </span>
              </header>

              <div className="tc-thread">
                {selected.messages.map((m, index) => (
                  <div key={index} className={`tc-bubble ${m.author}`}>
                    <small>
                      {m.author === "customer" ? "You" : "TrustCart support"} ·{" "}
                      {fmtDateTime(m.timestamp)}
                    </small>
                    <p>{m.text}</p>
                  </div>
                ))}
              </div>

              <details className="tc-details">
                <summary>Status history</summary>
                <ol className="tc-timeline">
                  {selected.statusHistory.map((entry, index) => (
                    <li key={index}>
                      <div className="tc-timeline-head">
                        <strong>{entry.status}</strong>
                        <small>{fmtDateTime(entry.timestamp)}</small>
                      </div>
                    </li>
                  ))}
                </ol>
              </details>

              {selected.status === "Closed" ? (
                <p className="tc-muted">
                  This ticket is closed. Open a new ticket if you need more help.
                </p>
              ) : (
                <form className="tc-reply" onSubmit={sendReply}>
                  <textarea
                    required
                    rows={3}
                    maxLength={2000}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder={
                      selected.status === "Resolved"
                        ? "Replying will re-open this ticket"
                        : "Write a message"
                    }
                  />
                  <button className="tc-btn" type="submit" disabled={busy}>
                    <Send size={15} /> Send
                  </button>
                </form>
              )}
            </article>
          )}

          {!creating && !selected && tickets.length > 0 && (
            <p className="tc-muted">Select a ticket to see the conversation.</p>
          )}
        </div>
      </div>
    </section>
  );
}
