"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Bot, Check, CheckCheck, ChevronDown, CircleHelp, Copy, ExternalLink, FileText, Link2, LoaderCircle, MessageCircle, Pause, Play, Send, ShieldCheck, Users, WifiOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Room, RoomObserver, SharedDraft } from "@/lib/room-types";
import type { PendingMessage } from "./room-workspace";
import styles from "./room.module.css";

interface Props {
  room: Room;
  text: string;
  pending: PendingMessage | null;
  busy: string;
  notice: string;
  actionError: string;
  connectionError: string;
  inviteOpen: boolean;
  inviteHref: string;
  local: boolean;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  onTextChange: (value: string) => void;
  onSend: () => void;
  onRetryMessage: () => void;
  onObserver: (action: "retry" | "pause" | "resume") => void;
  onToggleInvite: () => void;
  onCreateInvite: () => void;
  onCopyInvite: () => void;
  onPrepareDraft: () => void;
  onShareDraft: () => void;
  onNavigate: (href: string) => void;
}

const money = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(paise / 100);
const time = (value: string) => new Date(value).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
const date = (value: string) => new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const observerTitles: Record<RoomObserver["status"], string> = {
  watching: "Following the conversation",
  queued: "Reviewing new messages",
  thinking: "Reviewing new messages",
  ready: "Review up to date",
  paused: "Agent paused",
  error: "Review needs attention",
  limit: "Review limit reached",
};

const suggestions = {
  client: [
    { label: "Ask about 6 lights", text: "Could we quote 6 display lights?" },
    { label: "Revise to 4 lights", text: "Could we revise the draft to 4 display lights?" },
    { label: "Check included work", text: "Please keep the kitchen lighting in the agreed scope." },
  ],
  designer: [
    { label: "Confirm a draft for 6", text: "I will prepare a draft for 6 display lights at ₹2,000 each." },
    { label: "Revise the draft to 4", text: "I will revise the draft to 4 display lights at ₹2,000 each." },
    { label: "Clarify included work", text: "Kitchen lighting stays included. Client approval has not been collected." },
  ],
};

