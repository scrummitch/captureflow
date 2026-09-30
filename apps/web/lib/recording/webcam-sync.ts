/** Keep the screen and microphone/camera on one clock, including unbuffered seeks. */
export function syncWebcam(
  main: HTMLVideoElement,
  cam: HTMLVideoElement,
  onBuffering: (buffering: boolean) => void = () => {},
): { dispose: () => void; pause: () => void } {
  let wantsPlay = !main.paused;
  let mainWaiting = main.readyState < 3;
  let heldMain = false;
  let mainPlayPending = false;
  let camPlayPending = false;
  let disposed = false;
  let frame = 0;
  let buffering = false;

  const report = (value: boolean) => {
    if (buffering === value) return;
    buffering = value;
    onBuffering(value);
  };
  const stopCam = () => {
    if (!cam.paused) cam.pause();
  };
  const holdMain = () => {
    if (!main.paused) {
      heldMain = true;
      main.pause();
    }
    stopCam();
    report(wantsPlay);
  };
  // A companion can finish slightly before the screen track.
  const cameraFinished = () =>
    Number.isFinite(cam.duration) &&
    cam.duration > 0 &&
    main.currentTime >= cam.duration;
  const cameraTarget = () =>
    Number.isFinite(cam.duration) && cam.duration > 0
      ? Math.min(main.currentTime, cam.duration)
      : main.currentTime;
  const align = (replaceSeek = false) => {
    if (cam.readyState < 1 || (cam.seeking && !replaceSeek)) return;
    if (Math.abs(cam.currentTime - cameraTarget()) > 0.25) {
      // Freeze the target while the camera seeks. Chasing an advancing main
      // clock can repeatedly flush the camera decoder before it shows a frame.
      if (wantsPlay && !cameraFinished()) holdMain();
      cam.currentTime = cameraTarget();
    }
  };
  const reconcile = () => {
    if (disposed) return;
    if (!wantsPlay || main.ended) {
      stopCam();
      report(false);
      return;
    }
    if (mainWaiting || main.seeking || main.readyState < 3) {
      stopCam();
      return;
    }
    align();
    const finished = cameraFinished();
    if (!finished && (cam.seeking || cam.readyState < 3)) {
      holdMain();
      return;
    }
    report(false);
    if (main.paused && heldMain && !mainPlayPending) {
      mainPlayPending = true;
      void main
        .play()
        .catch(() => {
          wantsPlay = false;
          stopCam();
          report(false);
        })
        .finally(() => {
          mainPlayPending = false;
        });
    }
    if (main.paused) return;
    if (finished) {
      stopCam();
      return;
    }
    const drift = cam.currentTime - main.currentTime;
    cam.playbackRate =
      main.playbackRate +
      (Math.abs(drift) > 0.04 ? (drift < 0 ? 0.04 : -0.04) : 0);
    if (cam.paused && !camPlayPending) {
      camPlayPending = true;
      void cam
        .play()
        .catch(() => {})
        .finally(() => {
          camPlayPending = false;
          if (disposed || !wantsPlay || main.paused || mainWaiting) stopCam();
        });
    }
  };
  const onPlay = () => {
    heldMain = false;
    wantsPlay = true;
    mainWaiting = main.readyState < 3 || main.seeking;
    reconcile();
  };
  const onPause = () => {
    if (!main.paused) return;
    // Native pause events are queued, so keep this flag until the next play.
    if (!heldMain) wantsPlay = false;
    stopCam();
    if (!wantsPlay) report(false);
  };
  const onMainReady = () => {
    mainWaiting = main.readyState < 3 || main.seeking;
    reconcile();
  };
  const onMainWaiting = () => {
    mainWaiting = true;
    stopCam();
  };
  const onSeek = () => {
    mainWaiting = true;
    stopCam();
    // A new user seek supersedes an unfinished camera seek, even when paused.
    align(true);
  };
  const onCameraReady = () => {
    align();
    reconcile();
  };
  const onCameraWaiting = () => {
    if (wantsPlay && !cameraFinished()) holdMain();
  };
  const onEnded = () => {
    wantsPlay = false;
    heldMain = false;
    stopCam();
    report(false);
  };
  const mainListeners: [string, () => void][] = [
    ["play", onPlay],
    ["playing", onMainReady],
    ["canplay", onMainReady],
    ["seeked", onMainReady],
    ["waiting", onMainWaiting],
    ["seeking", onSeek],
    ["pause", onPause],
    ["ended", onEnded],
  ];
  const camListeners: [string, () => void][] = [
    ["loadedmetadata", onCameraReady],
    ["canplay", onCameraReady],
    ["seeked", onCameraReady],
    ["waiting", onCameraWaiting],
  ];
  for (const [event, fn] of mainListeners) main.addEventListener(event, fn);
  for (const [event, fn] of camListeners) cam.addEventListener(event, fn);
  const tick = () => {
    reconcile();
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  const dispose = () => {
    disposed = true;
    cancelAnimationFrame(frame);
    stopCam();
    for (const [event, fn] of mainListeners)
      main.removeEventListener(event, fn);
    for (const [event, fn] of camListeners) cam.removeEventListener(event, fn);
  };
  return {
    dispose,
    pause: () => {
      wantsPlay = false;
      heldMain = false;
      main.pause();
      stopCam();
      report(false);
    },
  };
}
