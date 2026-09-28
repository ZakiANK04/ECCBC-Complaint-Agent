import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Loader2, Inbox } from "lucide-react";
import { api } from "../api";
import TicketCard from "./TicketCard";

export default function EmployeeDashboard() {
  const [tickets, setTickets] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.listTickets().then(setTickets).catch((e) => setError(e.message));
  }, []);

  const chartData = useMemo(() => {
    if (!tickets) return [];
    const counts = {};
    for (const t of tickets) {
      counts[t.department_label] = (counts[t.department_label] || 0) + 1;
    }
    return Object.entries(counts).map(([name, count]) => ({ name, count }));
  }, [tickets]);

  function handleStatusChange(ticketId, newStatus) {
    setTickets((prev) => prev.map((t) => (t.ticket_id === ticketId ? { ...t, status: newStatus } : t)));
  }

  if (error) return <p className="max-w-6xl mx-auto px-6 py-10 text-red-600">{error}</p>;
  if (!tickets) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400 gap-2">
        <Loader2 className="animate-spin" /> Loading tickets...
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Total tickets" value={tickets.length} />
        <StatCard label="Open" value={tickets.filter((t) => t.status === "open").length} />
        <StatCard label="High urgency" value={tickets.filter((t) => t.urgency === "high").length} accent />
      </div>

      {tickets.length > 0 && (
        <div className="bg-white rounded-2xl card-shadow p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Tickets by department</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#F40009" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {tickets.length === 0 ? (
        <div className="flex flex-col items-center gap-2 text-slate-400 py-16">
          <Inbox size={32} />
          <p>No tickets yet — submit one from the Client Portal tab.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => (
            <TicketCard key={t.ticket_id} ticket={t} onStatusChange={handleStatusChange} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div className="bg-white rounded-2xl card-shadow p-5">
      <p className="text-xs font-semibold text-slate-400 uppercase">{label}</p>
      <p className={`text-3xl font-extrabold mt-1 ${accent ? "text-brand-red" : "text-slate-800"}`}>{value}</p>
    </div>
  );
}
