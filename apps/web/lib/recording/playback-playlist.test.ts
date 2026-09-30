import { describe, it, expect, vi } from "vitest";
import { createPlaybackPlaylist } from "./playback-playlist";
function u32(n: number) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
}
function box(name: string, ...parts: Uint8Array[]) {
  const data = Buffer.concat(parts);
  return Buffer.concat([u32(data.length + 8), Buffer.from(name), data]);
}
function fixture(version = 1) {
  const tkhd = Buffer.alloc(24);
  tkhd.writeUInt32BE(1, 12);
  const mdhd = Buffer.alloc(24);
  mdhd.writeUInt32BE(1000, 12);
  const hdlr = Buffer.alloc(20);
  hdlr.write("vide", 8);
  const head = Buffer.concat([
    box("ftyp", Buffer.from("isom")),
    box(
      "moov",
      box(
        "trak",
        box("tkhd", tkhd),
        box("mdia", box("mdhd", mdhd), box("hdlr", hdlr)),
      ),
    ),
  ]);
  const fragment = box("moof", Buffer.alloc(16));
  const mdat = box("mdat", Buffer.alloc(1024));
  const media = Buffer.concat([fragment, mdat]);
  const entries = Array.from({ length: 5 }, (_, i) => {
    const b = Buffer.alloc(version ? 19 : 11);
    if (version) {
      b.writeBigUInt64BE(BigInt(i * 2000));
      b.writeBigUInt64BE(BigInt(head.length + i * media.length), 8);
    } else {
      b.writeUInt32BE(i * 2000);
      b.writeUInt32BE(head.length + i * media.length, 4);
    }
    b.fill(1, version ? 16 : 8);
    return b;
  });
  const tfra = box(
    "tfra",
    Buffer.from([version, 0, 0, 0]),
    u32(1),
    u32(0),
    u32(entries.length),
    ...entries,
  );
  const mfra = box(
    "mfra",
    tfra,
    box("mfro", u32(0), u32(8 + tfra.length + 16)),
  );
  const file = Buffer.concat([head, ...Array(5).fill(media), mfra]);
  return { file, head, media, mfra };
}
describe("indexed recording streaming", () => {
  for (const version of [0, 1])
    it(`builds exact independent byte ranges for tfra v${version}`, async () => {
      const { file, head, media, mfra } = fixture(version);
      const read = vi.fn(async (o: number, n: number) =>
        file.subarray(o, o + n),
      );
      const result = await createPlaybackPlaylist({
        size: file.length,
        durationSeconds: 10,
        mediaUrl: "/api/r/media/videos/test.mp4",
        read,
      });
      expect(result).toContain(
        `#EXT-X-MAP:URI="/api/r/media/videos/test.mp4",BYTERANGE="${head.length}@0"`,
      );
      expect(result).toContain(
        `#EXTINF:6.000000,\n#EXT-X-BYTERANGE:${media.length * 3}@${head.length}`,
      );
      expect(result).toContain(
        `#EXTINF:4.000000,\n#EXT-X-BYTERANGE:${media.length * 2}@${head.length + media.length * 3}`,
      );
      expect(result).toContain("#EXT-X-ENDLIST");
      expect(read).toHaveBeenCalledTimes(2);
      expect(head.length + media.length * 5).toBe(file.length - mfra.length);
    });
  it("rejects missing or oversized indexes without reading a whole recording", async () => {
    const { file } = fixture();
    file.writeUInt32BE(2 * 1024 * 1024, file.length - 4);
    const read = vi.fn(async (o: number, n: number) => file.subarray(o, o + n));
    await expect(
      createPlaybackPlaylist({
        size: file.length,
        durationSeconds: 10,
        mediaUrl: "/media",
        read,
      }),
    ).rejects.toThrow("index size");
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("rejects indexes pointing outside media", async () => {
    const { file } = fixture();
    const p = file.indexOf("tfra");
    file.writeBigUInt64BE(BigInt(file.length + 100), p + 28);
    await expect(
      createPlaybackPlaylist({
        size: file.length,
        durationSeconds: 10,
        mediaUrl: "/media",
        read: async (o, n) => file.subarray(o, o + n),
      }),
    ).rejects.toThrow("fragment position");
  });
  it("rejects manifest URL injection", async () => {
    await expect(
      createPlaybackPlaylist({
        size: 100,
        durationSeconds: 10,
        mediaUrl: "/media\nhttps://evil.test",
        read: vi.fn(),
      }),
    ).rejects.toThrow("inputs");
  });
});
