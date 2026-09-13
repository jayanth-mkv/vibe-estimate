"use client";
import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { allowsAnonymousSessions, canUseSession, ensureSessionReady, openGoogleClientRoom, requiresGoogleAccount, sessionAccessMessage, startSession, type SessionIdentity } from "@/lib/firebase";
export function useHomeSession(identity: SessionIdentity = "designer") {
  const [user, setUser] = useState<User | null>(null), [ready, setReady] = useState(false), [error, setError] = useState(""), [retry, setRetry] = useState(0), [connecting, setConnecting] = useState(false), [accessMessage, setAccessMessage] = useState("");
  useEffect(() => {
    let alive = true; let off = () => {};
    void (async () => { try {
      const auth = await ensureSessionReady(identity); if (!alive) return;
      if (!auth.currentUser && allowsAnonymousSessions() && (identity === "designer" || identity === "client")) await startSession(identity);
      if (!alive) return;
      off = onAuthStateChanged(auth, next => { if (alive) { setUser(canUseSession(next) ? next : null); setReady(true); setError(""); setAccessMessage(canUseSession(next) ? "" : sessionAccessMessage(next)); } });
    } catch (cause) { if (alive) { setError(cause instanceof Error ? cause.message : "Your workspace could not connect."); setReady(true); } } })();
    return () => { alive = false; off(); };
  }, [identity, retry]);
  return { user, ready, error, accessMessage, connecting, actionLabel: ready && requiresGoogleAccount() ? "Continue with Google" : "Reconnect", reconnect: async () => { if (connecting) return; setConnecting(true); try { if (identity !== "designer" && identity !== "client") await openGoogleClientRoom(identity); else await startSession(identity); setRetry(value => value + 1); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not reconnect."); } finally { setConnecting(false); } } };
}
