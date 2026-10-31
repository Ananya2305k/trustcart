import { useEffect, useState } from "react";
import { apiRequest, authHeaders, errorMessage } from "../../lib/api";
import { inr } from "../../lib/format";
import type { AdminStats } from "../../lib/types";

export default function AdminDashboard({ token }: { token: string }) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiRequest<{ stats: AdminStats }>("/admin/stats", {
      headers: authHeaders(token),
    })
      .then((res) => setStats(res.stats))
      .catch((err) => setError(errorMessage(err, "Unable to load stats.")));
  }, [token]);

  if (error)
    return (
      <p className="tc-error" role="alert">
        {error}
      </p>
    );
  if (!stats) return <p>Loading dashboard...</p>;

  const cards: { label: string; value: string | number; hint?: string }[] = [
    { label: "Placed (awaiting confirmation)", value: stats.orders.Placed ?? 0 },
    { label: "Confirmed", value: stats.orders.Confirmed ?? 0 },
    { label: "Shipped", value: stats.orders.Shipped ?? 0 },
    { label: "Delivered", value: stats.orders.Delivered ?? 0 },
    { label: "Cancelled", value: stats.orders.Cancelled ?? 0 },
    {
      label: "Delivered revenue",
      value: inr(stats.deliveredRevenue),
      hint: "Simulated payments",
    },
    { label: "Open tickets", value: stats.openTickets },
    {
      label: "High-urgency tickets",
      value: stats.urgentTickets,
      hint: "Per AI analysis",
    },
    { label: "Refunds to review", value: stats.pendingRefunds },
    {
      label: "Low-stock products",
      value: stats.lowStockProducts,
      hint: `${stats.lowStockThreshold} or fewer`,
    },
  ];

  return (
    <div className="tc-grid">
      {cards.map((card) => (
        <div className="tc-stat" key={card.label}>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
          {card.hint && <small>{card.hint}</small>}
        </div>
      ))}
    </div>
  );
}
