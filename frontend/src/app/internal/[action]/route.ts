import { forwardService } from "../../../lib/server-service";
export const dynamic = "force-dynamic";
export const maxDuration = 70;
export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  const { action } = await context.params;
  if (!["observer", "reconcile"].includes(action)) return new Response(null, { status: 404 });
  return forwardService(request, `/internal/${action}`);
}
