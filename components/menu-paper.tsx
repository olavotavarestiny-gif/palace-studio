import { Brand } from "./brand";
import { dateLabel, money } from "@/lib/format";
import type { MenuItem } from "@/lib/types";
export function MenuPaper({
  items,
  date,
  compact = false,
}: {
  items: MenuItem[];
  date: string;
  compact?: boolean;
}) {
  const groups = [...new Set(items.map((i) => i.categoryId))];
  return (
    <article className={`menu-paper ${compact ? "compact" : ""}`}>
      <div className="paper-border">
        <Brand />
        <span className="eyebrow">À MESA DO PALACE</span>
        <h2>Menu do Dia</h2>
        <p className="paper-date">{dateLabel(date)}</p>
        <div className="paper-ornament">
          <span />◇<span />
        </div>
        {items.length ? (
          groups.map((id, index) => (
            <section
              className="paper-category"
              id={`categoria-${index}`}
              key={id}
            >
              <h3>{items.find((i) => i.categoryId === id)!.categoryName}</h3>
              {items
                .filter((i) => i.categoryId === id)
                .map((i) => (
                  <div className="paper-dish" key={i.id}>
                    {!compact && i.photo && (
                      <img
                        className="dish-photo"
                        src={i.photo}
                        width={72}
                        height={72}
                        alt={i.name}
                        loading="lazy"
                      />
                    )}
                    <div>
                      <h4>{i.name}</h4>
                      {i.description && <p>{i.description}</p>}
                    </div>
                    <span>{money(i.price)}</span>
                  </div>
                ))}
            </section>
          ))
        ) : (
          <div className="paper-empty">
            <span className="paper-empty-line" />
            <p>
              Uma nova experiência
              <br />
              está a ser preparada.
            </p>
            <span className="paper-empty-line" />
          </div>
        )}
        <footer>
          PALACE LOUNGE <span>·</span> LUANDA
        </footer>
      </div>
    </article>
  );
}
