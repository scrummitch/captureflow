/** The camera carries microphone audio. Never play it against a stalled clock. */
export function syncWebcam(
  main: HTMLVideoElement,
  cam: HTMLVideoElement,
): () => void {
  let waiting = main.readyState < 3;
  let frame = 0;
  let disposed = false;
  let pendingPlay = false;
  const canRun = () =>
    !disposed &&
    !waiting &&
    !main.paused &&
    !main.ended &&
    !main.seeking &&
    main.readyState >= 3;
  const stop = () => {
    if (!cam.paused) cam.pause();
  };
  const align = () => {
    if (
      !cam.seeking &&
      cam.readyState >= 1 &&
      Math.abs(cam.currentTime - main.currentTime) > 0.25
    )
      cam.currentTime = main.currentTime;
  };
  const play = () => {
    if (!canRun() || !cam.paused || pendingPlay) return;
    pendingPlay = true;
    void cam
      .play()
      .catch(() => {})
      .finally(() => {
        pendingPlay = false;
        if (!canRun()) stop();
      });
  };
  const hold = () => {
    waiting = true;
    stop();
  };
  const resume = () => {
    waiting = false;
    if (canRun()) {
      align();
      play();
    }
  };
  const onPlay = () => {
    if (main.readyState >= 3 && !main.seeking) resume();
    else hold();
  };
  const tick = () => {
    if (!canRun()) stop();
    else {
      if (!cam.seeking) {
        const drift = cam.currentTime - main.currentTime;
        if (Math.abs(drift) > 0.25) {
          align();
          cam.playbackRate = main.playbackRate;
        } else
          cam.playbackRate =
            main.playbackRate +
            (Math.abs(drift) > 0.04 ? (drift < 0 ? 0.04 : -0.04) : 0);
      }
      play();
    }
    frame = requestAnimationFrame(tick);
  };
  const listeners: [string, () => void][] = [
    ["play", onPlay],
    ["playing", resume],
    ["waiting", hold],
    ["seeking", hold],
    ["pause", stop],
    ["ended", stop],
  ];
  for (const [name, fn] of listeners) main.addEventListener(name, fn);
  frame = requestAnimationFrame(tick);
  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    stop();
    for (const [name, fn] of listeners) main.removeEventListener(name, fn);
  };
}
