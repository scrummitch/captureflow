import { getAppWebEnv } from "./cf-env";
import { issueDeviceToken } from "./device-tokens";
export async function digest(value: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
export async function issueLoginCode(
  userId: string,
  challenge: string,
  label: string | null,
) {
  const env = await getAppWebEnv();
  if (!env?.DB) throw new Error("Database unavailable");
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const code = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  await env.DB.prepare("DELETE FROM desktop_auth_codes WHERE expires_at < ?1")
    .bind(Date.now())
    .run();
  await env.DB.prepare(
    "INSERT INTO desktop_auth_codes (code_hash,user_id,challenge,label,expires_at) VALUES (?1,?2,?3,?4,?5)",
  )
    .bind(
      await digest(code),
      userId,
      challenge,
      label?.slice(0, 120) ?? null,
      Date.now() + 5 * 60 * 1000,
    )
    .run();
  return code;
}
export async function redeemLoginCode(code: string, verifier: string) {
  const env = await getAppWebEnv();
  if (!env?.DB) throw new Error("Database unavailable");
  const row = await env.DB.prepare(
    "DELETE FROM desktop_auth_codes WHERE code_hash=?1 AND challenge=?2 AND expires_at>?3 RETURNING user_id,label",
  )
    .bind(await digest(code), await digest(verifier), Date.now())
    .first<{ user_id: string; label: string | null }>();
  if (!row) return null;
  const token = await issueDeviceToken(row.user_id, row.label);
  const user = await env.DB.prepare("SELECT email FROM users WHERE id=?1")
    .bind(row.user_id)
    .first<{ email: string }>();
  return { ...token, email: user?.email ?? null, label: row.label };
}
