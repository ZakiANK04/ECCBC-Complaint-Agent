import { useEffect } from "react";
import { AuthProvider, useAuth, useHashRoute } from "./lib/session";
import { LanguageProvider } from "./lib/i18n";
import { HOME, navFor } from "./lib/format";
import { BrandMark, Spinner, ToastProvider } from "./components/ui";
import AppShell from "./components/AppShell";
import EntryTransition from "./components/EntryTransition";
import Login from "./pages/Login";
import Assistant from "./pages/Assistant";
import Dashboard from "./pages/Dashboard";
import RootCause from "./pages/RootCause";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <ToastProvider>
          <Root />
        </ToastProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}

function Root() {
  const { user, status, entering } = useAuth();

  if (status === "loading") {
    return (
      <div className="h-dvh flex flex-col items-center justify-center gap-4 bg-canvas text-muted">
        <BrandMark size={44} />
        <Spinner size={18} />
      </div>
    );
  }
  return (
    <>
      {user ? <Workspace user={user} /> : <Login />}
      {entering && <EntryTransition phase={entering} />}
    </>
  );
}

function Workspace({ user }) {
  const [[page, section], navigate] = useHashRoute();
  const allowed = navFor(user.role).map((n) => n.id);
  const current = allowed.includes(page) ? page : HOME[user.role];

  // Unknown or forbidden routes fall back to the role's home screen.
  useEffect(() => {
    if (page !== current) navigate(current, { replace: true });
  }, [page, current, navigate]);

  // Clients only ever get the assistant, full screen, without the staff shell.
  if (user.role === "client") return <Assistant />;

  return (
    <AppShell active={current} onNavigate={navigate} fill={current === "assistant"}>
      {current === "assistant" && <Assistant embedded />}
      {current === "dashboard" && <Dashboard />}
      {current === "root-cause" && <RootCause />}
      {current === "settings" && <Settings section={section} onSection={(s) => navigate(`settings/${s}`)} />}
    </AppShell>
  );
}
