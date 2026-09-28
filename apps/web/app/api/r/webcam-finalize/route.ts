import { withStorageErrors } from "@/lib/storage-budget";
import { canMutateResource } from "@/lib/resource-access";
import { NextRequest, NextResponse } from "next/server";
import { getRecording, updateRecording } from "@/lib/recording/db";
import { isValidSlug } from "@/lib/recording/slug";
import {
  completeMultipartUpload,
  headObject,
  deleteObject,
} from "@/lib/recording/r2";
import { optionsResponse, withCors, jsonError } from "@/lib/recording/cors";
import { exceedsStorage } from "@/lib/recording/quota";
import type { FinalizeRequest } from "@/lib/recording/types";

const DEVICE_HEADER = "x-captureflow-device";

export function OPTIONS() {
  return optionsResponse();
}

async function handlePost(req: NextRequest) {
  const deviceId = req.headers.get(DEVICE_HEADER);
  if (!deviceId)
    return jsonError("Missing device header", 400, "invalid_device");

  let body: Partial<FinalizeRequest>;
  try {
    body = (await req.json()) as Partial<FinalizeRequest>;
  } catch {
    return jsonError("Invalid JSON", 400, "invalid_json");
  }

  if (!isValidSlug(body.slug)) {
    return jsonError("Invalid slug", 400, "invalid_slug");
  }
  if (
    !Array.isArray(body.parts) ||
    body.parts.length === 0 ||
    body.parts.length > 10000 ||
    new Set(body.parts.map((p) => p?.partNumber)).size !== body.parts.length
  ) {
    return jsonError("Missing parts", 400, "invalid_parts");
  }
  for (const p of body.parts) {
    if (
      !p ||
      !Number.isInteger(p.partNumber) ||
      p.partNumber < 1 ||
      p.partNumber > 10000 ||
      typeof p.etag !== "string" ||
      p.etag.length === 0
    ) {
      return jsonError("Malformed part entry", 400, "invalid_parts");
    }
  }
  const claimedSize = body.sizeBytes;
  if (
    typeof claimedSize !== "number" ||
    !Number.isFinite(claimedSize) ||
    claimedSize <= 0
  ) {
    return jsonError("Invalid size", 400, "invalid_size");
  }

  const row = await getRecording(body.slug);
  if (!row) return jsonError("Recording not found", 404, "not_found");
  if (!(await canMutateResource(req, row)))
    return jsonError("Forbidden", 403, "forbidden");
  // Idempotent: desktop retries finalize, so return ok (not 409) if already ready.
  if (row.webcamState === "ready") {
    return withCors(NextResponse.json({ ok: true }));
  }
  if (
    row.webcamState !== "pending" ||
    !row.webcamUploadId ||
    !row.webcamStorageKey
  ) {
    return jsonError("Webcam not finalizable", 409, "wrong_state");
  }

  // The companion stream draws on the same storage as the screen track.
  if (await exceedsStorage(deviceId, row, claimedSize)) {
    return jsonError("Storage cap reached", 413, "storage_limit");
  }

  await completeMultipartUpload(
    row.webcamStorageKey,
    row.webcamUploadId,
    body.parts,
  );

  const exists = await headObject(row.webcamStorageKey);
  if (!exists) {
    await updateRecording(row.slug, {
      webcamState: "failed",
      webcamUploadId: null,
    });
    return jsonError("Object missing after complete", 502, "object_missing");
  }

  const sizeBytes = exists.size;
  if (await exceedsStorage(deviceId, row, sizeBytes)) {
    await deleteObject(row.webcamStorageKey);
    await updateRecording(row.slug, {
      webcamState: "failed",
      webcamUploadId: null,
    });
    return jsonError("Storage cap reached", 413, "storage_limit");
  }

  await updateRecording(row.slug, {
    webcamState: "ready",
    webcamUploadId: null,
    webcamSizeBytes: sizeBytes,
  });

  return withCors(NextResponse.json({ ok: true }));
}

export const POST = withStorageErrors(handlePost);
