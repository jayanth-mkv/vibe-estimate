"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCheck, MessageCircle } from "lucide-react";
import { ensureSessionReady, startSession, usesAnonymousAuth } from "@/lib/firebase";
import { makeRoomApi } from "@/lib/room-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import styles from "./room.module.css";

const clientRooms = makeRoomApi("client");

export function JoinRoom() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const joining = useRef(false);

  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (joining.current) return;
    const normalized = code.toUpperCase().replace(/[\s-]/g, "");
    if (!/^[0-9A-HJKMNP-TV-Z]{12}$/.test(normalized)) {
      setError("Enter the 12-character room code from your designer. Spaces and hyphens are optional.");
      setFieldError(true);
      input.current?.focus();
      return;
    }
    joining.current = true;
    setBusy(true);
    setError("");
    setFieldError(false);
    try {
      const auth = await ensureSessionReady("client");
      if (!auth.currentUser) await startSession("client");
      const result = await clientRooms.joinCode(normalized);
      setCode("");
      router.replace(`/client/rooms/${encodeURIComponent(result.room.id)}`);
    } catch (cause) {
      const authFailure = cause && typeof cause === "object" && "code" in cause && String(cause.code).startsWith("auth/");
      setError(authFailure ? "We couldn’t connect your guest workspace. Your room code is still here; try again." : cause instanceof Error ? cause.message : "The room could not be opened. Check the code with your designer and try again.");
    } finally { joining.current = false; setBusy(false); }
  }

  return <div className={styles.page}>
    <a className="skip-link" href="#join-main">Skip to join a room</a>
    <header className={styles.header}><Link className="brand" href="/"><span className="brand-mark"><CheckCheck size={19} aria-hidden="true" /></span>VibeEstimate</Link><span className={styles.viewBadge}>Client view</span></header>
    <main id="join-main" className={styles.joinPage}>
      <Link className={styles.backLink} href="/"><ArrowLeft size={14} aria-hidden="true" />Back to home</Link>
      <div className={styles.joinHeading}><span className={styles.largeRoomMark}><MessageCircle size={27} aria-hidden="true" /></span><h1>Join your project room.</h1><p>Your designer, shared conversation, and project documents — together in one place.</p></div>
      <form className={styles.joinForm} onSubmit={(event) => void join(event)} noValidate>
        <label htmlFor="join-code">Room code</label><p id="join-help" className={styles.joinHelp}>Enter the code your designer shared with you.</p>
        <Input id="join-code" name="room-code" ref={input} value={code} onChange={(event) => { setCode(event.target.value.toUpperCase()); setError(""); setFieldError(false); }} placeholder="ABCD-EFGH-JKMP" maxLength={32} autoCapitalize="characters" autoCorrect="off" autoComplete="off" spellCheck={false} aria-describedby={`join-help${error ? " join-error" : ""}`} aria-invalid={fieldError} disabled={busy} className={styles.joinCodeInput} />
        {error && <p id="join-error" className={styles.joinError} role="alert">{error}</p>}
        <Button type="submit" className="button primary" disabled={busy}>{busy ? "Joining room…" : usesAnonymousAuth ? "Join room" : "Sign in and join"}<ArrowRight size={17} aria-hidden="true" /></Button>
        <p className={styles.joinPrivacy}>{usesAnonymousAuth ? "No account setup needed. This browser keeps your access to the room." : "Sign in to connect with your designer securely."}</p>
      </form>
      <div className={styles.joinExplanation}><h2>A clear conversation from here.</h2><p>Your designer and the room’s assistant can read messages you send. Discuss open questions, explore any shared home, and review project documents together.</p><span>Rooms with a shared home record decisions on saved designs. Proposal drafts remain for review. No legal signature is collected.</span></div>
    </main>
  </div>;
}