export function RoomView(props: Props) {
  const { room, text, pending, busy, notice, actionError, connectionError, inviteOpen, inviteHref, local, composerRef, onTextChange, onSend, onRetryMessage, onObserver, onToggleInvite, onCreateInvite, onCopyInvite, onPrepareDraft, onShareDraft, onNavigate } = props;
  const [panel, setPanel] = useState("conversation");
  const [unreadMessages, setUnreadMessages] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const nearEnd = useRef(true);
  const designer = room.role === "designer";
  const agent = room.observer;
  const working = agent.status === "queued" || agent.status === "thinking";
  const currentReview = agent.status === "ready" && agent.reviewedMessageCount === room.messages.length && !!agent.analysis;
  const canPrepare = currentReview && !busy && !text.trim() && !pending;
  const draftHref = room.draftProjectId ? `/?project=${encodeURIComponent(room.draftProjectId)}&room=${encodeURIComponent(room.id)}` : "";

  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    if (nearEnd.current) log.scrollTop = log.scrollHeight;
    else if (room.messages.length) {
      const frame = window.requestAnimationFrame(() => setUnreadMessages(true));
      return () => window.cancelAnimationFrame(frame);
    }
  }, [room.messages.length]);

  function openComposer(value?: string) {
    setPanel("conversation");
    if (value !== undefined) onTextChange(value);
    window.requestAnimationFrame(() => composerRef.current?.focus());
  }

  function readEvidence(index: number) {
    const figure = document.getElementById(`room-evidence-${index}`);
    const disclosure = figure?.closest("details");
    if (disclosure) disclosure.open = true;
    window.requestAnimationFrame(() => { figure?.focus(); figure?.scrollIntoView({ block: "nearest", behavior: "auto" }); });
  }

  return <div className={styles.page}>
    <a className="skip-link" href="#room-main">Skip to project room</a>
    <header className={styles.header}>
      <Link className="brand" href="/" onClick={(event) => { event.preventDefault(); onNavigate("/"); }}><span className="brand-mark"><CheckCheck size={19} aria-hidden="true" /></span>VibeEstimate</Link>
      <div className={styles.headerRight}><span className={styles.viewBadge}>{designer ? "Designer view" : "Client view"}</span><Link className={styles.tourLink} href="/welcome" onClick={(event) => { event.preventDefault(); onNavigate("/welcome"); }}>Product tour</Link></div>
    </header>

    <main id="room-main" className={styles.main}>
      <div className={styles.roomHeading}>
        <div className={styles.roomIdentity}>
          {designer ? <Link className={styles.backLink} href={`/?project=${encodeURIComponent(room.projectId)}`} onClick={(event) => { event.preventDefault(); onNavigate(`/?project=${encodeURIComponent(room.projectId)}`); }}><ArrowLeft size={14} aria-hidden="true" />Back to project</Link> : <span className={styles.roomCaption}>Your shared project room</span>}
          <h1>{room.name}</h1>
          <p>One conversation. A clearer scope. Every draft kept.</p>
        </div>
        {designer && <Button className="button secondary" onClick={onToggleInvite} aria-expanded={inviteOpen} aria-controls="room-invite"><Users size={17} aria-hidden="true" />{room.clientJoined ? "Client access" : "Invite client"}</Button>}
      </div>

      <div className={styles.roomPeople} aria-label="Room participants">
        <span><i className={styles.designerAvatar} aria-hidden="true">D</i><strong>Designer</strong>{designer && <small>You</small>}</span>
        <span><i className={styles.clientAvatar} aria-hidden="true">C</i><strong>Client</strong>{!designer ? <small>You</small> : <small>{room.clientJoined ? "Joined" : "Invite pending"}</small>}</span>
        <span className={styles.agentPerson}><i className={styles.agentAvatar}><Bot size={16} aria-hidden="true" /></i><strong>Scope agent</strong><small>{agent.status === "paused" ? "Paused" : agent.status === "error" || agent.status === "limit" ? "Needs attention" : "Observes messages"}</small></span>
        <span className={styles.connection} role="status">{connectionError ? <><WifiOff size={14} aria-hidden="true" />Reconnecting</> : <><Check size={14} aria-hidden="true" />Room synced</>}</span>
      </div>

      {inviteOpen && designer && <section id="room-invite" className={styles.invitePanel} aria-labelledby="invite-title">
        <div><h2 id="invite-title">{room.clientJoined ? "Your client has joined." : "Bring your client into the conversation."}</h2><p>{room.clientJoined ? "The client view opens separately, with access to this conversation and the drafts you share." : "The link shares this room’s agreed scope, source conversation, and future messages with one client. Private draft work stays with you until you share it."}</p></div>
        <div className={styles.inviteActions}>
          {room.clientJoined ? local && <Button asChild className="button primary"><a href={`/client/rooms/${encodeURIComponent(room.id)}`} target="_blank" rel="noopener noreferrer">Open client demo<ExternalLink size={15} aria-hidden="true" /></a></Button> : inviteHref ? <><Button className="button secondary" onClick={onCopyInvite}><Copy size={15} aria-hidden="true" />Copy invite link</Button><Button asChild className="button primary"><a href={inviteHref} target="_blank" rel="noopener noreferrer">{local ? "Open client demo" : "Open client invitation"}<ExternalLink size={15} aria-hidden="true" /></a></Button></> : <Button className="button primary" disabled={!!busy} onClick={onCreateInvite}><Link2 size={16} aria-hidden="true" />{busy === "invite" ? "Creating link…" : "Create invite link"}</Button>}
          <Button className={`button text-button ${styles.closeInvite}`} aria-label="Close invitation panel" onClick={onToggleInvite}><X size={18} aria-hidden="true" /></Button>
        </div>
        {local && <p className={styles.inviteHint}>Demo tip: place the two tabs side by side. Each view is a different signed-in person; send a message to see it arrive in the other view.</p>}
      </section>}

      {connectionError && <p className={styles.reconnect} role="status"><WifiOff size={16} aria-hidden="true" />{connectionError}</p>}
      {actionError && <p className={styles.error} role="alert">{actionError}</p>}
      <p className={notice ? styles.notice : styles.hiddenNotice} role="status">{notice && <CheckCheck size={17} aria-hidden="true" />}{notice}</p>

      <Tabs value={panel} onValueChange={setPanel} className={styles.roomTabs}>
        <TabsList className={styles.mobileTabs} aria-label="Project room views">
          <TabsTrigger value="conversation"><MessageCircle size={16} aria-hidden="true" />Chat</TabsTrigger>
          <TabsTrigger value="context"><Bot size={16} aria-hidden="true" />Scope agent</TabsTrigger>
          <TabsTrigger value="drafts"><FileText size={16} aria-hidden="true" />Drafts{room.sharedDrafts.length > 0 && <span className={styles.tabCount}>{room.sharedDrafts.length}</span>}</TabsTrigger>
        </TabsList>

        <div className={styles.roomGrid}>
          <TabsContent forceMount value="conversation" className={styles.conversationPanel}>
            <div className={styles.panelHeading}><h2><MessageCircle size={18} aria-hidden="true" />Conversation</h2><span>{room.messages.length} / 40 messages</span></div>
            <div className={styles.chatLog} role="log" aria-label="Room conversation" aria-live="polite" aria-relevant="additions" ref={logRef} tabIndex={0} onScroll={(event) => { const target = event.currentTarget; nearEnd.current = target.scrollHeight - target.scrollTop - target.clientHeight < 100; if (nearEnd.current) setUnreadMessages(false); }}>
              {!room.messages.length && <div className={styles.conversationIntro}><span className={styles.conversationMark}><Users size={23} aria-hidden="true" /></span><h3>Start with what you want to change.</h3><p>{designer ? "You and your client can work through the details here. The scope agent checks new messages against the agreed work." : "Tell your designer what you have in mind. The scope agent helps everyone see what is included and what needs a decision."}</p><span><ShieldCheck size={13} aria-hidden="true" />Only room members can read this conversation.</span></div>}
              <p className={styles.dayDivider}>{date(room.createdAt)}</p>
              {room.messages.map((message) => <article key={message.id} className={`${styles.message} ${message.role === room.role ? styles.ownMessage : ""}`} aria-label={`${message.role === "designer" ? "Designer" : "Client"} message`}>
                <div className={styles.messageMeta}><strong>{message.role === "designer" ? "Designer" : "Client"}{message.role === room.role ? " · You" : ""}</strong><time dateTime={message.createdAt}>{time(message.createdAt)}</time></div>
                <p>{message.text}</p><span className={styles.messageSaved}><Check size={12} aria-hidden="true" />Saved</span>
              </article>)}
              {!room.messages.length && <p className={styles.firstMessageHint}>{room.clientJoined ? "Everyone’s here. Send the first message below." : designer ? "Invite your client, or add a first message while you wait." : "Your designer will see messages you send here."}</p>}
            </div>
            {unreadMessages && <Button className={`button secondary ${styles.newMessages}`} onClick={() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; nearEnd.current = true; setUnreadMessages(false); }}>New messages<ChevronDown size={16} aria-hidden="true" /></Button>}
            <form className={styles.composer} onSubmit={(event) => { event.preventDefault(); onSend(); }}>
              <label htmlFor="room-message">Message the room</label>
              <Textarea id="room-message" ref={composerRef} value={text} onChange={(event) => onTextChange(event.target.value)} placeholder={designer ? "Discuss the scope or clarify a detail…" : "What would you like to change?"} maxLength={1000} rows={2} disabled={!!pending || room.messages.length >= 40} aria-describedby="message-help" onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); onSend(); } }} />
              {pending?.status === "error" && <div className={styles.messageError} role="alert"><p>{pending.error}</p><Button type="button" className="button secondary" onClick={onRetryMessage}>Retry message</Button></div>}
              <div className={styles.composerFooter}><p id="message-help">{room.messages.length >= 40 ? "This room’s message limit has been reached." : pending?.status === "sending" ? "Saving your message…" : pending?.status === "error" ? "Not confirmed saved. Retry safely." : "Both people and the scope agent can read your message."}<span>{text.length} / 1,000</span></p><Button type="submit" className="button primary" disabled={!text.trim() || !!pending || room.messages.length >= 40}>{pending?.status === "sending" ? <><LoaderCircle className={styles.spinner} size={16} aria-hidden="true" />Sending…</> : <><Send size={16} aria-hidden="true" />Send message</>}</Button></div>
              {agent.provider === "fixture" && <details className={styles.demoSuggestions}><summary>Try a demo message<ChevronDown size={14} aria-hidden="true" /></summary><p>This local sample supports the lighting conversation below. Choose a prompt, then send it yourself.</p><div>{suggestions[room.role].map((suggestion) => <Button key={suggestion.label} type="button" className="button secondary" disabled={!!pending || room.messages.length >= 40} onClick={() => openComposer(suggestion.text)}>{suggestion.label}</Button>)}</div></details>}
            </form>
          </TabsContent>

          <TabsContent forceMount value="context" className={styles.contextPanel}>
            <div className={styles.agentHeading}><span className={styles.agentMark}><Bot size={23} aria-hidden="true" /></span><div><h2>Scope agent</h2><p>{agent.provider === "gemini" ? "Gemini · grounded in your sources" : "Local sample · Gemini not connected"}</p></div></div>
            <div className={`${styles.agentStatus} ${agent.status === "error" || agent.status === "limit" ? styles.agentWarning : ""}`} role="status">{working ? <LoaderCircle size={15} aria-hidden="true" className={styles.spinner} /> : agent.status === "paused" ? <Pause size={15} aria-hidden="true" /> : currentReview ? <CheckCheck size={15} aria-hidden="true" /> : <span className={styles.statusDot} />}{observerTitles[agent.status]}</div>
            {agent.error && <p className={styles.agentError}>{agent.error}</p>}
            {agent.analysis ? <div className={styles.agentReview}>
              {agent.reviewedMessageCount < room.messages.length && <p className={styles.staleReview}>This review covers {agent.reviewedMessageCount} of {room.messages.length} messages. Newer messages still need review.</p>}
              <p className={styles.reviewSummary}>{agent.analysis.summary}</p>
              <div className={styles.evidenceLinks}><span>Based on</span>{agent.analysis.evidence.map((evidence, index) => <Button key={`${index}-${evidence.source}`} className={styles.citation} aria-label={`Read source ${index + 1}`} onClick={() => readEvidence(index)}>{index + 1}</Button>)}</div>
              {!!agent.analysis.included.length && <section className={styles.finding}><h3><CheckCheck size={16} aria-hidden="true" />Already included</h3><ul>{agent.analysis.included.map((finding, index) => <li key={index}>{finding}</li>)}</ul></section>}
              {!!agent.analysis.proposed.length && <section className={styles.finding}><h3><FileText size={16} aria-hidden="true" />Proposed additions</h3><ul>{agent.analysis.proposed.map((finding, index) => <li key={index}>{finding}</li>)}</ul></section>}
              {!!agent.analysis.questions.length && <section className={styles.openQuestions}><h3><CircleHelp size={16} aria-hidden="true" />Still to decide</h3><ul>{agent.analysis.questions.map((question, index) => <li key={index}>{question}</li>)}</ul></section>}
            </div> : <div className={styles.agentEmpty}><h3>{agent.status === "paused" ? "The conversation can continue." : "The details won’t get lost."}</h3><p>{working ? "The agent is checking the saved messages against the agreed scope. Its findings will appear here." : "After you send a message, the agent separates included work, proposed additions, and questions to resolve."}</p></div>}
            <div className={styles.agentControls}>
              {designer && <>{agent.status === "paused" ? <Button className="button secondary" disabled={!!busy} onClick={() => onObserver("resume")}><Play size={15} aria-hidden="true" />{busy === "resume" ? "Resuming…" : "Resume agent"}</Button> : agent.status !== "limit" && <Button className="button text-button" disabled={!!busy} onClick={() => onObserver("pause")}><Pause size={15} aria-hidden="true" />{busy === "pause" ? "Pausing…" : "Pause agent"}</Button>}{agent.status === "error" && <Button className="button secondary" disabled={!!busy} onClick={() => onObserver("retry")}>{busy === "retry" ? "Requesting…" : "Retry review"}</Button>}</>}
              <p>Reviews used: {agent.callsUsed} / {agent.callLimit}.{!designer && " The designer controls the agent."}</p>
            </div>
            {designer && <div className={styles.prepareDraft}><div><strong>Ready to put it in writing?</strong><p>{text.trim() || pending ? "Send your message before preparing a draft." : "Take this review into your private draft workspace. You choose quantities and confirmed prices."}</p></div><Button className="button primary" disabled={!canPrepare} onClick={onPrepareDraft}>{busy === "prepare" ? "Preparing…" : "Prepare draft"}<ArrowRight size={16} aria-hidden="true" /></Button>{!currentReview && <p>A review of the latest messages is needed first.</p>}</div>}
            <details className={styles.sources}><summary><FileText size={16} aria-hidden="true" />Agreed scope &amp; sources<ChevronDown size={15} aria-hidden="true" /></summary><div><h3>Agreed scope</h3><p className={styles.sourceText}>{room.scope}</p><h3>Original conversation</h3><p className={styles.sourceText}>{room.sourceMessages}</p>{agent.analysis?.evidence.map((evidence, index) => <figure key={`${index}-${evidence.source}`} id={`room-evidence-${index}`} tabIndex={-1} className={styles.evidenceQuote}><figcaption>Source {index + 1} · {evidence.source === "scope" ? "Agreed scope" : "Conversation"}</figcaption><blockquote>{evidence.quote}</blockquote></figure>)}</div></details>
            <p className={styles.agentBoundary}>The agent observes and suggests. People decide. It cannot approve work or send messages on your behalf.</p>
          </TabsContent>

          <TabsContent forceMount value="drafts" className={styles.draftsPanel}>
            <div className={styles.panelHeading}><h2><FileText size={18} aria-hidden="true" />Shared drafts</h2><span>{room.sharedDrafts.length ? `${room.sharedDrafts.length} saved ${room.sharedDrafts.length === 1 ? "version" : "versions"}` : "Not shared yet"}</span></div>
            {designer && room.shareableDraft && !room.sharedDrafts.some((draft) => draft.id === room.shareableDraft?.id) && <div className={styles.shareReady}><strong>Your saved draft is ready to share.</strong><p>{money(room.shareableDraft.totalPaise)} · {room.shareableDraft.quantity} × {money(room.shareableDraft.unitPricePaise)}. Sharing sends a copy of these saved terms to your client.</p><Button className="button primary" disabled={!!busy} onClick={onShareDraft}>{busy === "share" ? "Sharing…" : "Share saved draft"}<Send size={15} aria-hidden="true" /></Button></div>}
            {room.sharedDrafts.length ? <div className={styles.sharedDrafts}>{[...room.sharedDrafts].reverse().map((draft, index) => <SharedDraftView key={`${draft.projectId}-${draft.id}-${draft.version}`} draft={draft} latest={index === 0} />)}</div> : <div className={styles.emptyDrafts}><span><FileText size={25} aria-hidden="true" /></span><h3>{designer ? "Agree on the details, then share a draft." : "Your proposal will appear here."}</h3><p>{designer ? "Prepare a draft from the agent’s review, save your quantities and price, then share the saved version with your client." : "Your designer will share a saved draft after reviewing the details. You can discuss it here, and earlier shared versions will stay available."}</p></div>}
            {designer && draftHref && <Link className={styles.editDraftLink} href={draftHref} onClick={(event) => { event.preventDefault(); onNavigate(draftHref); }}>Open private draft workspace<ArrowRight size={15} aria-hidden="true" /></Link>}
            {!!room.sharedDrafts.length && <div className={styles.draftDiscussion}><p>A new message won’t change a shared draft. Discuss a revision here, then the designer can share an updated version.</p><Button className="button secondary" onClick={() => openComposer()}><MessageCircle size={15} aria-hidden="true" />Discuss the draft</Button></div>}
          </TabsContent>
        </div>
      </Tabs>
      <footer className={styles.footer}><span>{local ? "Local room" : "Private project room"} · {agent.provider === "gemini" ? "Gemini enabled" : "Sample agent"}</span><span>Drafts are for review · Approval not collected</span></footer>
    </main>
  </div>;
}

function SharedDraftView({ draft, latest }: { draft: SharedDraft; latest: boolean }) {
  return <article aria-label={`Shared draft ${draft.version}`} className={styles.sharedDraft}>
    <div className={styles.draftTitle}><h3>Shared draft {draft.version}</h3><span>{latest ? "Latest shared" : "Previous version"}</span></div>
    <p className={styles.draftDescription}>{draft.description}</p>
    <dl><div><dt>Quantity</dt><dd>{draft.quantity}</dd></div><div><dt>Confirmed unit price</dt><dd>{money(draft.unitPricePaise)}</dd></div><div className={styles.total}><dt>Additional work total</dt><dd>{money(draft.totalPaise)}</dd></div></dl>
    <p className={styles.approval}>Draft · Approval not collected</p>
    <p className={styles.sharedMeta}>Shared {date(draft.sharedAt)} at {time(draft.sharedAt)} · Based on {draft.messageCount} room {draft.messageCount === 1 ? "message" : "messages"}</p>
  </article>;
}
