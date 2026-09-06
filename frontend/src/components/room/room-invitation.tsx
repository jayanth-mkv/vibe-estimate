"use client";

import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { CheckCheck, Copy, ExternalLink, Link2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import styles from "./room.module.css";

interface Props {
  roomId: string;
  clientJoined: boolean;
  open: boolean;
  inviteHref: string;
  joinCode: string;
  busy: boolean;
  local: boolean;
  homeDesign?: boolean;
  notice: string;
  error: string;
  onOpenChange: () => void;
  onCreate: () => void;
  onCopyLink: () => void;
  onCopyCode: () => void;
}

export function RoomInvitation({ roomId, clientJoined, open, inviteHref, joinCode, busy, local, homeDesign = false, notice, error, onOpenChange, onCreate, onCopyLink, onCopyCode }: Props) {
  const loopback = inviteHref && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(inviteHref).hostname);
  return <Dialog open={open} onOpenChange={(next) => { if (next !== open) onOpenChange(); }}>
    <DialogTrigger asChild><Button className="button secondary"><Users size={17} aria-hidden="true" />{clientJoined ? "Client access" : "Invite client"}</Button></DialogTrigger>
    <DialogContent className={styles.inviteDialog}>
      <DialogHeader><DialogTitle>{clientJoined ? "Your client has joined." : "Bring your client into the room."}</DialogTitle><DialogDescription>{homeDesign ? "Your client can explore and refine this home, discuss it with your assistant, and accept a saved design. You both see the conversation and draft agreement library. Private pricing records remain private." : clientJoined ? "They can read the shared conversation and the drafts you choose to share." : "Share a QR code, room code, or link. Your client can see the agreed scope and room conversation. Your private draft stays with you until you share it."}</DialogDescription></DialogHeader>
      {clientJoined ? <div className={styles.joinedInvitation}><span><CheckCheck size={26} aria-hidden="true" /></span><p>This room has its two people. Your invitation is no longer available to someone else.</p><Button asChild className="button primary"><a href={`/client/rooms/${encodeURIComponent(roomId)}`} target="_blank" rel="noopener noreferrer">{local ? "Open client demo" : "Open client view"}<ExternalLink size={15} aria-hidden="true" /></a></Button><small>Use the browser where the client joined to reopen their view.</small></div> : inviteHref ? <>
        <div className={styles.inviteMethods}>
          <figure className={styles.inviteQr}><QRCodeSVG value={inviteHref} size={192} marginSize={4} level="M" bgColor="#ffffff" fgColor="#102b3f" title="Scan to join the project room" role="img" aria-label="Scan to join the project room" /><figcaption>Scan to open the client view</figcaption></figure>
          <div className={styles.codeMethod}><h3>Or use the room code</h3><output className={styles.roomCode} aria-label="Room code">{joinCode}</output><Button className="button secondary" disabled={busy} onClick={onCopyCode}><Copy size={15} aria-hidden="true" />Copy room code</Button><p>Choose <Link href="/join" target="_blank">Join a room</Link> on the home page and enter this code.</p><span>One client · Expires in 24 hours</span></div>
        </div>
        {loopback && <p className={styles.inviteReachability}>Joining from a phone? Open the workspace on an address both devices can reach before sharing the QR code.</p>}
        <div className={styles.invitationFooter}><Button className="button secondary" disabled={busy} onClick={onCopyLink}><Link2 size={15} aria-hidden="true" />Copy invite link</Button><Button asChild className="button primary"><a href={inviteHref} target="_blank" rel="noopener noreferrer">{local ? "Open client demo" : "Open client view"}<ExternalLink size={15} aria-hidden="true" /></a></Button></div>
        <div className={styles.rotateInvitation}><Button className="button text-button" disabled={busy} onClick={onCreate}>{busy ? "Replacing invitation…" : "Create a new invitation"}</Button><p>This replaces the current QR code, room code, and link.</p></div>
      </> : <div className={styles.createInvitation}><Users size={28} aria-hidden="true" /><p>You choose who joins. Create one invitation, then share it with your client.</p><Button className="button primary" disabled={busy} onClick={onCreate}><Link2 size={16} aria-hidden="true" />{busy ? "Creating invitation…" : "Create invite link"}</Button></div>}
      {notice && <p className={styles.inviteNotice} role="status">{notice}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </DialogContent>
  </Dialog>;
}
