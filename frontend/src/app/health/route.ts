import { forwardService } from "../../lib/server-service";
export const dynamic = "force-dynamic";
export function GET(request: Request) { return forwardService(request, "/health"); }
