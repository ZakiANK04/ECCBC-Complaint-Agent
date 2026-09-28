import { MessageSquare, LayoutDashboard, Search, Sliders } from "lucide-react";

const TABS = [
  { id: "client", label: "Client Portal", icon: MessageSquare },
  { id: "employee", label: "Employee Dashboard", icon: LayoutDashboard },
  { id: "root-cause", label: "Root Cause Analysis", icon: Search },
  { id: "settings", label: "Paramètres Agent", icon: Sliders },
];

export default function Header({ active, onChange }) {
  return (
    <header className="bg-brand-red text-white shadow-lg">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-5 pb-3 flex items-center gap-3 sm:gap-4">
        <img
          src="/eccbc-logo.png"
          alt="ECCBC logo"
          className="w-12 h-12 sm:w-16 sm:h-16 object-contain rounded-full bg-white p-1 shadow-md border-2 border-white/80 shrink-0"
        />
        <div className="min-w-0">
          <h1 className="text-lg sm:text-2xl font-extrabold tracking-tight truncate">
            ECCBC Complaint Assistant
          </h1>
          <p className="text-white/80 text-xs sm:text-sm truncate">
            Equatorial Coca-Cola Bottling Company — Fruital Rouiba Division
          </p>
        </div>
      </div>

      <nav className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex gap-1 overflow-x-auto scrollbar-none pb-0.5">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = active === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onChange(tab.id)}
                className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-t-xl text-xs sm:text-sm font-semibold transition-colors shrink-0
                  ${isActive
                    ? "bg-brand-cream text-brand-red shadow-xs"
                    : "bg-brand-red-dark/40 text-white/90 hover:bg-brand-red-dark/70"}`}
              >
                <Icon size={15} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
