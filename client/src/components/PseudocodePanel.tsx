export function PseudocodePanel({
  pseudocode,
  question
}: {
  pseudocode: string | null;
  question: string;
}) {
  return (
    <section className="challenge-block">
      {pseudocode ? (
        <pre className="pseudocode" aria-label="Pseudocode challenge">
          {pseudocode}
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
