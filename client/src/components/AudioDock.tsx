export function AudioDock({
  muted,
  volume,
  onToggleMute,
  onVolumeChange
}: {
  muted: boolean;
  volume: number;
  onToggleMute: () => void;
  onVolumeChange: (value: number) => void;
}) {
  return (
    <div className="audio-dock">
      <button type="button" className="ghost-button" onClick={onToggleMute}>
        {muted ? "Sound Off" : "Sound On"}
      </button>
      <input
        aria-label="Volume"
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={volume}
        onChange={(event) => onVolumeChange(Number(event.target.value))}
      />
    </div>
  );
}
