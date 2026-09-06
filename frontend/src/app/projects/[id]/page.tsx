import { HomeStudio } from "@/components/spatial/home-studio";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <HomeStudio key={id} homeId={id} />;
}
