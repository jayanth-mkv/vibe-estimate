"use client";
import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { clientAuth, startSession, usesAnonymousAuth, type SessionIdentity } from "@/lib/firebase";
export function useHomeSession(identity: SessionIdentity = "designer") {
  const [user, setUser] = useState<User | null>(null), [ready, setReady] = useState(false), [error, setError] = useState(""), [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true; let off = () => {};
    void (async () => { try {
      const auth = clientAuth(identity); await auth.authStateReady(); if (!alive) return;
      if (!auth.currentUser && usesAnonymousAuth && (identity === "designer" || identity === "client")) await startSession(identity);
      if (!alive) return;
      off = onAuthStateChanged(auth, next => { if (alive) { setUser(next); setReady(true); setError(next ? "" : "Reconnect to open your private saved work."); } });
    } catch (cause) { if (alive) { setError(cause instanceof Error ? cause.message : "Your workspace could not connect."); setReady(true); } } })();
    return () => { alive = false; off(); };
  }, [identity, retry]);
  return { user, ready, error, reconnect: async () => { try { await startSession(identity); setRetry(value => value + 1); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not reconnect."); } } };
}
