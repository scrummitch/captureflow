import { canMutateResource } from "@/lib/resource-access";
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { deleteRecording, getRecording } from "@/lib/recording/db";
import { isValidSlug } from "@/lib/recording/slug";
import { abortMultipartUpload, deleteObject } from "@/lib/recording/r2";
import { verifySessionOrNull } from "@/lib/recording/verify-session";
import { optionsResponse, withCors, jsonError } from "@/lib/recording/cors";

const DEVICE_HEADER = "x-captureflow-device";

export function OPTIONS() {
  return optionsResponse();
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!isValidSlug(id)) {
    return jsonError("Invalid slug", 400, "invalid_slug");
  }

  const row = await getRecording(id);
  if (!row) return withCors(NextResponse.json({ ok: true }));

  const authorized = await canMutateResource(req, row);
  if (!authorized) return jsonError("Forbidden", 403, "forbidden");

  if (row.uploadId) {
    await abortMultipartUpload(row.storageKey, row.uploadId);
  }
  if (row.webcamUploadId && row.webcamStorageKey) {
    try {
      await abortMultipartUpload(row.webcamStorageKey, row.webcamUploadId);
    } catch (err) {
      console.warn(`[delete] webcam abort failed for ${id}:`, err);
    }
  }
  await deleteObject(row.storageKey);
  if (row.posterKey) await deleteObject(row.posterKey);
  if (row.webcamStorageKey) {
    try {
      await deleteObject(row.webcamStorageKey);
    } catch (err) {
      console.warn(`[delete] webcam r2 delete failed for ${id}:`, err);
    }
  }
  await deleteRecording(id);

  return withCors(NextResponse.json({ ok: true }));
}
