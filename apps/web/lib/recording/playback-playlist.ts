/** Build a byte-range HLS playlist from mp4-muxer's existing random-access index.
 * Only the bounded opening metadata and tail index are read, never the video body.
 */
type Box = { type: string; start: number; end: number; data: number };
const MAX_METADATA = 1024 * 1024;
const text = (b: Uint8Array, p: number, n = 4) =>
  String.fromCharCode(...b.subarray(p, p + n));
const view = (b: Uint8Array) =>
  new DataView(b.buffer, b.byteOffset, b.byteLength);
function boxes(b: Uint8Array, start = 0, end = b.length): Box[] {
  const result: Box[] = [];
  const v = view(b);
  for (let p = start; p + 8 <= end; ) {
    const size = v.getUint32(p);
    if (size < 8 || p + size > end) break;
    result.push({ type: text(b, p + 4), start: p, data: p + 8, end: p + size });
    p += size;
  }
  return result;
}
function child(b: Uint8Array, parent: Box, type: string): Box {
  const found = boxes(b, parent.data, parent.end).find((x) => x.type === type);
  if (!found) throw new Error(`Missing MP4 ${type}`);
  return found;
}
function videoTrack(b: Uint8Array): { id: number; timescale: number } {
  const moov = boxes(b).find((x) => x.type === "moov");
  if (!moov) throw new Error("Unsupported MP4 header");
  for (const trak of boxes(b, moov.data, moov.end).filter(
    (x) => x.type === "trak",
  )) {
    const mdia = child(b, trak, "mdia");
    if (text(b, child(b, mdia, "hdlr").data + 8) !== "vide") continue;
    const tkhd = child(b, trak, "tkhd");
    const mdhd = child(b, mdia, "mdhd");
    const v = view(b);
    const id = v.getUint32(tkhd.data + (b[tkhd.data] === 1 ? 20 : 12));
    const timescale = v.getUint32(mdhd.data + (b[mdhd.data] === 1 ? 20 : 12));
    if (!timescale) throw new Error("Invalid MP4 timescale");
    return { id, timescale };
  }
  throw new Error("No video track");
}
export async function createPlaybackPlaylist(options: {
  size: number;
  durationSeconds: number;
  mediaUrl: string;
  read: (offset: number, length: number) => Promise<Uint8Array>;
}): Promise<string> {
  const { size, durationSeconds, mediaUrl, read } = options;
  if (
    !Number.isSafeInteger(size) ||
    size < 32 ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    /[\r\n"\\]/.test(mediaUrl)
  )
    throw new Error("Invalid playlist inputs");
  const tailSize = Math.min(size, 65536);
  const [head, tail] = await Promise.all([
    read(0, Math.min(size, 65536)),
    read(size - tailSize, tailSize),
  ]);
  if (tail.length !== tailSize || text(tail, tail.length - 12) !== "mfro")
    throw new Error("MP4 has no fragment index");
  const indexSize = view(tail).getUint32(tail.length - 4);
  if (indexSize < 24 || indexSize > MAX_METADATA || indexSize >= size)
    throw new Error("Invalid MP4 index size");
  const index =
    indexSize <= tail.length
      ? tail.subarray(tail.length - indexSize)
      : await read(size - indexSize, indexSize);
  const root = boxes(index)[0];
  if (!root || root.type !== "mfra" || root.end !== indexSize)
    throw new Error("Invalid MP4 index");
  const track = videoTrack(head);
  const v = view(index);
  const tfra = boxes(index, root.data, root.end).find(
    (x) => x.type === "tfra" && v.getUint32(x.data + 4) === track.id,
  );
  if (!tfra) throw new Error("No video fragment index");
  const version = index[tfra.data];
  if (version > 1) throw new Error("Unsupported index version");
  const lengths = v.getUint32(tfra.data + 8);
  const skip = ((lengths >> 4) & 3) + ((lengths >> 2) & 3) + (lengths & 3) + 3;
  const count = v.getUint32(tfra.data + 12);
  const stride = (version === 1 ? 16 : 8) + skip;
  if (!count || count > 50000 || tfra.data + 16 + count * stride !== tfra.end)
    throw new Error("Invalid fragment count");
  const entries: { time: number; offset: number }[] = [];
  let previousTime = -1,
    previousOffset = -1;
  for (let p = tfra.data + 16; p < tfra.end; p += stride) {
    const time =
      (version === 1 ? Number(v.getBigUint64(p)) : v.getUint32(p)) /
      track.timescale;
    const offset =
      version === 1 ? Number(v.getBigUint64(p + 8)) : v.getUint32(p + 4);
    if (
      !Number.isSafeInteger(offset) ||
      offset <= previousOffset ||
      offset >= size - indexSize ||
      time <= previousTime ||
      time >= durationSeconds
    )
      throw new Error("Invalid fragment position");
    previousTime = time;
    previousOffset = offset;
    // Group adjacent fragments into ~6-second requests, reducing R2 round trips.
    if (!entries.length || time - entries[entries.length - 1].time >= 6)
      entries.push({ time, offset });
  }
  if (
    entries[0].time !== 0 ||
    entries[0].offset > head.length ||
    text(head, entries[0].offset + 4) !== "moof"
  )
    throw new Error("Invalid initialization segment");
  const segments = entries.map((e, i) => ({
    ...e,
    duration: (entries[i + 1]?.time ?? durationSeconds) - e.time,
    length: (entries[i + 1]?.offset ?? size - indexSize) - e.offset,
  }));
  return [
    "#EXTM3U",
    "#EXT-X-VERSION:7",
    "#EXT-X-PLAYLIST-TYPE:VOD",
    `#EXT-X-TARGETDURATION:${Math.ceil(Math.max(...segments.map((s) => s.duration)))}`,
    "#EXT-X-MEDIA-SEQUENCE:0",
    "#EXT-X-INDEPENDENT-SEGMENTS",
    `#EXT-X-MAP:URI="${mediaUrl}",BYTERANGE="${entries[0].offset}@0"`,
    ...segments.flatMap((s) => [
      `#EXTINF:${s.duration.toFixed(6)},`,
      `#EXT-X-BYTERANGE:${s.length}@${s.offset}`,
      mediaUrl,
    ]),
    "#EXT-X-ENDLIST",
    "",
  ].join("\n");
}
