/** Rendu léger du texte de l'IA : paragraphes, listes, titres « ## », **gras**. Aucun HTML interprété. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/).map((s, j) =>
        s.startsWith("**") && s.endsWith("**") && s.length > 4 ? <strong key={j} className="text-bone">{s.slice(2, -2)}</strong> : <span key={j}>{s}</span>,
      )}
    </>
  );
}

export function RichText({ text }: { text: string }) {
  const blocks = text.replace(/\r/g, "").split(/\n{2,}/);
  return (
    <div className="space-y-2 break-words">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        const heading = /^#{1,4}\s+/.test(lines[0] ?? "");
        return (
          <div key={i}>
            {lines.map((line, k) => {
              if (k === 0 && heading) return <p key={k} className="font-medium text-bone"><Inline text={line.replace(/^#{1,4}\s+/, "")} /></p>;
              const bullet = /^\s*(?:[-*•]|\d+[.)])\s+/.test(line);
              return <p key={k} className={bullet ? "pl-3" : undefined}><Inline text={line} /></p>;
            })}
          </div>
        );
      })}
    </div>
  );
}
