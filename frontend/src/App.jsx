import { useState } from "react";
import Header from "./components/Header";
import ClientPortal from "./components/ClientPortal";
import EmployeeDashboard from "./components/EmployeeDashboard";
import RootCauseAnalysis from "./components/RootCauseAnalysis";
import AdminSettings from "./components/AdminSettings";

export default function App() {
  const [tab, setTab] = useState("client");

  return (
    <div className="min-h-screen brand-wave-bg">
      <Header active={tab} onChange={setTab} />
      <main>
        {tab === "client" && <ClientPortal />}
        {tab === "employee" && <EmployeeDashboard />}
        {tab === "root-cause" && <RootCauseAnalysis />}
        {tab === "settings" && <AdminSettings />}
      </main>
    </div>
  );
}
