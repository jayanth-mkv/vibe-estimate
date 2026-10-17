"use client";
import dynamic from "next/dynamic";

/** The trial reads its draft from this browser, so it renders only on the client. */
export const TryEntry = dynamic(() => import("./try-studio").then(module => module.TryStudio), { ssr: false, loading: () => <p role="status" style={{ padding: 24 }}>Opening a furnished home…</p> });
