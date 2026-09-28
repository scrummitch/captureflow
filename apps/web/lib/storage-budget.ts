import { getAppWebEnv } from "./cf-env";

// An installation-wide ceiling protects the operator even when multiple uploads
// race or retain originals. High-water reservations are conservative on failures.
// D1 serializes each statement: the size check and reservation cannot race.
export async function reserveStorage(
  key: string,
  bytes: number,
): Promise<void> {
  if (!Number.isSafeInteger(bytes) || bytes < 0)
    throw new Error("Invalid object size");
  const env = await getAppWebEnv();
  if (!env?.DB) throw new Error("Storage accounting unavailable");
  const cap = Number(env.STORAGE_LIMIT_BYTES ?? 10 * 1024 ** 3);
  if (!Number.isSafeInteger(cap) || cap <= 0)
    throw new Error("Invalid storage limit");
  const result = await env.DB.prepare(
    `INSERT INTO storage_reservations (object_key, bytes)
    SELECT ?1, ?2 WHERE ?2 <= ?3 - COALESCE((SELECT SUM(bytes) FROM storage_reservations WHERE object_key != ?1),0)
    ON CONFLICT(object_key) DO UPDATE SET bytes = MAX(storage_reservations.bytes, excluded.bytes)
    RETURNING object_key`,
  )
    .bind(key, bytes, cap)
    .first();
  if (!result)
    throw new StorageLimitError("Installation storage limit reached");
}

export async function releaseStorage(key: string): Promise<void> {
  const env = await getAppWebEnv();
  if (!env?.DB) throw new Error("Storage accounting unavailable");
  await env.DB.prepare(
    "DELETE FROM storage_reservations WHERE object_key = ?1 OR substr(object_key,1,length(?1)+1) = ?1 || '#'",
  )
    .bind(key)
    .run();
}

export async function readBoundedBody(
  req: Request,
  maxBytes: number,
): Promise<ArrayBuffer> {
  if (!req.body) return new ArrayBuffer(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new StorageLimitError("Request body too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result.buffer;
}

export class StorageLimitError extends Error {}
export function withStorageErrors<T extends unknown[]>(
  handler: (...args: T) => Promise<Response>,
) {
  return async (...args: T): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof StorageLimitError)
        return Response.json(
          {
            error: "Storage or upload size limit reached",
            code: "storage_limit",
          },
          { status: 413 },
        );
      throw error;
    }
  };
}
