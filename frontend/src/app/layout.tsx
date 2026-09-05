import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { firebaseConfigScript } from "../lib/public-runtime-config";

export const dynamic = "force-dynamic";

const bodyFont = localFont({ src: "../../public/fonts/dm-sans-variable.ttf", variable: "--font-dm-sans", display: "swap", weight: "100 1000" });
const headingFont = localFont({ src: [
  { path: "../../public/fonts/poppins-regular.woff2", weight: "400", style: "normal" },
  { path: "../../public/fonts/poppins-medium.woff2", weight: "500", style: "normal" },
  { path: "../../public/fonts/poppins-semibold.woff2", weight: "600", style: "normal" },
], variable: "--font-poppins", display: "swap" });

export const metadata: Metadata = { title: "VibeEstimate · Make the change clear", description: "Review agreed scope, clarify client changes, and prepare a source-linked draft proposal.", robots: { index: false, follow: false } };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const config = firebaseConfigScript(process.env.FIREBASE_WEB_CONFIG);
  return <html lang="en" className={`${bodyFont.variable} ${headingFont.variable}`}><head>{config ? <script dangerouslySetInnerHTML={{ __html: config }} /> : null}</head><body>{children}</body></html>;
}
