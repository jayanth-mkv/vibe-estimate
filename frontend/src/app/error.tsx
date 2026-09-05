"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="error-page"><p className="brand">VibeEstimate</p><h1>We couldn’t open this view.</h1><p>Your saved projects are still in your account. Try loading the view again.</p><Button className="button primary" onClick={reset}>Try again</Button></main>;
}
