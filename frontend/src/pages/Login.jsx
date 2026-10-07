import { useEffect, useState } from "react";
import { ArrowRight, Eye, EyeOff, LayoutDashboard, MessageSquareText, Moon, ShieldCheck, Sun } from "lucide-react";
import { api } from "../api";
import { useAuth, useTheme } from "../lib/session";
import { useT } from "../lib/i18n";
import { ROLES } from "../lib/format";
import { Alert, LanguageToggle, Spinner } from "../components/ui";
import Ribbon from "../components/Ribbon";

const CHIP_LABEL = { admin: "Admin" };
const ROLE_ICON = { client: MessageSquareText, employee: LayoutDashboard, admin: ShieldCheck };

function Logo({ size }) {
  return (
    <img
      src="/eccbc-logo.png"
      alt="ECCBC"
      width={size}
      height={size}
      className="rounded-full bg-white object-contain shrink-0 shadow-[0_6px_24px_rgb(0_0_0/0.14)]"
      style={{ width: size, height: size, padding: Math.round(size * 0.05) }}
    />
  );
}

export default function Login() {
  const t = useT();
  const { login, notice } = useAuth();
  const { theme, toggle } = useTheme();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(null); // null | "form" | demo username
  const [error, setError] = useState(null);
  const [demo, setDemo] = useState([]);

  useEffect(() => {
    api.demoAccounts().then(setDemo, () => setDemo([]));
  }, []);

  async function signIn(name, pass, source) {
    setBusy(source);
    setError(null);
    try {
      await login(name, pass);
    } catch (err) {
      setError(err.message);
      setBusy(null);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    signIn(username.trim(), password, "form");
  }

  return (
    <div className="login-scene relative min-h-dvh overflow-hidden flex flex-col">
      {/* Stage: brand light and the flowing ribbon */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
        <div
          className="absolute -top-[30vmax] -left-[20vmax] w-[70vmax] h-[70vmax] rounded-full"
          style={{ background: "radial-gradient(closest-side, var(--scene-glow), transparent)" }}
        />
        <div
          className="absolute -bottom-[35vmax] -right-[25vmax] w-[80vmax] h-[80vmax] rounded-full"
          style={{ background: "radial-gradient(closest-side, var(--scene-glow), transparent)" }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(var(--scene-grain) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
            maskImage: "linear-gradient(to bottom, black, transparent 70%)",
            WebkitMaskImage: "linear-gradient(to bottom, black, transparent 70%)",
          }}
        />
      </div>
      <Ribbon
        className="absolute -inset-x-[8%] bottom-[-7vh] h-[34vh] min-h-[200px] sm:h-[40vh] -rotate-[5deg] lg:-rotate-[7deg]"
      />

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-5 sm:px-8 lg:px-12 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-3">
          <Logo size={42} />
          <div className="leading-tight">
            <p className="text-[15px] font-semibold text-ink">ECCBC</p>
            <p className="text-xs text-muted">Fruital Rouiba</p>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-full login-card px-1 py-1">
          <LanguageToggle className="btn btn-ghost btn-icon rounded-full" />
          <button
            type="button"
            onClick={toggle}
            className="btn btn-ghost btn-icon rounded-full"
            aria-label={theme === "dark" ? t("Passer au thème clair") : t("Passer au thème sombre")}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="relative z-10 flex-1 flex items-center px-5 sm:px-8 lg:px-12 py-6 sm:py-8 lg:py-10">
        <div className="mx-auto w-full max-w-[1180px] grid lg:grid-cols-[minmax(0,1fr)_420px] gap-8 lg:gap-16 items-center">
          <section className="anim-rise max-w-xl">
            <p className="inline-flex items-center gap-2 text-xs font-semibold tracking-wide uppercase text-brand-ink">
              <span className="w-6 h-px bg-brand" />
              {t("Service client")}
            </p>
            <h1 className="mt-4 text-[34px] leading-[1.04] sm:text-[52px] lg:text-[64px] font-semibold tracking-[-0.03em] text-ink">
              {t("Chaque demande,")}
              <br />
              {t("comprise, routée")}
              <br />
              <span className="text-brand-ink">{t("et suivie.")}</span>
            </h1>
            <p className="hidden sm:block mt-5 text-base text-ink-2 max-w-md">
              {t("Questions, commandes et réclamations, en français, en anglais ou en darija : un seul point d'entrée pour les clients et les équipes.")}
            </p>
          </section>

          <section className="login-card rounded-3xl p-6 sm:p-8 anim-rise" style={{ animationDelay: "90ms" }}>
            <h2 className="text-xl font-semibold text-ink">{t("Connexion")}</h2>
            <p className="text-[13px] text-muted mt-1">{t("Accédez à votre espace avec vos identifiants.")}</p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
              {notice && !error && <Alert tone="warn">{notice}</Alert>}
              {error && <Alert tone="crit">{error}</Alert>}

              <div>
                <label htmlFor="login-username" className="block text-xs font-medium text-ink-2 mb-1.5">
                  {t("Identifiant")}
                </label>
                <input
                  id="login-username"
                  className="input input-lg rounded-xl"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={busy !== null}
                />
              </div>

              <div>
                <label htmlFor="login-password" className="block text-xs font-medium text-ink-2 mb-1.5">
                  {t("Mot de passe")}
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    className="input input-lg rounded-xl pr-11"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={busy !== null}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 btn btn-ghost btn-icon btn-sm"
                    aria-label={showPassword ? t("Masquer le mot de passe") : t("Afficher le mot de passe")}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="group btn btn-primary btn-lg w-full rounded-xl"
                disabled={busy !== null || !username.trim() || !password}
              >
                {busy === "form" ? (
                  <Spinner />
                ) : (
                  <>
                    {t("Se connecter")}
                    <ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </form>

            {demo.length > 0 && (
              <div className="mt-7">
                <div className="flex items-center gap-3">
                  <span className="flex-1 h-px bg-line" />
                  <span className="eyebrow">{t("Accès démo")}</span>
                  <span className="flex-1 h-px bg-line" />
                </div>
                <div
                  className="mt-3 grid gap-2"
                  style={{ gridTemplateColumns: `repeat(${demo.length}, minmax(0, 1fr))` }}
                >
                  {demo.map((account) => {
                    const Icon = ROLE_ICON[account.role] || ShieldCheck;
                    return (
                      <button
                        key={account.username}
                        type="button"
                        disabled={busy !== null}
                        onClick={() => signIn(account.username, account.password, account.username)}
                        title={t(ROLES[account.role]?.description)}
                        className="flex flex-col items-center gap-1.5 rounded-xl border border-line bg-surface/60 hover:bg-surface hover:border-brand/50 px-2 py-3 text-xs font-medium text-ink-2 hover:text-ink transition-colors disabled:opacity-60"
                      >
                        {busy === account.username ? <Spinner size={17} /> : <Icon size={17} />}
                        <span className="truncate max-w-full">{t(CHIP_LABEL[account.role] || ROLES[account.role]?.label)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      <footer className="relative z-10 px-5 sm:px-8 lg:px-12 pb-[max(1rem,env(safe-area-inset-bottom))] text-[11px] text-white/85 hidden sm:block">
        Equatorial Coca-Cola Bottling Company
      </footer>
    </div>
  );
}
