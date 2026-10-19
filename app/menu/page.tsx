import type { Metadata } from "next";
import { currentPublication, settings } from "@/lib/menus";
import { luandaDate, dateLabel } from "@/lib/format";
import { Brand } from "@/components/brand";
import { MenuPaper } from "@/components/menu-paper";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Menu do Dia",
  robots: { index: true, follow: true },
};
export default async function Page() {
  const today = luandaDate();
  const [pub, config] = await Promise.all([
    currentPublication(today),
    settings(),
  ]);
  return (
    <main className="public-menu">
      <div className="public-kicker">
        <span>PALACE LOUNGE</span>
        <span>LUANDA, ANGOLA</span>
      </div>
      {pub ? (
        <>
          <nav className="public-categories" aria-label="Categorias do menu">
            {[...new Set(pub.items.map((i) => i.categoryId))].map((id, i) => (
              <a key={id} href={`#categoria-${i}`}>
                {pub.items.find((item) => item.categoryId === id)!.categoryName}
              </a>
            ))}
          </nav>
          <div className="public-paper">
            <MenuPaper items={pub.items} date={today} />
          </div>
        </>
      ) : (
        <section className="public-empty">
          <Brand />
          <span className="eyebrow">À MESA DO PALACE</span>
          <h1>Menu do Dia</h1>
          <p className="paper-date">{dateLabel(today)}</p>
          <div className="paper-ornament">
            <span />◇<span />
          </div>
          <h2>
            O menu de hoje ainda
            <br />
            não está disponível.
          </h2>
          <p>
            Estamos a preparar a sua próxima experiência.
            <br />
            Volte a visitar-nos em breve.
          </p>
          {config.contact && (
            <a
              className="button secondary"
              href={
                config.contact.includes("@")
                  ? `mailto:${config.contact}`
                  : `tel:${config.contact.replace(/[^+\d]/g, "")}`
              }
            >
              Consultar o restaurante
            </a>
          )}
        </section>
      )}
      <footer className="public-footer">
        {config.website && (
          <a href={config.website} rel="noopener noreferrer">
            Visitar o website do Palace <span>↗</span>
          </a>
        )}
        <span>PALACE LOUNGE · A ARTE DE BEM RECEBER</span>
      </footer>
    </main>
  );
}
