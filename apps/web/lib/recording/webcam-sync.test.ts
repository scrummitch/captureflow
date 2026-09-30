import { afterEach, describe, expect, it, vi } from "vitest";
import { syncWebcam } from "./webcam-sync";
class Video extends EventTarget {
  readyState = 0;
  paused = true;
  ended = false;
  seeking = false;
  currentTime = 0;
  playbackRate = 1;
  play = vi.fn(async () => {
    this.paused = false;
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
  emit(name: string) {
    this.dispatchEvent(new Event(name));
  }
}
function setup() {
  let tick = () => {};
  vi.stubGlobal("requestAnimationFrame", (fn: () => void) => {
    tick = fn;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const main = new Video(),
    cam = new Video();
  cam.readyState = 4;
  const cleanup = syncWebcam(
    main as unknown as HTMLVideoElement,
    cam as unknown as HTMLVideoElement,
  );
  return { main, cam, cleanup, tick: () => tick() };
}
afterEach(() => vi.unstubAllGlobals());
describe("camera audio follows playable screen video", () => {
  it("never starts audio when play is requested before the screen has buffered", () => {
    const s = setup();
    s.main.paused = false;
    s.main.emit("play");
    for (let i = 0; i < 120; i++) s.tick();
    expect(s.cam.play).not.toHaveBeenCalled();
    expect(s.cam.currentTime).toBe(0);
    s.cleanup();
  });
  it("pauses on buffering, never loops backwards, and resumes aligned", async () => {
    const s = setup();
    s.main.readyState = 4;
    s.main.paused = false;
    s.main.currentTime = 12;
    s.main.emit("playing");
    await Promise.resolve();
    expect(s.cam.play).toHaveBeenCalledTimes(1);
    expect(s.cam.currentTime).toBe(12);
    s.cam.currentTime = 12.1;
    s.main.emit("waiting");
    for (let i = 0; i < 120; i++) s.tick();
    expect(s.cam.paused).toBe(true);
    expect(s.cam.currentTime).toBe(12.1);
    expect(s.cam.play).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    s.main.currentTime = 15;
    s.main.emit("playing");
    expect(s.cam.currentTime).toBe(15);
    s.cleanup();
  });
  it("holds audio during seeking and cleans up events", () => {
    const s = setup();
    s.main.readyState = 4;
    s.main.paused = false;
    s.main.emit("playing");
    s.main.seeking = true;
    s.main.emit("seeking");
    s.tick();
    expect(s.cam.paused).toBe(true);
    s.cleanup();
    s.cam.play.mockClear();
    s.main.seeking = false;
    s.main.emit("playing");
    expect(s.cam.play).not.toHaveBeenCalled();
  });
});
