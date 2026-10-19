"use client";
import { useState } from "react";
import {
  Download,
  Images,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Eye,
  X,
} from "lucide-react";
import { dateLabel, timeLabel } from "@/lib/format";
import type { Publication, StudioState } from "@/lib/types";
import { api, Empty, Modal, type Notify } from "./ui";
export function Publications({
  data,
  refresh,
  notify,
}: {
  data: StudioState;
  refresh: () => Promise<StudioState>;
  notify: Notify;
}) {
  const [selected, setSelected] = useState(
      data.todayPublication?.id || data.publications[0]?.id || "",
    ),
    [busy, setBusy] = useState(false),
    [format, setFormat] = useState<"feed" | "story">("feed"),
    [preview, setPreview] = useState<string | null>(null);
  const pub =
    data.publications.find((p) => p.id === selected) || data.publications[0];
  async function generate() {
    if (!pub) return;
    setBusy(true);
    try {
      const result = await api<{ ok: boolean; error?: string }>(
        `publications/${pub.id}/generate`,
        {},
      );
      await refresh();
      notify(
        result.ok
          ? "Imagens geradas e prontas para descarregar."
          : result.error!,
        !result.ok,
      );
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  const assets = pub?.assets.filter((a) => a.format === format) || [];
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            A IDENTIDADE PALACE, PRONTA A PARTILHAR
          </span>
          <h1>Publicações</h1>
          <p>Do seu menu às redes sociais, com a mesma atenção ao detalhe.</p>
        </div>
        {pub && (
          <a
            className="button primary"
            href={`/api/exports/${pub.id}/all`}
            aria-disabled={!pub.assets.length}
            onClick={(e) => {
              if (!pub.assets.length) e.preventDefault();
            }}
          >
            <Download size={17} />
            Descarregar tudo
          </a>
        )}
      </div>
      {!pub ? (
        <section className="card">
          <Empty
            icon={<Images size={32} />}
            title="O próximo menu merece ser partilhado."
            description="Ao publicar o seu primeiro menu, as imagens de Feed e Story aparecem aqui, prontas para descarregar."
          />
          <a className="button secondary empty-action" href="/studio/menu">
            Preparar menu do dia <ArrowRight size={16} />
          </a>
        </section>
      ) : (
        <>
          <div className="publication-toolbar">
            <label>
              MENU E VERSÃO
              <select
                value={pub.id}
                onChange={(e) => setSelected(e.target.value)}
              >
                {data.publications.map((p) => (
                  <option key={p.id} value={p.id}>
                    {dateLabel(p.menu_date)} · Versão {p.version}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button secondary"
              disabled={busy}
              onClick={generate}
            >
              <RefreshCw size={16} className={busy ? "spinning" : ""} />
              {busy ? "A gerar imagens…" : "Regenerar imagens"}
            </button>
          </div>
          <div className="publication-status">
            <span className="status-badge">
              <span />
              Versão {pub.version} publicada
            </span>
            <span>
              {dateLabel(pub.menu_date)} · {timeLabel(pub.published_at)}
            </span>
            <span>{pub.items.length} pratos</span>
          </div>
          {pub.generation_status === "error" && (
            <div className="notice" role="alert">
              <AlertCircle size={19} />
              <span>
                O menu foi publicado. {pub.generation_error} Utilize «Regenerar
                imagens» para tentar novamente.
              </span>
            </div>
          )}
          {pub.generation_status === "generating" && (
            <div className="notice">
              <RefreshCw size={18} />
              <span>
                A geração está em curso.{" "}
                <button
                  className="text-link"
                  onClick={() =>
                    refresh().catch((e) => notify(e.message, true))
                  }
                >
                  Actualizar estado
                </button>
              </span>
            </div>
          )}
          <div className="publication-format-heading">
            <div className="tabs">
              <button
                className={format === "feed" ? "selected" : ""}
                onClick={() => setFormat("feed")}
              >
                Instagram Feed <span>1080 × 1350</span>
              </button>
              <button
                className={format === "story" ? "selected" : ""}
                onClick={() => setFormat("story")}
              >
                Stories / Status <span>1080 × 1920</span>
              </button>
            </div>
            {assets.length > 0 && (
              <a
                className="text-link"
                href={`/api/exports/${pub.id}/${format}`}
              >
                <Download size={16} />
                Descarregar {format === "feed" ? "Feed" : "Story"}
                {assets.length > 1 ? " (ZIP)" : ""}
              </a>
            )}
          </div>
          {!assets.length ? (
            <section className="card">
              <Empty
                title="As imagens aguardam a sua composição."
                description="Gere os dois formatos a partir desta versão exacta do menu."
                icon={<Images size={28} />}
                action={busy ? "A gerar…" : "Gerar imagens"}
                onAction={busy ? undefined : generate}
              />
            </section>
          ) : (
            <div className="publication-gallery">
              {assets.map((asset) => (
                <article className="card publication-image-card" key={asset.id}>
                  <button
                    className={`publication-image ${format}`}
                    onClick={() => setPreview(asset.id)}
                    aria-label={`Ampliar página ${asset.page}`}
                  >
                    <img
                      src={`/api/assets/${asset.id}`}
                      alt={`Menu Palace, ${format}, página ${asset.page}`}
                      loading="lazy"
                    />
                    <span>
                      <Eye size={18} />
                      Ampliar
                    </span>
                  </button>
                  <div className="publication-image-info">
                    <div>
                      <strong>
                        {format === "feed"
                          ? "Instagram Feed"
                          : "Stories / Status"}
                      </strong>
                      <span>
                        Página {String(asset.page).padStart(2, "0")} de{" "}
                        {String(assets.length).padStart(2, "0")} · PNG
                      </span>
                      <small>Gerado às {timeLabel(asset.generated_at)}</small>
                    </div>
                    <a
                      className="icon-button bordered"
                      aria-label={`Descarregar página ${asset.page}`}
                      href={`/api/assets/${asset.id}?download=1`}
                    >
                      <Download size={18} />
                    </a>
                  </div>
                </article>
              ))}
            </div>
          )}
          <div className="archive-note">
            <CheckCircle2 size={17} />
            <p>
              Estas imagens correspondem à versão {pub.version} do menu. As
              alterações na biblioteca ou noutros rascunhos preservam esta
              publicação.
            </p>
          </div>
        </>
      )}
      {preview && (
        <Modal title="A sua publicação" wide onClose={() => setPreview(null)}>
          <div className="full-image-preview">
            <img
              src={`/api/assets/${preview}`}
              alt="Publicação em tamanho completo"
            />
            <a
              className="button primary"
              href={`/api/assets/${preview}?download=1`}
            >
              <Download size={16} />
              Descarregar imagem
            </a>
          </div>
        </Modal>
      )}
    </>
  );
}
