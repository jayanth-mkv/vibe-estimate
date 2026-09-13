/** Fixed server-side destination: user input can never select an upstream host. */
export async function forwardService(request: Request, path: string) {
  const origin = process.env.BACKEND_ORIGIN || "http://127.0.0.1:8080";
  // Routes supply a root-relative, encoded path. Keep query data separate so
  // a revision selector cannot become a destination URL or replace the host.
  if (!path.startsWith("/") || path.startsWith("//") || /[\\?#]/.test(path)) return new Response(null, { status: 404 });
  const headers = new Headers();
  const eventHeaders = path === "/internal/firestore" ? ["ce-id", "ce-source", "ce-subject", "ce-type", "ce-specversion"] : [];
  for (const name of ["authorization", "content-type", ...eventHeaders]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  let body: Uint8Array | undefined;
  if (request.method === "POST" && request.body) {
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > 49152) {
        await reader.cancel();
        return Response.json({ error: { code: "INPUT_TOO_LARGE", message: "This source text is too long. Please use a shorter excerpt." } }, { status: 413 });
      }
      chunks.push(chunk.value);
    }
    body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  }
  try {
    const destination = new URL(origin);
    destination.pathname = path;
    destination.search = new URL(request.url).search;
    destination.hash = "";
    const upstream = await fetch(destination.toString(), {
      method: request.method, headers, body: body as BodyInit | undefined,
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(65000),
    });
    const outgoing = new Headers({ "Cache-Control": "no-store" });
    for (const name of ["content-type", "content-disposition", "retry-after"]) {
      const value = upstream.headers.get(name);
      if (value) outgoing.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers: outgoing });
  } catch {
    return Response.json({ error: { code: "SERVICE_UNAVAILABLE", message: "We could not reach your workspace. Your inputs are still here. Please try again shortly." } }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "5" } });
  }
}
