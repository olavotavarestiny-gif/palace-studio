"use client";
import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowRight,
  Check,
  Copy,
  ImagePlus,
  Layers3,
  Pencil,
  Plus,
  Search,
  UtensilsCrossed,
  X,
  Power,
} from "lucide-react";
import { api, Empty, FormError, Modal, type Notify } from "./ui";
import { money } from "@/lib/format";
import type { Category, Dish, Draft, MenuItem, StudioState } from "@/lib/types";

export const toItem = (dish: Dish, categories: Category[]): MenuItem => ({
  id: crypto.randomUUID(),
  dishId: dish.id,
  categoryId: dish.category_id,
  categoryName: categories.find((c) => c.id === dish.category_id)?.name || "",
  name: dish.name,
  description: dish.description,
  price: dish.price,
  photo: dish.photo,
});
export function Library({
  data,
  refresh,
  notify,
  go,
}: {
  data: StudioState;
  refresh: () => Promise<StudioState>;
  notify: Notify;
  go: (href: string) => void;
}) {
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [status, setStatus] = useState("active"),
    [selected, setSelected] = useState<string[]>([]);
  const [edit, setEdit] = useState<Dish | "new" | null>(null),
    [categoriesOpen, setCategoriesOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const dishes = data.dishes.filter(
    (d) =>
      d.name.toLocaleLowerCase("pt").includes(search.toLocaleLowerCase("pt")) &&
      (!category || d.category_id === category) &&
      (status === "all" || d.active === (status === "active")),
  );
  async function toggle(dish: Dish) {
    try {
      await api(
        `dishes/${dish.id}`,
        { ...dish, active: !dish.active },
        "PATCH",
      );
      await refresh();
      notify(
        dish.active
          ? "Prato desactivado. O histórico foi preservado."
          : "Prato activado.",
      );
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  async function duplicate(dish: Dish) {
    setEdit({ ...dish, id: "", name: `${dish.name} (cópia)`.slice(0, 160) });
  }
  async function addToMenu() {
    setBusy(true);
    try {
      const draft = await api<Draft>(`menu?date=${data.today}`);
      const existing = new Set(draft.items.map((i) => i.dishId));
      const additions = data.dishes
        .filter(
          (d) => selected.includes(d.id) && d.active && !existing.has(d.id),
        )
        .map((d) => toItem(d, data.categories));
      if (!additions.length) {
        notify("Os pratos seleccionados já estão no menu ou estão inactivos.");
        return;
      }
      await api("menu/save", {
        date: data.today,
        revision: draft.revision,
        items: [...draft.items, ...additions],
      });
      await refresh();
      setSelected([]);
      notify(`${additions.length} prato(s) adicionados ao rascunho.`);
      go("/studio/menu");
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">A BASE DE CADA BOM MENU</span>
          <h1>Biblioteca de Pratos</h1>
          <p>Os seus pratos, guardados para tornar cada dia mais simples.</p>
        </div>
        <div className="button-row">
          <button
            className="button secondary"
            onClick={() => setCategoriesOpen(true)}
          >
            <Layers3 size={16} />
            Categorias
          </button>
          <button
            className="button primary"
            onClick={() =>
              data.categories.some((c) => c.active)
                ? setEdit("new")
                : setCategoriesOpen(true)
            }
          >
            <Plus size={17} />
            Novo prato
          </button>
        </div>
      </div>
      <section className="card library-card">
        <div className="library-toolbar">
          <div className="search-field">
            <Search size={18} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Procurar um prato…"
              aria-label="Procurar prato por nome"
            />
          </div>
          <div className="filter-row">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="Filtrar por categoria"
            >
              <option value="">Todas as categorias</option>
              {data.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              aria-label="Filtrar por estado"
            >
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
              <option value="all">Todos os estados</option>
            </select>
          </div>
        </div>
        {selected.length > 0 && (
          <div className="selection-bar">
            <span>
              <Check size={16} />
              {selected.length} seleccionado(s)
            </span>
            <button className="text-link" onClick={() => setSelected([])}>
              Limpar
            </button>
            <button
              className="button primary small"
              disabled={busy}
              onClick={addToMenu}
            >
              Adicionar ao menu de hoje <ArrowRight size={15} />
            </button>
          </div>
        )}
        {!dishes.length ? (
          <Empty
            icon={<UtensilsCrossed size={29} />}
            title={
              data.dishes.length
                ? "Nenhum prato encontrado."
                : "Cada grande menu começa aqui."
            }
            description={
              data.dishes.length
                ? "Experimente outro nome, categoria ou estado."
                : "Crie as suas categorias e adicione os pratos oficiais do Palace. Depois, basta escolhê-los a cada dia."
            }
            action={
              data.dishes.length
                ? "Limpar filtros"
                : data.categories.some((c) => c.active)
                  ? "Adicionar primeiro prato"
                  : "Criar primeira categoria"
            }
            onAction={() => {
              if (data.dishes.length) {
                setSearch("");
                setCategory("");
                setStatus("all");
              } else if (data.categories.some((c) => c.active)) setEdit("new");
              else setCategoriesOpen(true);
            }}
          />
        ) : (
          <div className="dish-table">
            <div className="table-heading">
              <input
                type="checkbox"
                aria-label="Seleccionar pratos visíveis"
                checked={
                  dishes.length > 0 &&
                  dishes.every((d) => selected.includes(d.id))
                }
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...new Set([...selected, ...dishes.map((d) => d.id)])]
                      : selected.filter(
                          (id) => !dishes.some((d) => d.id === id),
                        ),
                  )
                }
              />
              <span>PRATO</span>
              <span>CATEGORIA</span>
              <span>PREÇO</span>
              <span>ESTADO</span>
              <span>ACÇÕES</span>
            </div>
            {dishes.map((dish) => (
              <div className="dish-row" key={dish.id}>
                <input
                  type="checkbox"
                  aria-label={`Seleccionar ${dish.name}`}
                  checked={selected.includes(dish.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, dish.id]
                        : selected.filter((id) => id !== dish.id),
                    )
                  }
                />
                <div className="dish-name">
                  {dish.photo ? (
                    <img
                      className="dish-photo"
                      src={dish.photo}
                      alt=""
                      width={44}
                      height={44}
                    />
                  ) : (
                    <span className="dish-placeholder">
                      <UtensilsCrossed size={17} />
                    </span>
                  )}
                  <div>
                    <strong>{dish.name}</strong>
                    {dish.description && <p>{dish.description}</p>}
                  </div>
                </div>
                <span className="dish-category">
                  {data.categories.find((c) => c.id === dish.category_id)?.name}
                </span>
                <strong className="dish-price">{money(dish.price)}</strong>
                <span className="status-badge">
                  <span />
                  {dish.active ? "Activo" : "Inactivo"}
                </span>
                <div className="row-actions">
                  <button
                    className="icon-button"
                    title="Editar prato"
                    aria-label={`Editar ${dish.name}`}
                    onClick={() => setEdit(dish)}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-button"
                    title="Duplicar prato"
                    aria-label={`Duplicar ${dish.name}`}
                    onClick={() => duplicate(dish)}
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    className="icon-button"
                    title={dish.active ? "Desactivar prato" : "Activar prato"}
                    aria-label={`${dish.active ? "Desactivar" : "Activar"} ${dish.name}`}
                    onClick={() => toggle(dish)}
                  >
                    <Power size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="table-footer">
          <span>{dishes.length} prato(s)</span>
          <span>
            A sua biblioteca é permanente. As publicações preservam o histórico.
          </span>
        </div>
      </section>
      {edit && (
        <DishModal
          dish={edit === "new" ? null : edit}
          categories={data.categories}
          onClose={() => setEdit(null)}
          onSaved={async () => {
            await refresh();
            setEdit(null);
            notify("Prato guardado na biblioteca.");
          }}
        />
      )}
      {categoriesOpen && (
        <CategoryModal
          categories={data.categories}
          onClose={() => setCategoriesOpen(false)}
          refresh={refresh}
          notify={notify}
        />
      )}
    </>
  );
}

export function DishModal({
  dish,
  categories,
  onClose,
  onSaved,
}: {
  dish: Dish | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [photo, setPhoto] = useState(dish?.photo || null),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState("");
  async function upload(file?: File) {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      if (file.size > 3_000_000)
        throw new Error("Seleccione uma imagem até 3 MB.");
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/photos", {
        method: "POST",
        body: form,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setPhoto(result.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const values = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api(
        dish?.id ? `dishes/${dish.id}` : "dishes",
        {
          ...values,
          price: Number(values.price),
          active: values.active === "on",
          photo,
        },
        dish?.id ? "PATCH" : "POST",
      );
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={dish?.id ? "Editar prato" : "Um novo prato."}
      subtitle="Guarde uma vez. Use em todos os menus."
      onClose={() => {
        if (!busy && !uploading) onClose();
      }}
    >
      <form className="modal-form" onSubmit={save}>
        <label>
          Nome do prato
          <input
            name="name"
            defaultValue={dish?.name}
            required
            maxLength={160}
            autoFocus
            placeholder="Nome oficial do prato"
          />
        </label>
        <div className="form-grid">
          <label>
            Categoria
            <select
              name="category_id"
              required
              defaultValue={dish?.category_id || ""}
            >
              <option value="" disabled>
                Seleccionar categoria
              </option>
              {categories
                .filter((c) => c.active || c.id === dish?.category_id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
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
              inputMode="decimal"
              min="0"
              step="0.01"
              max="999999999999.99"
              defaultValue={dish?.price}
              required
              placeholder="0,00"
            />
          </label>
        </div>
        <label>
          Descrição (opcional)
          <textarea
            name="description"
            defaultValue={dish?.description}
            maxLength={1200}
            rows={3}
            placeholder="Ingredientes, preparação ou um pequeno detalhe…"
          />
        </label>
        <div className="photo-upload">
          {photo && (
            <img src={photo} alt="Fotografia do prato" width={84} height={84} />
          )}
          <label className="upload-label">
            <ImagePlus size={20} />
            <span>
              {uploading
                ? "A preparar fotografia…"
                : photo
                  ? "Substituir fotografia"
                  : "Adicionar fotografia"}
              <small>JPG, PNG ou WebP · até 3 MB</small>
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={uploading || busy}
              onChange={(e) => upload(e.target.files?.[0])}
            />
          </label>
          {photo && (
            <button
              type="button"
              className="icon-button"
              aria-label="Remover fotografia"
              onClick={() => setPhoto(null)}
            >
              <X size={17} />
            </button>
          )}
        </div>
        <label className="checkbox-label">
          <input
            name="active"
            type="checkbox"
            defaultChecked={dish?.active ?? true}
          />
          Prato activo na biblioteca
        </label>
        <FormError message={error} />
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy || uploading}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button className="button primary" disabled={busy || uploading}>
            {busy ? "A guardar…" : "Guardar prato"}
            <Check size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function CategoryModal({
  categories,
  onClose,
  refresh,
  notify,
}: {
  categories: Category[];
  onClose: () => void;
  refresh: () => Promise<StudioState>;
  notify: Notify;
}) {
  const [name, setName] = useState(""),
    [editing, setEditing] = useState<Category | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        editing ? `categories/${editing.id}` : "categories",
        {
          name,
          position: editing?.position ?? categories.length,
          active: editing?.active ?? true,
        },
        editing ? "PATCH" : "POST",
      );
      await refresh();
      setName("");
      setEditing(null);
      notify("Categoria guardada.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function move(index: number, direction: number) {
    setBusy(true);
    try {
      const ids = categories.map((c) => c.id);
      [ids[index], ids[index + direction]] = [
        ids[index + direction],
        ids[index],
      ];
      await api("categories/reorder", ids);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function toggle(cat: Category) {
    setBusy(true);
    try {
      await api(
        `categories/${cat.id}`,
        { ...cat, active: !cat.active },
        "PATCH",
      );
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="As suas categorias"
      subtitle="Organize a biblioteca pela ordem que faz sentido para o Palace."
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="category-manager">
        {!categories.length && (
          <p>Ainda não existem categorias. Crie a primeira abaixo.</p>
        )}
        {categories.map((c, i) => (
          <div className="category-row" key={c.id}>
            <span className="category-order">
              {String(i + 1).padStart(2, "0")}
            </span>
            <strong>
              {c.name}
              {!c.active && <small>Inactiva</small>}
            </strong>
            <button
              className="icon-button"
              aria-label={`Subir ${c.name}`}
              onClick={() => move(i, -1)}
              disabled={i === 0 || busy}
            >
              <ArrowUp size={15} />
            </button>
            <button
              className="icon-button"
              aria-label={`Descer ${c.name}`}
              onClick={() => move(i, 1)}
              disabled={i === categories.length - 1 || busy}
            >
              <ArrowDown size={15} />
            </button>
            <button
              className="icon-button"
              aria-label={`Editar categoria ${c.name}`}
              onClick={() => {
                setEditing(c);
                setName(c.name);
              }}
              disabled={busy}
            >
              <Pencil size={15} />
            </button>
            <button
              className="icon-button"
              aria-label={`${c.active ? "Desactivar" : "Activar"} categoria ${c.name}`}
              onClick={() => toggle(c)}
              disabled={busy}
            >
              <Power size={15} />
            </button>
          </div>
        ))}
        <form onSubmit={save}>
          <label>
            {editing ? "Editar categoria" : "Nova categoria"}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={160}
              placeholder="Nome da categoria"
            />
          </label>
          <FormError message={error} />
          <div className="modal-actions">
            {editing && (
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  setEditing(null);
                  setName("");
                }}
              >
                Cancelar edição
              </button>
            )}
            <button className="button primary" disabled={busy}>
              {busy
                ? "A guardar…"
                : editing
                  ? "Guardar categoria"
                  : "Criar categoria"}
              <Plus size={16} />
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

export function DishPicker({
  data,
  existing,
  onClose,
  onAdd,
}: {
  data: StudioState;
  existing: MenuItem[];
  onClose: () => void;
  onAdd: (items: MenuItem[]) => void;
}) {
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [selected, setSelected] = useState<string[]>([]);
  const existingIds = new Set(existing.map((i) => i.dishId));
  const activeCats = new Set(
    data.categories.filter((c) => c.active).map((c) => c.id),
  );
  const dishes = data.dishes.filter(
    (d) =>
      d.active &&
      activeCats.has(d.category_id) &&
      d.name.toLowerCase().includes(search.toLowerCase()) &&
      (!category || d.category_id === category),
  );
  return (
    <Modal
      title="A selecção de hoje."
      subtitle="Escolha os pratos disponíveis. Os preços podem ser ajustados no editor."
      wide
      onClose={onClose}
    >
      <div className="picker-toolbar">
        <div className="search-field">
          <Search size={17} />
          <input
            autoFocus
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Procurar na biblioteca…"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Categoria"
        >
          <option value="">Todas as categorias</option>
          {data.categories
            .filter((c) => c.active)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </div>
      <div className="picker-list">
        {!dishes.length && (
          <Empty
            title="Nenhum prato disponível."
            description="Adicione pratos activos à biblioteca ou procure noutra categoria."
            icon={<UtensilsCrossed size={25} />}
          />
        )}
        {dishes.map((dish) => (
          <label
            className={`picker-dish ${selected.includes(dish.id) ? "selected" : ""}`}
            key={dish.id}
          >
            <input
              type="checkbox"
              disabled={existingIds.has(dish.id)}
              checked={selected.includes(dish.id) || existingIds.has(dish.id)}
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? [...selected, dish.id]
                    : selected.filter((id) => id !== dish.id),
                )
              }
            />
            <div>
              <strong>{dish.name}</strong>
              <span>
                {data.categories.find((c) => c.id === dish.category_id)?.name}
                {existingIds.has(dish.id) ? " · Já no menu" : ""}
              </span>
            </div>
            <strong>{money(dish.price)}</strong>
          </label>
        ))}
      </div>
      <div className="modal-actions picker-actions">
        <span>{selected.length} prato(s) seleccionado(s)</span>
        <button
          className="button primary"
          disabled={!selected.length}
          onClick={() =>
            onAdd(
              data.dishes
                .filter((d) => selected.includes(d.id))
                .map((d) => toItem(d, data.categories)),
            )
          }
        >
          Adicionar ao menu <Plus size={16} />
        </button>
      </div>
    </Modal>
  );
}
