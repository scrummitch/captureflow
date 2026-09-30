import type { Metadata } from "next";
import { MARKETING_SITE_URL } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-16 text-fg">
      <a href={MARKETING_SITE_URL} className="text-xl font-semibold">
        Flindev
      </a>
      <h1 className="text-3xl font-semibold">Your recordings</h1>
      <p>
        This private installation stores recordings, screenshots and account
        data on Flindev’s Cloudflare infrastructure.
      </p>
      <p>
        Recording owners control sharing and can delete their captures from the
        dashboard.
      </p>
      <p>
        Contact{" "}
        <a href={MARKETING_SITE_URL} className="underline">
          Flindev
        </a>{" "}
        about this installation and your data.
      </p>
      <a href="/recordings" className="inline-block underline">
        Back to recordings
      </a>
    </main>
  );
}
