import { RoomWorkspace } from "@/components/room/room-workspace";

export default async function ClientRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RoomWorkspace key={id} roomId={id} identity="client" />;
}
