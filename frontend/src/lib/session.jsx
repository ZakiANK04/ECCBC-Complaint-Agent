import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, hasToken, setToken, setUnauthorizedHandler } from "../api";
import { translate } from "./i18n";

// ----------------------------------------------------------------- session --
const AuthContext = createContext(null);

// Sign-in transition timeline (ms). The red wave covers the login page, the
// workspace mounts underneath while the logo shows, then the wave lifts.
export const ENTRY = { cover: 620, hold: 900, reveal: 680 };
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // "loading" while an existing token is being verified on startup.
  const [status, setStatus] = useState(hasToken() ? "loading" : "anonymous");
  const [notice, setNotice] = useState(null);
  const [entering, setEntering] = useState(null); // null | "cover" | "reveal"

  const clear = useCallback((message = null) => {
    setToken(null);
    setUser(null);
    setStatus("anonymous");
    setNotice(message);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => clear(translate("Votre session a expiré. Veuillez vous reconnecter.")));
    if (!hasToken()) return;
    api.me().then(
      (u) => {
        setUser(u);
        setStatus("authenticated");
      },
      // 401 is already handled above; anything else (API down) also returns to login.
      () => setStatus((s) => (s === "loading" ? "anonymous" : s))
    );
  }, [clear]);

  const login = useCallback(async (username, password) => {
    const res = await api.login(username, password);
    setToken(res.token);
    const enter = () => {
      setUser(res.user);
      setNotice(null);
      setStatus("authenticated");
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      enter();
      return res.user;
    }
    setEntering("cover");
    await wait(ENTRY.cover);
    enter();
    await wait(ENTRY.hold);
    setEntering("reveal");
    await wait(ENTRY.reveal);
    setEntering(null);
    return res.user;
  }, []);

  const logout = useCallback(() => clear(null), [clear]);

  const value = useMemo(
    () => ({ user, status, notice, entering, login, logout }),
    [user, status, notice, entering, login, logout]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

// ------------------------------------------------------------------- theme --
const THEME_KEY = "eccbc.theme";

export function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || "light");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#0b0b0c" : "#f5f5f3");
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}

// ------------------------------------------------------------ hash routing --
const readHash = () => window.location.hash.replace(/^#\/?/, "");

/** Current route segments from the URL hash, e.g. "#/settings/accounts" → ["settings", "accounts"]. */
export function useHashRoute() {
  const [path, setPath] = useState(readHash);

  useEffect(() => {
    const onChange = () => setPath(readHash());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const navigate = useCallback((to, { replace = false } = {}) => {
    const target = `#/${to}`;
    if (replace) {
      window.history.replaceState(null, "", target);
      setPath(to);
    } else {
      window.location.hash = target;
    }
  }, []);

  return [path.split("/").filter(Boolean), navigate];
}
