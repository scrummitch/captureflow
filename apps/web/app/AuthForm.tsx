"use client";
import { useState, type FormEvent } from "react";
import { signIn } from "@/lib/auth-client";
import type { InviteContext } from "@/lib/invite-context";
export function AuthForm({
  next,
}: {
  next: string;
  initialMode?: "signin" | "signup";
  invite?: InviteContext | null;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await signIn.email({
        email: String(form.get("email")),
        password: String(form.get("password")),
      });
      if (result.error) {
        setError("Could not sign in. Check your email and password.");
        setBusy(false);
      } else
        window.location.assign(
          next.startsWith("/") && !next.startsWith("//") ? next : "/recordings",
        );
    } catch {
      setError("Could not connect. Please try again.");
      setBusy(false);
    }
  }
  return (
    <section className="w-full max-w-sm">
      <h1 className="text-2xl font-semibold">Sign in to Flindev</h1>
      <p className="mt-2 mb-6 text-sm text-fg-muted">
        Sign in to record, manage and share your videos.
      </p>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="text-sm">
          Email
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-1 block w-full rounded-lg border border-line bg-canvas p-3"
          />
        </label>
        <label className="text-sm">
          Password
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="mt-1 block w-full rounded-lg border border-line bg-canvas p-3"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <button
          disabled={busy}
          className="rounded-lg bg-blue-600 px-4 py-3 font-medium text-white disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="mt-5 text-xs text-fg-muted">
        Private installation. Accounts are managed by the owner.
      </p>
    </section>
  );
}
