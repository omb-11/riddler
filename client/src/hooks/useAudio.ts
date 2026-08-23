import { useEffect, useRef, useState } from "react";

type SoundName = "click" | "success" | "error" | "unlock" | "warning" | "victory";

const SOUND_FREQUENCIES: Record<SoundName, number[]> = {
  click: [420],
  success: [520, 660],
  error: [220, 180],
  unlock: [430, 540, 660],
  warning: [300, 300],
  victory: [440, 554, 659]
};

export function useAudio(trackPath?: string, musicEnabled = true, soundsEnabled = true) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.4);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!trackPath) {
      return;
    }

    const audio = new Audio(trackPath);
    audio.loop = true;
    audio.volume = volume;
    audio.preload = "none";
    audioRef.current = audio;

    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, [trackPath]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
      audioRef.current.muted = isMuted;
    }
  }, [isMuted, volume]);

  async function unlockAndPlay() {
    setReady(true);

    if (!contextRef.current) {
      contextRef.current = new window.AudioContext();
    }

    if (contextRef.current.state === "suspended") {
      await contextRef.current.resume().catch(() => undefined);
    }

    if (musicEnabled && !isMuted && audioRef.current) {
      await audioRef.current.play().catch(() => undefined);
    }
  }

  function stopMusic() {
    audioRef.current?.pause();
  }

  function toggleMute() {
    setIsMuted((current) => {
      const next = !current;

      if (next) {
        audioRef.current?.pause();
      } else if (musicEnabled && ready) {
        audioRef.current?.play().catch(() => undefined);
      }

      return next;
    });
  }

  function playSound(name: SoundName) {
    if (!soundsEnabled || isMuted) {
      return;
    }

    const context = contextRef.current;

    if (!context) {
      return;
    }

    let offset = 0;
    for (const frequency of SOUND_FREQUENCIES[name]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.value = frequency;
      gain.gain.value = 0.0001;
      oscillator.connect(gain);
      gain.connect(context.destination);
      const start = context.currentTime + offset;
      gain.gain.exponentialRampToValueAtTime(0.035, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.17);
      oscillator.start(start);
      oscillator.stop(start + 0.2);
      offset += 0.08;
    }
  }

  return {
    isMuted,
    volume,
    ready,
    unlockAndPlay,
    toggleMute,
    setVolume,
    playSound,
    stopMusic
  };
}
