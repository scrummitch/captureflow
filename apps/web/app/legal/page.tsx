import type { Metadata } from "next";
import { MARKETING_SITE_URL, SOURCE_REPO_URL } from "@/lib/site";

export const metadata: Metadata = { title: "Source & licenses" };

export default function LegalPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-16 text-fg">
      <a href={MARKETING_SITE_URL} className="text-xl font-semibold">
        Flindev
      </a>
      <h1 className="text-3xl font-semibold">Source & licenses</h1>
      <p>This installation is operated and modified by Flindev.</p>
      <p>
        <a
          href="https://github.com/sardorml/captureflow"
          data-cf-attribution="captureflow"
          className="underline"
        >
          Powered by CaptureFlow
        </a>
        , an open-source project by its original contributors. This fork is
        distributed under AGPL-3.0-only; the capture engine is MIT licensed. The
        software comes without warranty.
      </p>
      <ul className="list-inside list-disc space-y-3">
        <li>
          <a className="underline" href={SOURCE_REPO_URL}>
            Source code for this installation
          </a>
        </li>
        <li>
          <a
            className="underline"
            href={`${SOURCE_REPO_URL}/blob/main/LICENSE`}
          >
            License and redistribution terms
          </a>
        </li>
      </ul>
      <a className="inline-block underline" href="/recordings">
        Back to recordings
      </a>
    </main>
  );
}
