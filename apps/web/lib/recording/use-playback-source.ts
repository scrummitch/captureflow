"use client";
import { useEffect, useState, type RefObject } from "react";

export function usePlaybackSource(
  videoRef: RefObject<HTMLVideoElement | null>,
  videoUrl: string,
) {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let disposed = false;
    let hls: import("hls.js").default | undefined;
    let fallbackUsed = false;
    setError(null);
    const direct = () => {
      if (disposed || fallbackUsed) return;
      fallbackUsed = true;
      hls?.destroy();
      hls = undefined;
      video.src = videoUrl;
    };
    const fail = () =>
      setError("This recording could not be loaded. Refresh to retry.");
    video.addEventListener("error", fail);
    const start = async () => {
      const url = new URL(videoUrl, window.location.href);
      if (
        url.origin !== window.location.origin ||
        !url.pathname.startsWith("/api/r/media/") ||
        !url.pathname.endsWith(".mp4")
      ) {
        direct();
        return;
      }
      url.searchParams.set("playlist", "1");
      try {
        const { default: Hls } = await import("hls.js");
        if (disposed) return;
        if (Hls.isSupported()) {
          hls = new Hls({
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
            backBufferLength: 30,
            maxBufferSize: 30 * 1024 * 1024,
          });
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (!data.fatal) return;
            // Normal (non-fragmented) MP4 uploads have no HLS index.
            if (
              data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR &&
              data.response?.code === 415
            )
              direct();
            else {
              setError("Playback was interrupted. Refresh to retry.");
              hls?.stopLoad();
            }
          });
          hls.loadSource(url.toString());
          hls.attachMedia(video);
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          const response = await fetch(url, { method: "GET" });
          if (disposed) return;
          if (response.ok) video.src = url.toString();
          else if (response.status === 415) direct();
          else fail();
        } else direct();
      } catch {
        direct();
      }
    };
    void start();
    return () => {
      disposed = true;
      hls?.destroy();
      video.removeEventListener("error", fail);
      video.removeAttribute("src");
      video.load();
    };
  }, [videoUrl, videoRef]);
  return error;
}
