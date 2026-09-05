import Link from "next/link";

export default function NotFound() {
  return <main className="error-page"><p className="brand">VibeEstimate</p><h1>This page isn’t here.</h1><p>Return to your workspace to find your projects.</p><Link className="button primary" href="/">Open workspace</Link></main>;
}
