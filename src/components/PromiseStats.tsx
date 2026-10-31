import { useEffect, useState } from "react";
import { Info, ShieldCheck } from "lucide-react";
import { apiRequest } from "../lib/api";
import type { DeliveryPromiseResponse } from "../lib/types";

/**
 * Shows how well the store keeps its delivery promises, measured against the
 * ORIGINAL promised date (not the latest revised one).
 */
export default function PromiseStats({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<DeliveryPromiseResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    apiRequest<DeliveryPromiseResponse>("/stats/delivery-promise")
      .then((response) => {
        if (!cancelled) setData(response);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (failed || !data) return null;

  const { stats, enoughData, minSample, currentWindow } = data;

  return (
    <aside className={`tc-promise ${compact ? "compact" : ""}`} aria-label="Delivery promise record">
      <div className="tc-promise-icon">
        <ShieldCheck size={compact ? 18 : 22} />
      </div>

      <div className="tc-promise-body">
        <strong>
          {enoughData && stats.keptOriginalPct !== null
            ? `${stats.keptOriginalPct}% of recent orders arrived by the date originally promised`
            : "Delivery promise record"}
        </strong>

        {enoughData ? (
          <p>
            Based on the last {stats.sample} delivered orders.{" "}
            {stats.revisedPct !== null && `${stats.revisedPct}% had their date revised. `}
            {stats.avgDaysLateWhenLate !== null &&
              stats.avgDaysLateWhenLate > 0 &&
              `When late, orders were ${stats.avgDaysLateWhenLate} days late on average.`}
          </p>
        ) : (
          <p>
            Not enough delivered orders yet ({stats.sample} of {minSample}) to show a
            reliable rate.
          </p>
        )}

        <p className="tc-promise-window">
          New orders: estimated {currentWindow.fromDays}–{currentWindow.toDays} days.{" "}
          {currentWindow.source === "history"
            ? `Based on the last ${currentWindow.basis} deliveries.`
            : "Default estimate: not enough delivery history yet."}
        </p>

        {stats.simulatedPct !== null && stats.simulatedPct > 0 && (
          <p className="tc-promise-note">
            <Info size={13} /> {stats.simulatedPct}% of these orders are simulated demo data.
          </p>
        )}
      </div>
    </aside>
  );
}
