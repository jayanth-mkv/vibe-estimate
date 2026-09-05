import { forwardService } from "../../../lib/server-service";

export const dynamic = "force-dynamic";
export const maxDuration = 70;

async function forward(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (path.some(part => part === "." || part === ".." || part.includes("/"))) return new Response(null, { status: 404 });
  return forwardService(request, `/api/${path.map(encodeURIComponent).join("/")}`);
}
export { forward as GET, forward as POST };
