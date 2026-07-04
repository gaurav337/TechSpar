import { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem("token")));
  // The user has not yet configured his or her LLM/Embedding → Enter the first ascent guide. by /api/The configured settings determine.
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  function login(tokenStr, userData) {
    localStorage.setItem("token", tokenStr);
    localStorage.setItem("user", JSON.stringify(userData));
    setLoading(true);  // re-validate + load provider status before routing
    setToken(tokenStr);
    setUser(userData);
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
    setNeedsOnboarding(false);
  }

  useEffect(() => {
    if (!token) return;  // logout already cleared user/state; nothing to load
    let cancelled = false;
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch("/api/profile", { headers }),
      fetch("/api/settings", { headers }),
    ])
      .then(async ([profileRes, settingsRes]) => {
        if (cancelled) return;
        if (!profileRes.ok) {
          logout();
          return;
        }
        const stored = localStorage.getItem("user");
        if (stored) setUser(JSON.parse(stored));
        if (settingsRes.ok) {
          const data = await settingsRes.json();
          const c = data.configured || {};
          setNeedsOnboarding(!(c.llm && c.embedding));
        }
      })
      .catch(() => {
        if (!cancelled) logout();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, loading, needsOnboarding, setNeedsOnboarding, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
