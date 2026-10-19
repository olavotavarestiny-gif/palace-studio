"use client";
import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  Copy,
  Eye,
  Globe2,
  Image,
  LoaderCircle,
  Plus,
  Save,
  Send,
  Trash2,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { api, Empty, FormError, Modal, type Notify } from "./ui";
import { DishPicker } from "./library";
import { MenuPaper } from "./menu-paper";
import { dateLabel } from "@/lib/format";
import type { Draft, MenuItem, StudioState } from "@/lib/types";

export function Editor({
  data,
  refresh,
  notify,
  onDirty,
}: {
  data: StudioState;
  refresh: () => Promise<StudioState>;
  notify: Notify;
  onDirty: (value: boolean) => void;
}) {
  const [draft, setDraft] = useState<Draft>(data.draft),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const [picker, setPicker] = useState(false),
    [direct, setDirect] = useState(false),
    [previewTab, setPreviewTab] = useState<"digital" | "feed" | "story">(
      "digital",
    ),
    [mobilePreview, setMobilePreview] = useState(false),
    [previews, setPreviews] = useState<{ feed: string[]; story: string[] }>({
      feed: [],
      story: [],
    }),
    [previewBusy, setPreviewBusy] = useState(false);
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);
  const categoryIds = [...new Set(draft.items.map((i) => i.categoryId))];
  function change(items: MenuItem[]) {
    setDraft((d) => ({ ...d, items }));
    setDirty(true);
    setPreviews({ feed: [], story: [] });
    setError("");
  }
  function edit(id: string, values: Partial<MenuItem>) {
    change(draft.items.map((i) => (i.id === id ? { ...i, ...values } : i)));
  }
  function add(items: MenuItem[]) {
    const all = [...draft.items, ...items];
    const ids = [
      ...categoryIds,
      ...data.categories
        .filter((c) => !categoryIds.includes(c.id))
        .map((c) => c.id),
    ];
    change(ids.flatMap((id) => all.filter((i) => i.categoryId === id)));
    setPicker(false);
    setDirect(false);
  }
  async function dateChange(date: string) {
    if (
      !date ||
      (dirty &&
        !confirm("Tem alterações por guardar. Mudar a data e descartá-las?"))
    )
      return;
    setBusy("date");
    setError("");
    try {
      setDraft(await api<Draft>(`menu?date=${date}`));
      setDirty(false);
      setPreviews({ feed: [], story: [] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function duplicate() {
    if (
      draft.items.length &&
      !confirm("Substituir os pratos deste rascunho pelos do menu anterior?")
    )
      return;
    setBusy("duplicate");
    setError("");
    try {
      const result = await api<{ items: MenuItem[] }>(
        `menu/previous?date=${draft.menu_date}`,
      );
      change(result.items);
      notify(
        "Menu anterior copiado. Pode ajustar os pratos antes de guardar ou publicar.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function save(publish: boolean) {
    setBusy(publish ? "publish" : "save");
    setError("");
    try {
      const result = await api<{
        draft: Draft;
        generation: { ok: boolean; error?: string } | null;
      }>(`menu/${publish ? "publish" : "save"}`, {
        date: draft.menu_date,
        revision: draft.revision,
        items: draft.items,
      });
      setDraft(result.draft);
      setDirty(false);
      notify(
        publish
          ? result.generation?.ok
            ? "Menu publicado. Menu digital actualizado e imagens prontas para descarregar."
            : `Menu publicado. ${result.generation?.error}`
          : "Rascunho guardado. A versão pública mantém-se até publicar.",
        publish && !result.generation?.ok,
      );
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function render(format: "feed" | "story") {
    if (!draft.items.length || previewBusy) return;
    setPreviewBusy(true);
    setError("");
    try {
      const result = await api<{ pages: string[] }>(
        `menu/preview?format=${format}`,
        { date: draft.menu_date, revision: draft.revision, items: draft.items },
      );
      setPreviews((p) => ({ ...p, [format]: result.pages }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPreviewBusy(false);
    }
  }
  function categoryMove(index: number, direction: number) {
    const ids = [...categoryIds];
    [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
    change(ids.flatMap((id) => draft.items.filter((i) => i.categoryId === id)));
  }
  function itemMove(id: string, direction: number) {
    const all = [...draft.items];
    const index = all.findIndex((i) => i.id === id);
    if (
      index + direction < 0 ||
      index + direction >= all.length ||
      all[index + direction].categoryId !== all[index].categoryId
    )
      return;
    [all[index], all[index + direction]] = [all[index + direction], all[index]];
    change(all);
  }
  const publication = data.publications.find(
    (p) => p.id === draft.published_id,
  );
  return (
    <>
      <div className="page-heading editor-heading">
        <div>
          <span className="eyebrow">A EXPERIÊNCIA DE HOJE COMEÇA AQUI</span>
          <h1>
            Menu do Dia{" "}
            <span className="status-badge">
              <span />
              {dirty
                ? "Alterações por guardar"
                : draft.published_id
                  ? "Publicado"
                  : draft.items.length
                    ? "Rascunho"
                    : "Não publicado"}
            </span>
          </h1>
          <p>Escolha, organize e publique. Nós tratamos do resto.</p>
        </div>
        <div className="button-row editor-buttons">
          <button
            className="button secondary"
            onClick={() => save(false)}
            disabled={!!busy}
          >
            <Save size={16} />
            {busy === "save" ? "A guardar…" : "Guardar rascunho"}
          </button>
          <button
            className="button primary"
            onClick={() => save(true)}
            disabled={
              !!busy || !draft.items.length || draft.menu_date !== data.today
            }
          >
            {busy === "publish" ? (
              <LoaderCircle size={16} className="spinning" />
            ) : (
              <Send size={16} />
            )}
            {busy === "publish" ? "A publicar e gerar…" : "Publicar menu"}
          </button>
        </div>
      </div>
      <div className="editor-context">
        <div>
          <label className="date-selector">
            <span>DATA DO MENU</span>
            <input
              type="date"
              value={draft.menu_date}
              onChange={(e) => dateChange(e.target.value)}
              disabled={!!busy}
            />
          </label>
          {publication && (
            <span className="editor-version">
              Versão {publication.version} publicada ·{" "}
              {dateLabel(draft.menu_date)}
            </span>
          )}
        </div>
        <button className="text-link" onClick={duplicate} disabled={!!busy}>
          <Copy size={15} />
          Duplicar menu anterior
        </button>
      </div>
      {draft.menu_date !== data.today && (
        <div className="notice">
          <BookOpen size={18} />
          <span>
            Está a preparar um rascunho para {dateLabel(draft.menu_date)}. A
            publicação manual estará disponível nesse dia.
          </span>
        </div>
      )}
      <FormError message={error} />
      <div className="mobile-editor-tabs tabs">
        <button
          className={!mobilePreview ? "selected" : ""}
          onClick={() => setMobilePreview(false)}
        >
          Editar menu
        </button>
        <button
          className={mobilePreview ? "selected" : ""}
          onClick={() => setMobilePreview(true)}
        >
          Pré-visualizar
        </button>
      </div>
      <div className={`editor-grid ${mobilePreview ? "show-preview" : ""}`}>
        <section className="editor-content">
          <div className="section-heading">
            <div>
              <h2>A selecção do dia</h2>
              <p>
                {draft.items.length} prato(s) · {categoryIds.length}{" "}
                categoria(s)
              </p>
            </div>
            <button
              className="button secondary small"
              onClick={() => setPicker(true)}
              disabled={!!busy}
            >
              <Plus size={16} />
              Da biblioteca
            </button>
          </div>
          {!draft.items.length ? (
            <div className="card">
              <Empty
                title="O que vamos servir hoje?"
                description="Seleccione os pratos da biblioteca ou comece por duplicar o menu anterior."
                icon={<UtensilsCrossed size={32} />}
                action="Seleccionar pratos"
                onAction={() => setPicker(true)}
              />
            </div>
          ) : (
            categoryIds.map((id, categoryIndex) => {
              const items = draft.items.filter((i) => i.categoryId === id);
              return (
                <section className="card editor-category" key={id}>
                  <header>
                    <div>
                      <span className="category-number">
                        {String(categoryIndex + 1).padStart(2, "0")}
                      </span>
                      <h3>{items[0].categoryName}</h3>
                      <span className="item-count">{items.length}</span>
                    </div>
                    <div className="row-actions">
                      <button
                        className="icon-button"
                        disabled={categoryIndex === 0 || !!busy}
                        aria-label={`Subir categoria ${items[0].categoryName}`}
                        onClick={() => categoryMove(categoryIndex, -1)}
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        className="icon-button"
                        disabled={
                          categoryIndex === categoryIds.length - 1 || !!busy
                        }
                        aria-label={`Descer categoria ${items[0].categoryName}`}
                        onClick={() => categoryMove(categoryIndex, 1)}
                      >
                        <ArrowDown size={15} />
                      </button>
                    </div>
                  </header>
                  {items.map((item, index) => (
                    <div className="editor-item" key={item.id}>
                      <div className="item-fields">
                        <div className="editor-item-top">
                          <label className="item-name-label">
                            <span>Prato</span>
                            <input
                              value={item.name}
                              maxLength={160}
                              required
                              onChange={(e) =>
                                edit(item.id, { name: e.target.value })
                              }
                              aria-label={`Nome do prato ${index + 1}`}
                              disabled={!!busy}
                            />
                          </label>
                          <label className="item-price-label">
                            <span>Preço · Kz</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step="0.01"
                              value={
                                Number.isFinite(item.price) ? item.price : ""
                              }
                              max="999999999999.99"
                              onChange={(e) =>
                                edit(item.id, { price: e.target.valueAsNumber })
                              }
                              aria-label={`Preço de ${item.name}`}
                              disabled={!!busy}
                            />
                          </label>
                        </div>
                        <textarea
                          value={item.description}
                          rows={2}
                          maxLength={1200}
                          onChange={(e) =>
                            edit(item.id, { description: e.target.value })
                          }
                          aria-label={`Descrição de ${item.name}`}
                          placeholder="Descrição opcional"
                          disabled={!!busy}
                        />
                      </div>
                      <div className="item-controls">
                        <button
                          className="icon-button"
                          disabled={index === 0 || !!busy}
                          onClick={() => itemMove(item.id, -1)}
                          aria-label={`Subir ${item.name}`}
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          className="icon-button"
                          disabled={index === items.length - 1 || !!busy}
                          onClick={() => itemMove(item.id, 1)}
                          aria-label={`Descer ${item.name}`}
                        >
                          <ArrowDown size={14} />
                        </button>
                        <button
                          className="icon-button"
                          disabled={!!busy}
                          onClick={() =>
                            change(draft.items.filter((i) => i.id !== item.id))
                          }
                          aria-label={`Remover ${item.name} do menu`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </section>
              );
            })
          )}
          <button
            className="add-direct"
            onClick={() => setDirect(true)}
            disabled={!!busy || !data.categories.some((c) => c.active)}
          >
            <Plus size={17} />
            Adicionar prato directamente ao menu
          </button>
          <p className="editor-help">
            <Check size={14} />
            Os ajustes de preço e descrição afectam apenas este menu.
          </p>
        </section>
        <aside className="preview-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">O ÚLTIMO OLHAR</span>
              <h2>Pré-visualização</h2>
            </div>
            <Eye size={20} />
          </div>
          <div className="preview-tabs tabs">
            {(["digital", "feed", "story"] as const).map((tab) => (
              <button
                key={tab}
                className={previewTab === tab ? "selected" : ""}
                onClick={() => {
                  setPreviewTab(tab);
                  if (tab !== "digital" && !previews[tab].length)
                    void render(tab);
                }}
              >
                {tab === "digital" ? (
                  <>
                    <Globe2 size={14} />
                    Digital
                  </>
                ) : tab === "feed" ? (
                  "Feed"
                ) : (
                  "Story"
                )}
              </button>
            ))}
          </div>
          <div className="preview-stage">
            {previewTab === "digital" ? (
              <MenuPaper items={draft.items} date={draft.menu_date} compact />
            ) : previewBusy ? (
              <div className="load-state">
                <LoaderCircle size={25} className="spinning" />
                <p>A compor as páginas…</p>
              </div>
            ) : previews[previewTab].length ? (
              <div className="rendered-pages">
                {previews[previewTab].map((src, i) => (
                  <figure key={i}>
                    <img
                      src={src}
                      alt={`Pré-visualização ${previewTab}, página ${i + 1}`}
                    />
                    <figcaption>
                      Página {i + 1} de {previews[previewTab].length}
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <Empty
                icon={<Image size={28} />}
                title="A sua publicação, em detalhe."
                description={
                  draft.items.length
                    ? "Gere uma pré-visualização com as dimensões finais."
                    : "Seleccione pratos para compor a publicação."
                }
                action={
                  draft.items.length ? "Gerar pré-visualização" : undefined
                }
                onAction={() => render(previewTab)}
              />
            )}
          </div>
          <div className="preview-caption">
            <span>
              {previewTab === "digital"
                ? "Menu digital · adaptação mobile"
                : previewTab === "feed"
                  ? "1080 × 1350 px · PNG"
                  : "1080 × 1920 px · PNG"}
            </span>
            <span>RASCUNHO</span>
          </div>
          {publication?.assets.length ? (
            <div className="editor-downloads">
              <span>
                <Check size={15} />
                Imagens da versão publicada
              </span>
              <div className="button-row">
                <a
                  className="button secondary small"
                  href={`/api/exports/${publication.id}/feed`}
                >
                  Descarregar Feed
                </a>
                <a
                  className="button secondary small"
                  href={`/api/exports/${publication.id}/story`}
                >
                  Descarregar Story
                </a>
              </div>
            </div>
          ) : null}
        </aside>
      </div>
      {picker && (
        <DishPicker
          data={data}
          existing={draft.items}
          onClose={() => setPicker(false)}
          onAdd={add}
        />
      )}
      {direct && (
        <Modal
          title="Um prato, só para este menu."
          subtitle="Este prato não será adicionado à biblioteca permanente."
          onClose={() => setDirect(false)}
        >
          <form
            className="modal-form"
            onSubmit={(e) => {
              e.preventDefault();
              const form = Object.fromEntries(new FormData(e.currentTarget));
              const category = data.categories.find(
                (c) => c.id === form.categoryId,
              )!;
              add([
                {
                  id: crypto.randomUUID(),
                  dishId: null,
                  categoryId: category.id,
                  categoryName: category.name,
                  name: String(form.name),
                  description: String(form.description),
                  price: Number(form.price),
                  photo: null,
                },
              ]);
            }}
          >
            <label>
              Nome
              <input autoFocus name="name" required maxLength={160} />
            </label>
            <div className="form-grid">
              <label>
                Categoria
                <select name="categoryId" required>
                  {data.categories
                    .filter((c) => c.active)
                    .map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Preço em Kz
                <input
                  name="price"
                  type="number"
                  min="0"
                  step="0.01"
                  max="999999999999.99"
                  required
                />
              </label>
            </div>
            <label>
              Descrição (opcional)
              <textarea name="description" maxLength={1200} rows={3} />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setDirect(false)}
              >
                Cancelar
              </button>
              <button className="button primary">
                Adicionar ao menu <Plus size={16} />
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
