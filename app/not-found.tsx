import Link from "next/link";
export default function NotFound() {
  return (
    <main className="error-page">
      <span className="eyebrow">PALACE MENU STUDIO · 404</span>
      <h1>Esta página não está disponível.</h1>
      <Link className="button secondary" href="/studio">
        Regressar ao Studio
      </Link>
    </main>
  );
}
