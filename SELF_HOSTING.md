# CaptureFlow Private

This fork runs on Cloudflare Workers, D1 and a **private** R2 bucket. It retains CaptureFlow's upstream attribution and AGPL license. Corresponding source: https://github.com/scrummitch/captureflow.

## This installation

- App: https://captureflow-private.flindev.workers.dev
- Worker: `captureflow-private` in the Flindev account
- Database: `captureflow-private`
- Bucket: `captureflow-private-media`; no public domain or r2.dev access
- Extension ID: `filbcachaagapdgnponemllihgldgffp`
- Registration is disabled; accounts are provisioned by the operator.
- New media is private until explicitly shared. Public share links remain supported.
- Installation storage ceiling: 10 GiB, including multipart reservations and screenshot originals.
- Daily deletion of completed recordings is disabled. Incomplete multipart uploads expire after one day; hourly cleanup marks abandoned records failed.
- No default upstream PostHog telemetry. No hosted subscription is required.

The storage ceiling is a byte limit, not a Cloudflare spending cap. Storage operations, Worker requests, and other provider usage can still incur charges. Existing Cloudflare subscriptions do not necessarily include all usage.

## Recorder

Download `captureflow-private-extension.zip` from this fork's `private-v1` release. Extract it, open Chrome/Edge's Extensions page, enable Developer mode, and use **Load unpacked**. Select the folder containing `manifest.json`. Open CaptureFlow Private, sign in to this installation, and choose what to record. The public manifest key pins the extension ID; it is not a secret.

The upstream Web Store extension points to upstream infrastructure and is not the recorder for this fork. The web app's Record buttons lead to `/setup` when the fork extension is absent.

Desktop source is also patched. A distributable macOS release requires building, signing, and notarizing with the operator's Apple Developer ID. The original maintainer's signature cannot be reused. The desktop backend defaults point to this installation. Its update repository points to this fork.

## Build and deploy

Use Node 24 and the pinned pnpm version. Review the Wrangler account/bindings before deploying another instance. Create separate D1 and R2 resources for each instance; never reuse an upstream database or public bucket.

```sh
pnpm install --frozen-lockfile
pnpm --filter @captureflow/web test
pnpm --filter @captureflow/web typecheck
pnpm --filter @captureflow/desktop typecheck
pnpm --filter @captureflow/extension build
pnpm --filter @captureflow/web cf:typegen
pnpm --filter @captureflow/web cf:build
pnpm --filter @captureflow/web exec wrangler deploy --dry-run
pnpm --filter @captureflow/web exec wrangler deploy
```

Copy the non-secret variables in `apps/web/.env.example` into `.env.production` for production builds. Wrangler variables are runtime bindings; Next's public variables must also be present at build time. Secrets belong in Wrangler secrets, never Git. Keep `BETTER_AUTH_SECRET` stable across releases; rotating it invalidates sessions.

Before first deployment, apply the D1 migrations and set a random `BETTER_AUTH_SECRET`. A temporary `BOOTSTRAP_SECRET` plus `ALLOW_REGISTRATION=true` allows operator-controlled account provisioning through `/api/auth/sign-up/email` with the `x-bootstrap-secret` header. Both the bootstrap header gate and the authentication creation hook fail closed. Delete the bootstrap secret and deploy `ALLOW_REGISTRATION=false` immediately after provisioning. Do not enable social providers to work around closed registration.

The source includes no owner password. Provisioned owner credentials are delivered separately. Additional accounts need operator provisioning and verified identity before accepting workspace invitations.

## Security changes

- **F1:** private R2 objects are served only by an authorization-aware media route. Originals/edit state are owner-only, even when the exported screenshot is public. Unknown sidecars are not served. Range requests are validated and all media responses are non-cacheable.
- **F2–F3:** downloads, summaries, comments, reactions and state probes enforce resource access independently of share pages. Comment/reaction writes require access and same-origin requests.
- **F4:** recording mutations and upload parts require a valid bearer/session identity and owner authorization. Device IDs are no longer credentials. Desktop/extension clients send bearer headers on byte uploads. Workspace no-public-links policy is enforced on subsequent visibility changes too.
- **F5:** web analytics are disabled; there is no default external identity or URL collection.
- **F6:** every R2 byte-writing helper reserves actual bytes atomically in D1. Finalized video size comes from R2 metadata, request bodies are bounded, and screenshot originals/state count toward the installation ceiling. Failed writes conservatively retain reservations. A reservation is released only after corresponding object deletion; aborted uploads can retain conservative reservations pending operator reconciliation. Account-level usage display can therefore be lower than the installation reservation total.
- **F7:** desktop credentials use Electron safeStorage with restrictive file permissions and no plaintext fallback. Legacy plaintext files are discarded. Server tokens expire after 30 days, and explicit sign-out revokes the server token.
- **F8:** authentication/framework/runtime dependencies are updated, with implicit account linking disabled. Audit overrides retain compatible major versions where patched releases are available.
- **F9:** desktop login uses a five-minute, single-use authorization code bound to an app-generated state and PKCE challenge. Durable credentials are never passed in desktop callback URLs.

## Validation and limits

Regression tests cover the original bypasses and valid owner/member/public behavior, original screenshot access, range parsing, actual-size quota checks, concurrent D1 reservations, token expiry/revocation, encrypted credential persistence and desktop login state/code replay.

Local and deployed API checks use synthetic media. They do not prove OS screen/microphone permission behavior or replace an independent penetration test. The native capture engine was not comprehensively audited. Dependency audits are point-in-time reports and should be repeated for later releases.
