import { afterEach, describe, expect, it, vi } from "vitest";
import { syncWebcam } from "./webcam-sync";
class Video extends EventTarget {
  readyState = 0;
  paused = true;
  ended = false;
  seeking = false;
  currentTime = 0;
  playbackRate = 1;
  duration = Infinity;
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
  const onBuffering = vi.fn();
  const sync = syncWebcam(
    main as unknown as HTMLVideoElement,
    cam as unknown as HTMLVideoElement,
    onBuffering,
  );
  return {
    main,
    cam,
    cleanup: sync.dispose,
    onBuffering,
    pause: sync.pause,
    tick: () => tick(),
  };
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
    s.main.emit("play");
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
    s.main.emit("play");
    s.main.emit("playing");
    expect(s.cam.currentTime).toBe(15);
    s.cleanup();
  });
  it("holds audio during seeking and cleans up events", () => {
    const s = setup();
    s.main.readyState = 4;
    s.main.paused = false;
    s.main.emit("play");
    s.main.emit("playing");
    s.main.seeking = true;
    s.main.emit("seeking");
    s.tick();
    expect(s.cam.paused).toBe(true);
    s.cleanup();
    s.cam.play.mockClear();
    s.main.seeking = false;
    s.main.emit("play");
    s.main.emit("playing");
    expect(s.cam.play).not.toHaveBeenCalled();
  });
});

describe("seeking both video tracks", () => {
  it("resumes on seeked/canplay without requiring another playing event", async () => {
    const s = setup();
    s.main.readyState = 4;
    s.main.paused = false;
    s.main.emit("play");
    await new Promise((resolve) => setTimeout(resolve, 0));
    s.main.currentTime = 120;
    s.main.seeking = true;
    s.cam.readyState = 1;
    s.main.emit("seeking");
    s.main.emit("pause"); // queued native event from the internal hold
    expect(s.main.paused).toBe(true);
    expect(s.cam.paused).toBe(true);
    expect(s.cam.currentTime).toBe(120);
    s.main.seeking = false;
    s.main.emit("seeked");
    for (let n = 0; n < 60; n++) s.tick();
    expect(s.main.play).not.toHaveBeenCalled();
    expect(s.cam.currentTime).toBe(120);
    s.cam.readyState = 4;
    s.cam.emit("canplay");
    expect(s.main.paused).toBe(false);
    expect(s.cam.paused).toBe(false);
    expect(s.onBuffering).toHaveBeenLastCalledWith(false);
    s.cleanup();
  });
  it("lets pause cancel an automatic resume while the camera buffers", () => {
    const s = setup();
    s.main.readyState = 4;
    s.main.paused = false;
    s.main.emit("play");
    s.cam.readyState = 1;
    s.cam.emit("waiting");
    expect(s.main.paused).toBe(true);
    s.pause();
    s.cam.readyState = 4;
    s.cam.emit("canplay");
    s.tick();
    expect(s.main.paused).toBe(true);
    expect(s.cam.paused).toBe(true);
    s.cleanup();
  });
  it("updates the camera frame after a paused seek without playing audio", () => {
    const s = setup();
    s.main.currentTime = 42;
    s.main.seeking = true;
    s.main.emit("seeking");
    expect(s.cam.currentTime).toBe(42);
    s.main.seeking = false;
    s.main.readyState = 4;
    s.main.emit("seeked");
    s.cam.emit("canplay");
    expect(s.main.play).not.toHaveBeenCalled();
    expect(s.cam.play).not.toHaveBeenCalled();
    s.cleanup();
  });
  it("replaces an unfinished camera seek when the user jumps again", () => {
    const s = setup();
    s.main.currentTime = 300;
    s.main.emit("seeking");
    s.cam.seeking = true;
    s.cam.readyState = 1;
    s.main.currentTime = 80;
    s.main.emit("seeking");
    expect(s.cam.currentTime).toBe(80);
    s.cleanup();
  });
  it("does not freeze the screen after a shorter companion has ended", () => {
    const s = setup();
    s.main.readyState = 4;
    s.main.currentTime = 11;
    s.main.paused = false;
    s.cam.duration = 10;
    s.cam.currentTime = 10;
    s.cam.ended = true;
    s.cam.readyState = 2;
    s.main.emit("play");
    s.tick();
    expect(s.main.paused).toBe(false);
    expect(s.cam.paused).toBe(true);
    s.cleanup();
  });
});
