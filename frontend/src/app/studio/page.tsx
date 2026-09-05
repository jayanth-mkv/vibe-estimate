import type { Metadata } from "next";
import { HouseWorkbench } from "@/components/spatial/house-workbench";
export const metadata: Metadata = { title: "House studio · VibeEstimate", description: "Explore a sample home and try selected furniture, material and lighting changes." };
export default function StudioPage() { return <HouseWorkbench />; }
