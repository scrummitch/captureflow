import { issueLoginCode } from "@/lib/desktop-login";
import { redirect } from "next/navigation";
import { loadSession } from "@/lib/session-guard";
import { issueDeviceToken } from "@/lib/device-tokens";
import { getAppWebEnv } from "@/lib/cf-env";
import { CallbackHandoff } from "./CallbackHandoff";
import { ExtensionHandoff } from "./ExtensionHandoff";
import { resolveExtensionTarget } from "./extension-target";

export const dynamic = "force-dynamic";

export default async function CallbackPage({
  searchParams,
}: {
  searchParams: Promise<{
    label?: string;
    return?: string;
    ext?: string;
    state?: string;
    challenge?: string;
  }>;
}) {
  const sp = await searchParams;
  const session = await loadSession();
  if (!session) {
    const params = new URLSearchParams();
    if (sp.label) params.set("label", sp.label);
    if (sp.return) params.set("return", sp.return);
    if (sp.ext) params.set("ext", sp.ext);
    if (sp.state) params.set("state", sp.state);
    if (sp.challenge) params.set("challenge", sp.challenge);
    const tail = params.toString();
    const next = `/auth/callback${tail ? `?${tail}` : ""}`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  const label = typeof sp.label === "string" ? sp.label : null;

  /*
   * Browser-extension flow: a client island hands the token to the extension
   * via chrome.runtime.sendMessage. In production the target must match the
   * pinned CAPTUREFLOW_EXTENSION_ID, and an unset pin hands out nothing, so an
   * attacker-chosen ?ext= can't reach a look-alike extension.
   */
  if (sp.ext !== undefined) {
    const env = await getAppWebEnv();
    const extTarget = resolveExtensionTarget(
      sp.ext,
      env?.CAPTUREFLOW_EXTENSION_ID ?? null,
      process.env.NODE_ENV === "production",
    );
    if (!extTarget) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-canvas px-4 text-center">
          <p className="max-w-sm text-fg">
            Couldn’t verify the extension. Reinstall it and try again.
          </p>
        </main>
      );
    }
    const issued = await issueDeviceToken(session.user.id, label);
    return (
      <ExtensionHandoff
        extId={extTarget}
        token={issued.rawToken}
        tokenId={issued.id}
        email={session.user.email}
      />
    );
  }

  if (
    !sp.state ||
    !/^[A-Za-z0-9_-]{43}$/.test(sp.state) ||
    !sp.challenge ||
    !/^[A-Za-z0-9_-]{43}$/.test(sp.challenge)
  ) {
    return (
      <main className="p-8">Start sign-in from your Flindev desktop app.</main>
    );
  }
  const code = await issueLoginCode(session.user.id, sp.challenge, label);
  const link = new URL("captureflow://auth/callback");
  link.searchParams.set("code", code);
  link.searchParams.set("state", sp.state);
  return (
    <CallbackHandoff deepLink={link.toString()} email={session.user.email} />
  );
}
