import { randomBytes, createHash } from "node:crypto";
let pending: { state: string; verifier: string; expires: number } | null = null;
export function beginRecordingLogin() {
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  pending = { state, verifier, expires: Date.now() + 5 * 60 * 1000 };
  return {
    state,
    challenge: createHash("sha256").update(verifier).digest("base64url"),
  };
}
export function consumeRecordingLogin(state: string) {
  if (!pending || Date.now() > pending.expires || state !== pending.state)
    return null;
  const verifier = pending.verifier;
  pending = null;
  return verifier;
}
