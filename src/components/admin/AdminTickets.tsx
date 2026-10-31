import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Bot } from "lucide-react";
import { apiRequest, authHeaders, errorMessage } from "../../lib/api";
import { fmtDateTime, statusTone } from "../../lib/format";
import type { Ticket, TicketStatus } from "../../lib/types";

const STATUSES: TicketStatus[] = ["Open", "In progress", "Resolved", "Closed"];
const URGENCY_TONE = { high: "red", medium: "amber", low: "gray" } as const;

export default function AdminTickets({ token }: { token: string }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [status, setStatus] = useState<TicketStatus | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await apiRequest<{ tickets: Ticket[] }>("/tickets/admin/all", {
        headers: authHeaders(token),
      });
      setTickets(res.tickets);
    } catch (err) {
      setError(errorMessage(err, "Unable to load tickets."));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = tickets.find((t) => t._id === selectedId) ?? null;

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const res = await apiRequest<{ ticket: Ticket }>(
        `/tickets/${selected._id}/reply`,
        {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ text: reply, status: status || undefined }),
        }
      );
      setTickets((prev) =>
        prev.map((t) =>
          t._id === selected._id
            ? { ...t, ...res.ticket, user: t.user, order: t.order }
            : t
        )
      );
      setReply("");
      setStatus("");
    } catch (err) {
      setError(errorMessage(err, "Could not send the reply."));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p>Loading tickets...</p>;

  return (
    <div>
      {error && (
        <p className="tc-error" role="alert">
          {error}
        </p>
      )}
      <div className="tc-split">
        <div className="tc-stack">
          {tickets.length === 0 && <p className="tc-muted">No tickets.</p>}
          {tickets.map((ticket) => (
            <button
              type="button"
              key={ticket._id}
              className={`tc-list-item ${ticket._id === selectedId ? "active" : ""}`}
              onClick={() => setSelectedId(ticket._id)}
            >
              <span>
                <strong>{ticket.subject}</strong>
                <small>
                  {ticket.user?.name ?? "Unknown"} · {ticket.category}
                </small>
              </span>
              <span className="tc-col">
                <span className={`tc-pill ${statusTone(ticket.status)}`}>
                  {ticket.status}
                </span>
                {ticket.ai && (
                  <span className={`tc-pill ${URGENCY_TONE[ticket.ai.urgency]}`}>
                    {ticket.ai.urgency} urgency
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>

        <div>
          {!selected ? (
            <p className="tc-muted">Select a ticket.</p>
          ) : (
            <article className="tc-card">
              <header className="tc-card-head">
                <div>
                  <h3>{selected.subject}</h3>
                  <small>
                    {selected.user?.name} ({selected.user?.email}) ·{" "}
                    {fmtDateTime(selected.createdAt)}
                  </small>
                </div>
                <span className={`tc-pill ${statusTone(selected.status)}`}>
                  {selected.status}
                </span>
              </header>

              {selected.ai ? (
                <div className="tc-ai">
                  <h4>
                    <Bot size={15} /> AI analysis
                    <small> (assistive only, model {selected.ai.modelVersion})</small>
                  </h4>
                  <p>
                    Category: <strong>{selected.ai.category}</strong> (
                    {Math.round(selected.ai.categoryConfidence * 100)}% confidence) ·
                    Sentiment: <strong>{selected.ai.sentiment}</strong> · Urgency:{" "}
                    <strong>{selected.ai.urgency}</strong>
                  </p>
                  {selected.ai.urgencySignals.length > 0 && (
                    <p className="tc-muted">
                      Signals: {selected.ai.urgencySignals.join(", ")}
                    </p>
                  )}
                  <p className="tc-muted">
                    Suggested reply ({selected.ai.replySource}):
                  </p>
                  <blockquote>{selected.ai.suggestedReply}</blockquote>
                  <button
                    type="button"
                    className="tc-btn ghost"
                    onClick={() => setReply(selected.ai?.suggestedReply ?? "")}
                  >
                    Use as draft
                  </button>
                </div>
              ) : (
                <p className="tc-muted">
                  No AI analysis for this ticket (service not configured or was
                  unavailable when it was created).
                </p>
              )}

              <div className="tc-thread">
                {selected.messages.map((m, index) => (
                  <div key={index} className={`tc-bubble ${m.author}`}>
                    <small>
                      {m.author === "customer" ? "Customer" : "Support"} ·{" "}
                      {fmtDateTime(m.timestamp)}
                    </small>
                    <p>{m.text}</p>
                  </div>
                ))}
              </div>

              <form className="tc-reply" onSubmit={send}>
                <textarea
                  required
                  rows={4}
                  maxLength={2000}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Write a reply. Review any AI draft before sending."
                />
                <div className="tc-actions">
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as TicketStatus | "")}
                    aria-label="Set status with this reply"
                  >
                    <option value="">Keep / auto status</option>
                    {STATUSES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  <button className="tc-btn" type="submit" disabled={busy}>
                    Send reply
                  </button>
                </div>
              </form>
            </article>
          )}
        </div>
      </div>
    </div>
  );
}
