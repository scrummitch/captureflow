import Link from "next/link";
export default function SetupPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-semibold">Start recording</h1>
      <p className="mt-4 text-fg-muted">
        Use the recorder built for this private installation. Your recordings
        stay private until you choose to share them.
      </p>
      <h2 className="mt-8 text-xl font-semibold">Chrome or Edge extension</h2>
      <ol className="mt-4 list-decimal space-y-3 pl-5">
        <li>
          <a
            className="text-blue-500 underline"
            href="https://github.com/scrummitch/captureflow/releases/download/private-v1/captureflow-private-extension.zip"
          >
            Download the extension
          </a>{" "}
          and extract the ZIP.
        </li>
        <li>Open your browser’s Extensions page and turn on Developer mode.</li>
        <li>
          Choose <strong>Load unpacked</strong> and select the extracted folder.
        </li>
        <li>Open CaptureFlow Private from the toolbar and sign in here.</li>
      </ol>
      <p className="mt-6 text-sm text-fg-muted">
        The extension supports screen, window and tab recording. Choose what to
        capture when your browser prompts you.
      </p>
      <Link
        href="/recordings"
        className="mt-8 inline-block text-blue-500 underline"
      >
        Back to recordings
      </Link>
      <p className="mt-8 text-sm">
        <a href="https://github.com/scrummitch/captureflow">
          Source code and deployment instructions
        </a>
      </p>
    </main>
  );
}
