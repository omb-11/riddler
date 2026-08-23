export function FullscreenOverlay({
  visible,
  supported,
  onResume
}: {
  visible: boolean;
  supported: boolean;
  onResume: () => void;
}) {
  if (!visible) {
    return null;
  }

  return (
    <div className="fullscreen-overlay" role="dialog" aria-modal="true">
      <div className="overlay-panel">
        <span className="eyebrow">TRIAL INTERRUPTED</span>
        <h2>Return to fullscreen to continue.</h2>
        <p>
          {supported
            ? "Progress is preserved. Resume the trial when you are ready."
            : "This browser does not support fullscreen requests here. You can still continue, but the app will log interruptions."}
        </p>
        <button type="button" className="primary-button" onClick={onResume}>
          RESUME TRIAL
        </button>
      </div>
    </div>
  );
}
