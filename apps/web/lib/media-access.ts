import { canViewResource } from "./visibility";
import { verifySessionOrNull } from "./recording/verify-session";

export async function authorizeMedia(
  req: Request,
  key: string,
  db: D1Database,
): Promise<boolean> {
  if (key.endsWith(".svg")) return false;
  const visitor = await verifySessionOrNull(req.headers.get("cookie"));
  type Resource = {
    userId: string | null;
    workspaceId: string | null;
    visibility: string;
    state: string;
  };
  const screenshot =
    /^screenshots\/([A-Za-z0-9_-]+)(\.source\.png|\.state\.json|\.png)$/.exec(
      key,
    );
  if (screenshot) {
    const row = await db
      .prepare(
        "SELECT user_id AS userId, workspace_id AS workspaceId, visibility, state FROM screenshots WHERE id = ?1",
      )
      .bind(screenshot[1])
      .first<Resource>();
    if (!row || row.state !== "ready") return false;
    if (screenshot[2] !== ".png")
      return !!visitor && visitor.userId === row.userId;
    return canViewResource(visitor, row);
  }
  // Only primary media referenced by a live record is servable. JSON/editor sidecars are never exposed here.
  const row = await db
    .prepare(
      "SELECT user_id AS userId, workspace_id AS workspaceId, visibility, state FROM recordings WHERE storage_key = ?1 OR poster_key = ?1 OR (webcam_storage_key = ?1 AND webcam_state = 'ready') LIMIT 1",
    )
    .bind(key)
    .first<Resource>();
  if (row) return row.state === "ready" && canViewResource(visitor, row);
  if (!visitor) return false;
  if (key.startsWith("user-avatars/")) {
    const user = await db
      .prepare(
        "SELECT id FROM users WHERE image = ?1 OR substr(image,1,length(?1)+1) = ?1 || '?'",
      )
      .bind(`/api/r/media/${key}`)
      .first<{ id: string }>();
    return user?.id === visitor.userId;
  }
  const logo = await db
    .prepare("SELECT id FROM workspace WHERE logo_key = ?1")
    .bind(key)
    .first<{ id: string }>();
  return !!logo && visitor.workspaceIds.includes(logo.id);
}

export function parseByteRange(
  value: string | null,
  size: number,
): { offset: number; length: number } | null | false {
  if (!value) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!m || (!m[1] && !m[2]) || size <= 0) return false;
  let start: number, end: number;
  if (!m[1]) {
    const suffix = Number(m[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return false;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  }
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  )
    return false;
  return { offset: start, length: end - start + 1 };
}
