import { reserveStorage, releaseStorage } from "@/lib/storage-budget";
/// <reference types="@cloudflare/workers-types" />

import { R2_PUBLIC_BASE_URL } from "@/lib/site";
import { getCloudflareEnv } from "./cf-env";

async function getBucket(): Promise<R2Bucket> {
  const env = await getCloudflareEnv();
  if (!env?.BUCKET) {
    throw new Error(
      "R2 bucket binding (BUCKET) not available. Ensure OpenNext / Cloudflare runtime.",
    );
  }
  return env.BUCKET;
}

export function screenshotStorageKey(id: string): string {
  return `screenshots/${id}.png`;
}

export function screenshotSourceKey(id: string): string {
  return `screenshots/${id}.source.png`;
}

export function screenshotStateKey(id: string): string {
  return `screenshots/${id}.state.json`;
}

export async function putScreenshot(
  id: string,
  body: ArrayBuffer,
  // `no-cache` so editor PUT replaces are visible without an edge cache TTL.
  cacheControl = "no-cache",
): Promise<void> {
  const bucket = await getBucket();
  await reserveStorage(screenshotStorageKey(id), body.byteLength);
  await bucket.put(screenshotStorageKey(id), body, {
    httpMetadata: { contentType: "image/png", cacheControl },
  });
}

export async function getScreenshotBody(
  id: string,
): Promise<R2ObjectBody | null> {
  const bucket = await getBucket();
  const obj = await bucket.get(screenshotStorageKey(id));
  return obj ?? null;
}

export async function deleteScreenshot(id: string): Promise<void> {
  const bucket = await getBucket();
  // Delete all three artefacts so a re-uploaded id can't inherit a stale sidecar.
  await Promise.all([
    bucket.delete(screenshotStorageKey(id)),
    bucket.delete(screenshotSourceKey(id)),
    bucket.delete(screenshotStateKey(id)),
  ]);
  await Promise.all([
    releaseStorage(screenshotStorageKey(id)),
    releaseStorage(screenshotSourceKey(id)),
    releaseStorage(screenshotStateKey(id)),
  ]);
}

export async function putScreenshotSource(
  id: string,
  body: ArrayBuffer,
): Promise<void> {
  const bucket = await getBucket();
  await reserveStorage(screenshotSourceKey(id), body.byteLength);
  await bucket.put(screenshotSourceKey(id), body, {
    httpMetadata: { contentType: "image/png", cacheControl: "no-cache" },
  });
}

export async function putScreenshotState(
  id: string,
  body: ArrayBuffer,
): Promise<void> {
  const bucket = await getBucket();
  await reserveStorage(screenshotStateKey(id), body.byteLength);
  await bucket.put(screenshotStateKey(id), body, {
    httpMetadata: { contentType: "application/json", cacheControl: "no-cache" },
  });
}

export function publicScreenshotUrl(id: string, _r2BaseUrl?: string): string {
  return `/api/r/media/${screenshotStorageKey(id)}`;
}
export async function publicScreenshotUrlFor(id: string): Promise<string> {
  return publicScreenshotUrl(id);
}
