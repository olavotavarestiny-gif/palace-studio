"use client";
export default function ErrorPage({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="error-page">
      <span className="eyebrow">PALACE MENU STUDIO</span>
      <h1>Não foi possível abrir esta página.</h1>
      <p>
        Verifique a ligação e tente novamente. As versões guardadas continuam
        preservadas.
      </p>
      <button className="button primary" onClick={reset}>
        Tentar novamente
      </button>
    </main>
  );
}
