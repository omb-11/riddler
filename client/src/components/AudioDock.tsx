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
      <button
        type="button"
        className="ghost-button audio-toggle"
        onClick={onToggleMute}
        aria-label={muted ? "Enable audio" : "Mute audio"}
      >
        {muted ? "Off" : "On"}
      </button>
      <input
        className="audio-slider"
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
