/** Fixed server-side destination: user input can never select an upstream host. */
export async function forwardService(request: Request, path: string) {
  const origin = process.env.BACKEND_ORIGIN || "http://127.0.0.1:8080";
  const headers = new Headers();
  for (const name of ["authorization", "content-type"]) {
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
    const upstream = await fetch(`${origin.replace(/\/$/, "")}${path}`, {
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
