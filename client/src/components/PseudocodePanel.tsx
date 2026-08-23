import type { ClipboardEvent, MouseEvent } from "react";

export function PseudocodePanel({
  pseudocode,
  question
}: {
  pseudocode: string | null;
  question: string;
}) {
  function protectArtifact(event: ClipboardEvent | MouseEvent) {
    event.preventDefault();
  }

  return (
    <section className="challenge-block">
      <div className="artifact-header">
        <span className="eyebrow">Cipher Sheet</span>
      </div>
      {pseudocode ? (
        <pre
          className="pseudocode"
          aria-label="Pseudocode challenge"
          onCopy={protectArtifact}
          onContextMenu={protectArtifact}
        >
          {pseudocode.split("\n").map((line, index) => (
            <span className="code-line" key={`${index}-${line}`}>
              <span className="line-number">{String(index + 1).padStart(2, "0")}</span>
              <span className="code-text">{line || " "}</span>
            </span>
          ))}
        </pre>
      ) : (
        <div className="pseudocode pseudocode-empty">Physical challenge instructions only.</div>
      )}
      <div className="question-block">
        <span className="eyebrow">Question</span>
        <p>{question}</p>
      </div>
    </section>
  );
}
