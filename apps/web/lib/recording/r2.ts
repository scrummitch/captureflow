import { reserveStorage, releaseStorage } from "@/lib/storage-budget";
/// <reference types="@cloudflare/workers-types" />

import { R2_PUBLIC_BASE_URL } from "@/lib/site";
import { getCloudflareEnv } from "./cf-env";

async function getBucket(): Promise<R2Bucket> {
  const env = await getCloudflareEnv();
  if (!env?.BUCKET) {
    throw new Error(
      "R2 bucket binding (BUCKET) not available. " +
        "Ensure you are running under OpenNext / Cloudflare runtime.",
    );
  }
  return env.BUCKET;
}

export type R2MultipartHandle = {
  uploadId: string;
  storageKey: string;
};

export type R2UploadedPart = {
  partNumber: number;
  etag: string;
};

export async function createMultipartUpload(
  storageKey: string,
  contentType: string,
  // Pass a short TTL for objects we expect to rotate; without it the CDN caches at R2's long default.
  cacheControl?: string,
): Promise<R2MultipartHandle> {
  const bucket = await getBucket();
  const upload = await bucket.createMultipartUpload(storageKey, {
    httpMetadata: cacheControl
      ? { contentType, cacheControl }
      : { contentType },
  });
  return { uploadId: upload.uploadId, storageKey };
}

export async function uploadPart(
  storageKey: string,
  uploadId: string,
  partNumber: number,
  body: ArrayBuffer | ReadableStream | string,
): Promise<R2UploadedPart> {
  const bucket = await getBucket();
  const upload = bucket.resumeMultipartUpload(storageKey, uploadId);
  if (!(body instanceof ArrayBuffer))
    throw new Error("Upload body must be bounded");
  await reserveStorage(
    `${storageKey}#${uploadId}/${partNumber}`,
    body.byteLength,
  );
  const result = await upload.uploadPart(partNumber, body);
  return { partNumber, etag: result.etag };
}

export async function completeMultipartUpload(
  storageKey: string,
  uploadId: string,
  parts: R2UploadedPart[],
): Promise<void> {
  const bucket = await getBucket();
  const upload = bucket.resumeMultipartUpload(storageKey, uploadId);
  await upload.complete(parts);
}

export async function abortMultipartUpload(
  storageKey: string,
  uploadId: string,
): Promise<void> {
  const bucket = await getBucket();
  const upload = bucket.resumeMultipartUpload(storageKey, uploadId);
  await upload.abort();
}

export async function deleteObject(storageKey: string): Promise<void> {
  const bucket = await getBucket();
  await bucket.delete(storageKey);
  await releaseStorage(storageKey);
}

export async function putObject(
  storageKey: string,
  body: ArrayBuffer,
  contentType: string,
  cacheControl?: string,
): Promise<void> {
  const bucket = await getBucket();
  await reserveStorage(storageKey, body.byteLength);
  await bucket.put(storageKey, body, {
    httpMetadata: cacheControl
      ? { contentType, cacheControl }
      : { contentType },
  });
}

export async function headObject(storageKey: string): Promise<R2Object | null> {
  const bucket = await getBucket();
  const head = await bucket.head(storageKey);
  return head;
}

export async function putObjectJson<T>(
  storageKey: string,
  value: T,
): Promise<void> {
  const bucket = await getBucket();
  const serialized = JSON.stringify(value);
  await reserveStorage(
    storageKey,
    new TextEncoder().encode(serialized).byteLength,
  );
  await bucket.put(storageKey, serialized, {
    httpMetadata: {
      contentType: "application/json; charset=utf-8",
      cacheControl: "no-store",
    },
  });
}

export async function getObjectJson<T>(storageKey: string): Promise<T | null> {
  const bucket = await getBucket();
  const obj = await bucket.get(storageKey);
  if (!obj) return null;
  try {
    const text = await obj.text();
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function publicUrlFor(storageKey: string): Promise<string> {
  return `/api/r/media/${storageKey.split("/").map(encodeURIComponent).join("/")}`;
}
