import { useCallback, useEffect, useState } from "react";
import { apiRequest, authHeaders, errorMessage } from "../../lib/api";
import { fmtDateTime, inr, shortId, statusTone } from "../../lib/format";
import type { Refund, RefundStatus } from "../../lib/types";

const NEXT: Record<RefundStatus, RefundStatus[]> = {
  Requested: ["Under review", "Rejected"],
  "Under review": ["Approved", "Rejected"],
  Approved: ["Refunded"],
  Rejected: [],
  Refunded: [],
};

function RefundRow({
  refund,
  token,
  onUpdated,
}: {
  refund: Refund;
  token: string;
  onUpdated: (refund: Refund) => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function change(status: RefundStatus) {
    if (status === "Rejected" && !note.trim()) {
      setError("Write a reason for the customer before rejecting.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await apiRequest<{ refund: Refund }>(
        `/refunds/${refund._id}/status`,
        {
          method: "PATCH",
          headers: authHeaders(token),
          body: JSON.stringify({ status, note: note || undefined }),
        }
      );
      // Keep the populated customer/order, which the PATCH response omits.
      onUpdated({ ...refund, ...res.refund, user: refund.user, order: refund.order });
      setNote("");
    } catch (err) {
      setError(errorMessage(err, "Could not update the refund."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="tc-card">
      <header className="tc-card-head">
        <div>
          <h3>
            {inr(refund.amount)} · Order #{refund.order ? shortId(refund.order._id) : "—"}
          </h3>
          <small>
            {refund.user?.name ?? "Unknown"} ({refund.user?.email ?? "—"}) ·{" "}
            {fmtDateTime(refund.createdAt)}
          </small>
        </div>
        <span className={`tc-pill ${statusTone(refund.status)}`}>{refund.status}</span>
      </header>

      <p>
        <strong>{refund.reason}</strong>
        {refund.details ? `: ${refund.details}` : ""}
      </p>

      {NEXT[refund.status].length > 0 && (
        <div className="tc-admin-actions">
          <input
            placeholder="Note shown to the customer (required to reject)"
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="tc-actions">
            {NEXT[refund.status].map((status) => (
              <button
                key={status}
                type="button"
                disabled={busy}
                className={`tc-btn ${status === "Rejected" ? "danger" : ""}`}
                onClick={() => void change(status)}
              >
                {status === "Refunded" ? "Issue refund" : `Mark ${status.toLowerCase()}`}
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

export default function AdminRefunds({ token }: { token: string }) {
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await apiRequest<{ refunds: Refund[] }>("/refunds/admin/all", {
        headers: authHeaders(token),
      });
      setRefunds(res.refunds);
    } catch (err) {
      setError(errorMessage(err, "Unable to load refunds."));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <p>Loading refunds...</p>;

  return (
    <div className="tc-stack">
      {error && (
        <p className="tc-error" role="alert">
          {error}
        </p>
      )}
      {refunds.length === 0 && <p className="tc-muted">No refund requests.</p>}
      {refunds.map((refund) => (
        <RefundRow
          key={refund._id}
          refund={refund}
          token={token}
          onUpdated={(updated) =>
            setRefunds((prev) => prev.map((r) => (r._id === updated._id ? updated : r)))
          }
        />
      ))}
    </div>
  );
}
