export class RequestBodyTooLarge extends Error {
  constructor() { super("BODY_TOO_LARGE"); }
}

export async function readBoundedText(request: Request, limit: number) {
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > limit) throw new RequestBodyTooLarge();
  if (!request.body) throw new Error("INVALID_BODY");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new RequestBodyTooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}
