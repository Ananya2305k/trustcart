import { useState } from "react";
import AdminDashboard from "./admin/AdminDashboard";
import AdminOrders from "./admin/AdminOrders";
import AdminRefunds from "./admin/AdminRefunds";
import AdminTickets from "./admin/AdminTickets";
import AdminProducts from "./admin/AdminProducts";

const TABS = ["Dashboard", "Orders", "Refunds", "Tickets", "Products"] as const;
type AdminTab = (typeof TABS)[number];

export default function Admin({ token }: { token: string }) {
  const [tab, setTab] = useState<AdminTab>("Dashboard");

  return (
    <section className="tc-page">
      <div className="tc-subtabs" role="tablist" aria-label="Admin sections">
        {TABS.map((name) => (
          <button
            key={name}
            role="tab"
            aria-selected={tab === name}
            type="button"
            className={tab === name ? "active" : ""}
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </div>

      {tab === "Dashboard" && <AdminDashboard token={token} />}
      {tab === "Orders" && <AdminOrders token={token} />}
      {tab === "Refunds" && <AdminRefunds token={token} />}
      {tab === "Tickets" && <AdminTickets token={token} />}
      {tab === "Products" && <AdminProducts token={token} />}
    </section>
  );
}
