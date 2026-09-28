import { resolveDeviceToken } from "@/lib/device-tokens";
export async function resolveDeviceTokenToUser(
  rawToken: string,
): Promise<string | null> {
  return (await resolveDeviceToken(rawToken))?.userId ?? null;
}
