"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { Landing } from "@/components/landing";
import "../landing.css";

export default function WelcomePage() {
  const router = useRouter();
  return <div className="marketing-page">
    <a className="skip-link" href="#product-tour">Skip to product tour</a>
    <header className="topbar"><div className="topbar-inner">
      <Link className="brand" href="/proposals" aria-label="VibeEstimate workspace"><span className="brand-mark"><CheckCheck size={19} aria-hidden="true" /></span>VibeEstimate</Link>
      <nav className="desktop-navigation" aria-label="Product tour"><a href="#how-it-works">How it works</a><a href="#why-vibeestimate">Why VibeEstimate</a><a href="#drafts">Drafts & revisions</a></nav>
      <Link className="header-start" href="/proposals">Open workspace</Link>
    </div></header>
    <main id="product-tour" className="landing-shell"><Landing busy={false} local onStart={() => router.push("/proposals")} startLabel="Open workspace" /></main>
    <footer className="page-footer landing-footer"><span>From the original wording to your next decision.</span><Link href="/proposals" className="inline-action">Open your workspace</Link></footer>
  </div>;
}
