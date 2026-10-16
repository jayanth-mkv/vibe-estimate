export type TrashItem = { kind: "home" | "room"; id: string; name: string; deletedAt: string; trashId: string; roomId?: string };
export type RestoredItem = Pick<TrashItem, "kind" | "id" | "roomId">;
export type LifecycleReceipt = { hash: string; result: TrashItem | RestoredItem };
