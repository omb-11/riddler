import { useEffect, useState } from "react";
import { api } from "../services/api";

interface Options {
  enabled: boolean;
  pauseOnHidden: boolean;
}

export function useFullscreenGuard({ enabled, pauseOnHidden }: Options) {
  const [interrupted, setInterrupted] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    const hasSupport = Boolean(document.documentElement.requestFullscreen);
    setSupported(hasSupport);

    if (enabled && hasSupport && !document.fullscreenElement) {
      setInterrupted(true);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const onFullscreenChange = () => {
      const active = Boolean(document.fullscreenElement);
      setInterrupted(!active);
      void api.logEvent(active ? "FULLSCREEN_ENTERED" : "FULLSCREEN_EXITED", {
        source: "fullscreenchange"
      });
    };

    const onVisibilityChange = () => {
      const hidden = document.hidden;

      if (hidden && pauseOnHidden) {
        setInterrupted(true);
      }

      void api.logEvent(hidden ? "TAB_HIDDEN" : "TAB_VISIBLE", {
        source: "visibilitychange"
      });
    };

    const onWindowBlur = () => {
      if (pauseOnHidden) {
        setInterrupted(true);
      }
      void api.logEvent("TAB_HIDDEN", { source: "window-blur" });
    };

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [enabled, pauseOnHidden]);

  async function requestFullscreen() {
    if (!document.documentElement.requestFullscreen) {
      return false;
    }

    try {
      await document.documentElement.requestFullscreen();
      setInterrupted(false);
      await api.logEvent("FULLSCREEN_ENTERED", { source: "manual-request" }).catch(() => undefined);
      return true;
    } catch {
      setInterrupted(false);
      return false;
    }
  }

  return {
    interrupted,
    supported,
    requestFullscreen,
    clearInterrupted: () => setInterrupted(false)
  };
}
