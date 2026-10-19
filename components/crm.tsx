"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  LoaderCircle,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Star,
  Users,
  X,
} from "lucide-react";
import { api, Empty, FormError, Modal, type Notify } from "./ui";
import { dateLabel, luandaDate } from "@/lib/format";
import {
  statusLabels,
  statusTransitions,
  type Customer,
  type CustomerDetail,
  type CustomerList,
  type Reservation,
  type ReservationDetail,
  type ReservationList,
  type ReservationStatus,
} from "@/lib/crm-types";

function useDebounced(value: string) {
  const [result, setResult] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setResult(value), 250);
    return () => clearTimeout(t);
  }, [value]);
  return result;
}
function useList<T>(url: string) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [tick, setTick] = useState(0);
  useEffect(() => {
    let controller: AbortController;
    async function load() {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      try {
        const response = await fetch(`/api/crm/${url}`, {
          cache: "no-store",
          signal,
        });
        const next = await response.json();
        if (!response.ok)
          throw new Error(
            response.status === 401
              ? "A sessão expirou. Entre novamente para continuar."
              : next.error,
          );
        if (!signal.aborted) {
          setData(next);
          setError("");
        }
      } catch (e) {
        if (!signal.aborted)
          setError(
            e instanceof Error ? e.message : "Não foi possível actualizar.",
          );
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    }
    void load();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 15000);
    const visible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      controller?.abort();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [url, tick]);
  return { data, error, loading, refresh: () => setTick((t) => t + 1) };
}
function Status({ status }: { status: ReservationStatus }) {
  return (
    <span className={`status-badge crm-status status-${status}`}>
      <span />
      {statusLabels[status]}
    </span>
  );
}
function createdLabel(value: string) {
  return new Intl.DateTimeFormat("pt-AO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Luanda",
  }).format(new Date(value));
}
function shortDate(value: string) {
  return new Intl.DateTimeFormat("pt-AO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Luanda",
  }).format(new Date(`${value}T12:00:00+01:00`));
}
function Loading() {
  return (
    <div className="load-state" role="status">
      <LoaderCircle size={25} className="spinning" />
      <p>A carregar…</p>
    </div>
  );
}
function Pagination({
  page,
  total,
  onChange,
}: {
  page: number;
  total: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="crm-pagination">
      <span>
        {total} registo(s) · Página {page} de{" "}
        {Math.max(1, Math.ceil(total / 25))}
      </span>
      <div className="button-row">
        <button
          className="icon-button bordered"
          aria-label="Página anterior"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <ArrowLeft size={16} />
        </button>
        <button
          className="icon-button bordered"
          aria-label="Página seguinte"
          disabled={page * 25 >= total}
          onClick={() => onChange(page + 1)}
        >
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
type Detail =
  | { kind: "reservation" | "customer"; id: string }
  | { kind: "new-reservation" | "new-customer" };

export function Crm({
  section,
  notify,
  onDirty,
}: {
  section: "reservas" | "clientes";
  notify: Notify;
  onDirty: (value: boolean) => void;
}) {
  const [search, setSearch] = useState(""),
    [range, setRange] = useState("all"),
    [status, setStatus] = useState(""),
    [sort, setSort] = useState("latest"),
    [vip, setVip] = useState(false),
    [page, setPage] = useState(1),
    [detail, setDetail] = useState<Detail | null>(null);
  const dirty = useRef(false),
    saving = useRef(false);
  const setDirty = useCallback(
    (value: boolean) => {
      dirty.current = value;
      onDirty(value);
    },
    [onDirty],
  );
  const q = useDebounced(search),
    isReservations = section === "reservas";
  const params = new URLSearchParams({
    q,
    page: String(page),
    range,
    status,
    sort,
    ...(vip ? { vip: "1" } : {}),
  });
  const { data, error, loading, refresh } = useList<
    ReservationList | CustomerList
  >(`${isReservations ? "reservations" : "customers"}?${params}`);
  useEffect(() => {
    setSearch("");
    setPage(1);
    setDetail(null);
    setDirty(false);
  }, [section, setDirty]);
  const open = (next: Detail | null) => {
    if (saving.current) return;
    if (
      dirty.current &&
      !confirm("Tem alterações por guardar. Fechar e descartá-las?")
    )
      return;
    setDirty(false);
    setDetail(next);
  };
  const changed = () => {
    setDirty(false);
    refresh();
  };
  const onSaving = (value: boolean) => {
    saving.current = value;
  };
  const list = data as ReservationList | null;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {isReservations
              ? "CADA VISITA COMEÇA COM UM PEDIDO"
              : "CONHECER QUEM VOLTA À NOSSA MESA"}
          </span>
          <h1>{isReservations ? "Reservas" : "Clientes"}</h1>
          <p>
            {isReservations
              ? "Os pedidos do website e as reservas da sua equipa, num só lugar."
              : "Contactos, preferências de atendimento e o histórico de cada visita."}
          </p>
        </div>
        <button
          className="button primary"
          onClick={() =>
            open({ kind: isReservations ? "new-reservation" : "new-customer" })
          }
        >
          <Plus size={17} />
          {isReservations ? "Nova reserva" : "Novo cliente"}
        </button>
      </div>
      {isReservations && list && (
        <div className="crm-stats">
          {[
            {
              label: "Reservas de hoje",
              value: list.stats.today,
              icon: CalendarDays,
              note: shortDate(luandaDate()),
            },
            {
              label: "Pedidos pendentes",
              value: list.stats.pending,
              icon: Clock3,
              note: "A aguardar análise",
            },
            {
              label: "Reservas confirmadas",
              value: list.stats.confirmed,
              icon: CheckCircle2,
              note: "Aceites pela equipa",
            },
            {
              label: "Reservas concluídas",
              value: list.stats.completed,
              icon: Check,
              note: "Visitas realizadas",
            },
          ].map((stat) => (
            <article className="card crm-stat" key={stat.label}>
              <div>
                <span>{stat.label}</span>
                <stat.icon size={18} />
              </div>
              <strong>{stat.value}</strong>
              <small>{stat.note}</small>
            </article>
          ))}
        </div>
      )}
      <section className="card crm-list">
        <div className="crm-toolbar">
          <div className="search-field">
            <Search size={18} />
            <input
              type="search"
              placeholder="Procurar por nome ou telefone…"
              aria-label="Procurar por nome ou telefone"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          {isReservations ? (
            <select
              aria-label="Filtrar reservas por estado"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos os estados</option>
              {Object.entries(statusLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          ) : (
            <>
              <select
                aria-label="Ordenar clientes"
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value);
                  setPage(1);
                }}
              >
                <option value="latest">Última reserva</option>
                <option value="count">Número de reservas</option>
                <option value="name">Nome</option>
              </select>
              <label className="checkbox-label vip-filter">
                <input
                  type="checkbox"
                  checked={vip}
                  onChange={(e) => {
                    setVip(e.target.checked);
                    setPage(1);
                  }}
                />
                <Star size={15} />
                Só VIP
              </label>
            </>
          )}
          <button
            className="icon-button bordered"
            aria-label="Actualizar lista"
            title="Actualizar lista"
            onClick={refresh}
          >
            <RefreshCw size={16} />
          </button>
        </div>
        {isReservations && (
          <div className="crm-range">
            <div className="tabs">
              {[
                ["all", "Todas"],
                ["today", "Hoje"],
                ["tomorrow", "Amanhã"],
                ["week", "Esta semana"],
              ].map(([key, label]) => (
                <button
                  className={range === key ? "selected" : ""}
                  key={key}
                  onClick={() => {
                    setRange(key);
                    setPage(1);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <span>
              <span className="live-dot" />
              Actualização automática
            </span>
          </div>
        )}
        {error && (
          <div className="crm-error">
            <FormError message={error} />
            <button className="text-link" onClick={refresh}>
              Tentar novamente
            </button>
          </div>
        )}
        {!data && error ? null : loading && !data ? (
          <Loading />
        ) : !data?.items.length ? (
          <Empty
            icon={
              isReservations ? <CalendarDays size={29} /> : <Users size={29} />
            }
            title={
              isReservations
                ? "Ainda não há reservas nesta selecção."
                : "Ainda não há clientes nesta selecção."
            }
            description={
              search || status || range !== "all" || vip
                ? "Experimente outro nome, telefone ou filtro."
                : "Os contactos recebidos pelo website aparecem aqui automaticamente. Também pode criar um registo manual."
            }
          />
        ) : isReservations ? (
          <div className="crm-reservations-table">
            <div className="crm-table-head">
              <span>CLIENTE</span>
              <span>DATA E HORA</span>
              <span>PESSOAS</span>
              <span>ESTADO</span>
              <span />
            </div>
            {(data as ReservationList).items.map((r) => (
              <button
                className="crm-reservation-row"
                key={r.id}
                onClick={() => open({ kind: "reservation", id: r.id })}
              >
                <div className="crm-contact">
                  <strong>
                    {r.contact_name}
                    {r.vip && (
                      <Star
                        size={13}
                        className="vip-star"
                        aria-label="Cliente VIP"
                      />
                    )}
                  </strong>
                  <span>{r.contact_phone}</span>
                  <small>
                    {r.source === "website" ? "Website" : "Registo da equipa"}
                  </small>
                </div>
                <div className="crm-appointment">
                  <strong>{shortDate(r.date)}</strong>
                  <span>{r.time} · Luanda</span>
                </div>
                <span className="crm-guests">
                  <Users size={14} />
                  {r.guests}
                  <small> pessoas</small>
                </span>
                <Status status={r.status} />
                <ArrowRight size={17} />
              </button>
            ))}
          </div>
        ) : (
          <div className="crm-customers-table">
            <div className="crm-customer-head crm-table-head">
              <span>CLIENTE</span>
              <span>RESERVAS</span>
              <span>ÚLTIMA RESERVA</span>
              <span />
            </div>
            {(data as CustomerList).items.map((c) => (
              <button
                className="crm-customer-row"
                key={c.id}
                onClick={() => open({ kind: "customer", id: c.id })}
              >
                <div className="crm-contact">
                  <strong>
                    {c.name}
                    {c.vip && (
                      <span className="vip-badge">
                        <Star size={11} />
                        VIP
                      </span>
                    )}
                  </strong>
                  <span>{c.phone}</span>
                  {c.email && <small>{c.email}</small>}
                </div>
                <div className="crm-count">
                  <strong>{c.reservation_count}</strong>
                  <small>{c.completed_visits} visita(s) concluída(s)</small>
                </div>
                <div className="crm-last-reservation">
                  {c.last_reservation ? (
                    <>
                      <strong>
                        {shortDate(c.last_reservation.slice(0, 10))}
                      </strong>
                      <span>{c.last_reservation.slice(11, 16)}</span>
                    </>
                  ) : (
                    <span>Sem reservas</span>
                  )}
                </div>
                <ArrowRight size={17} />
              </button>
            ))}
          </div>
        )}
        {data && (
          <Pagination page={page} total={data.total} onChange={setPage} />
        )}
      </section>
      <p className="crm-privacy-note">
        <ShieldCheck size={15} />
        {isReservations
          ? "Os pedidos do website chegam pendentes. A confirmação é sempre feita pela equipa."
          : "Os contactos são usados para atendimento. Uma reserva não autoriza comunicações de marketing."}
      </p>
      {detail?.kind === "new-reservation" && (
        <Modal
          title="Uma nova reserva."
          subtitle="Para pedidos recebidos por telefone ou presencialmente."
          onClose={() => open(null)}
        >
          <NewReservation
            notify={notify}
            onDirty={setDirty}
            onSaving={onSaving}
            onSaved={(id) => {
              changed();
              setDetail({ kind: "reservation", id });
            }}
          />
        </Modal>
      )}
      {detail?.kind === "new-customer" && (
        <Modal
          title="Um novo contacto."
          subtitle="O telefone permite reconhecer este cliente nas próximas visitas."
          onClose={() => open(null)}
        >
          <CustomerForm
            notify={notify}
            onDirty={setDirty}
            onSaving={onSaving}
            onSaved={(result) => {
              changed();
              setDetail({ kind: "customer", id: result.customer.id });
            }}
          />
        </Modal>
      )}
      {detail?.kind === "reservation" && (
        <ReservationDialog
          key={detail.id}
          id={detail.id}
          onClose={() => open(null)}
          onCustomer={(id) => open({ kind: "customer", id })}
          onChanged={changed}
          onDirty={setDirty}
          onSaving={onSaving}
          notify={notify}
        />
      )}
      {detail?.kind === "customer" && (
        <CustomerDialog
          key={detail.id}
          id={detail.id}
          onClose={() => open(null)}
          onReservation={(id) => open({ kind: "reservation", id })}
          onChanged={changed}
          onDirty={setDirty}
          onSaving={onSaving}
          notify={notify}
        />
      )}
    </>
  );
}

function NewReservation({
  onSaved,
  onDirty,
  onSaving,
  notify,
}: {
  onSaved: (id: string) => void;
  onDirty: (v: boolean) => void;
  onSaving: (v: boolean) => void;
  notify: Notify;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const request = useRef<{ fingerprint: string; key: string } | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    onSaving(true);
    setError("");
    const form = Object.fromEntries(new FormData(e.currentTarget));
    const payload = { ...form, guests: Number(form.guests) };
    const fingerprint = JSON.stringify(payload);
    if (request.current?.fingerprint !== fingerprint)
      request.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const response = await fetch("/api/crm/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": request.current.key,
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      notify("Reserva registada e associada ao cliente.");
      onSaved(result.reservation.id);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Sem ligação. Tente novamente.",
      );
    } finally {
      setBusy(false);
      onSaving(false);
    }
  }
  return (
    <form
      className="modal-form"
      onSubmit={submit}
      onChange={() => onDirty(true)}
    >
      <label>
        Nome completo
        <input name="name" required minLength={2} maxLength={120} autoFocus />
      </label>
      <div className="form-grid">
        <label>
          Telefone
          <input
            name="phone"
            type="tel"
            required
            maxLength={50}
            placeholder="+244 9XX XXX XXX"
          />
        </label>
        <label>
          Email (opcional)
          <input name="email" type="email" maxLength={254} />
        </label>
      </div>
      <div className="form-grid">
        <label>
          Data da reserva
          <input name="date" type="date" defaultValue={luandaDate()} required />
        </label>
        <label>
          Hora de Luanda
          <input name="time" type="time" required />
        </label>
      </div>
      <div className="form-grid">
        <label>
          Número de pessoas
          <input
            name="guests"
            type="number"
            min={1}
            max={50}
            defaultValue={2}
            required
          />
        </label>
        <label>
          Ocasião (opcional)
          <input name="occasion" maxLength={160} />
        </label>
      </div>
      <label>
        Observações do pedido (opcional)
        <textarea name="notes" rows={3} maxLength={2000} />
      </label>
      <p className="field-help">
        Um telefone já registado associa esta reserva ao contacto existente.
      </p>
      <FormError message={error} />
      <div className="modal-actions">
        <button className="button primary" disabled={busy}>
          {busy ? "A guardar…" : "Criar reserva"}
          <Check size={16} />
        </button>
      </div>
    </form>
  );
}

function ReservationDialog({
  id,
  onClose,
  onCustomer,
  onChanged,
  onDirty,
  onSaving,
  notify,
}: {
  id: string;
  onClose: () => void;
  onCustomer: (id: string) => void;
  onChanged: () => void;
  onDirty: (v: boolean) => void;
  onSaving: (v: boolean) => void;
  notify: Notify;
}) {
  const [data, setData] = useState<ReservationDetail | null>(null),
    [error, setError] = useState("");
  const load = useCallback(
    () =>
      api<ReservationDetail>(`crm/reservations/${id}`)
        .then((value) => {
          setData(value);
          setError("");
        })
        .catch((e) => setError(e.message)),
    [id],
  );
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <Modal
      title="Detalhes da reserva"
      subtitle="Cada pedido, acompanhado com atenção."
      wide
      onClose={onClose}
    >
      {error ? (
        <div className="modal-form">
          <FormError message={error} />
          <button className="button secondary" onClick={load}>
            Tentar novamente
          </button>
        </div>
      ) : !data ? (
        <Loading />
      ) : (
        <ReservationForm
          key={data.reservation.revision}
          data={data}
          onCustomer={onCustomer}
          onDirty={onDirty}
          onSaving={onSaving}
          notify={notify}
          onSaved={(next) => {
            setData(next);
            onChanged();
          }}
        />
      )}
    </Modal>
  );
}
function ReservationForm({
  data,
  onCustomer,
  onDirty,
  onSaving,
  notify,
  onSaved,
}: {
  data: ReservationDetail;
  onCustomer: (id: string) => void;
  onDirty: (v: boolean) => void;
  onSaving: (v: boolean) => void;
  notify: Notify;
  onSaved: (data: ReservationDetail) => void;
}) {
  const r = data.reservation,
    formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [correct, setCorrect] = useState(false),
    [search, setSearch] = useState(""),
    [customerId, setCustomerId] = useState(r.customer_id);
  const q = useDebounced(search),
    customers = useList<CustomerList>(
      `customers?q=${encodeURIComponent(q)}&sort=name`,
    );
  async function save(status?: ReservationStatus) {
    if (!formRef.current!.reportValidity()) return;
    setBusy(true);
    onSaving(true);
    setError("");
    const fields = Object.fromEntries(new FormData(formRef.current!));
    try {
      const next = await api<ReservationDetail>(
        `crm/reservations/${r.id}`,
        {
          revision: r.revision,
          date: fields.date,
          time: fields.time,
          guests: Number(fields.guests),
          internalNotes: fields.internalNotes,
          customerId,
          ...(status ? { status } : {}),
        },
        "PATCH",
      );
      onSaved(next);
      notify(
        status
          ? `Reserva ${statusLabels[status].toLocaleLowerCase("pt")}.`
          : "Reserva actualizada.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      onSaving(false);
    }
  }
  return (
    <div className="reservation-detail">
      <div className="crm-detail-summary">
        <div>
          <h3>{r.contact_name}</h3>
          <a href={`tel:${r.contact_normalized_phone}`}>
            <Phone size={14} />
            {r.contact_phone}
          </a>
          {r.contact_email && (
            <a href={`mailto:${r.contact_email}`}>{r.contact_email}</a>
          )}
        </div>
        <Status status={r.status} />
      </div>
      <div className="crm-detail-links">
        <button className="text-link" onClick={() => onCustomer(r.customer_id)}>
          <Users size={15} />
          Perfil: {r.customer_name}
          <ArrowRight size={14} />
        </button>
        <a
          className="button secondary small"
          href={`https://wa.me/${r.contact_normalized_phone.replace(/\D/g, "")}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MessageCircle size={15} />
          WhatsApp
          <ExternalLink size={13} />
        </a>
      </div>
      <div className="crm-request-meta">
        <span>
          Origem: {r.source === "website" ? "Website" : "Equipa Palace"}
        </span>
        <span>Recebida em {createdLabel(r.created_at)}</span>
      </div>
      <div className="crm-request-notes">
        {r.occasion && (
          <div>
            <span>Ocasião especial</span>
            <p>{r.occasion}</p>
          </div>
        )}
        {r.customer_notes && (
          <div>
            <span>Observações do cliente</span>
            <p>{r.customer_notes}</p>
          </div>
        )}
      </div>
      <form
        ref={formRef}
        className="crm-detail-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        onChange={() => onDirty(true)}
      >
        <div className="form-grid">
          <label>
            Data da reserva
            <input
              name="date"
              type="date"
              defaultValue={r.date}
              required
              disabled={busy}
            />
          </label>
          <label>
            Hora de Luanda
            <input
              name="time"
              type="time"
              defaultValue={r.time}
              required
              disabled={busy}
            />
          </label>
        </div>
        <label>
          Número de pessoas
          <input
            name="guests"
            type="number"
            min={1}
            max={50}
            defaultValue={r.guests}
            required
            disabled={busy}
          />
        </label>
        <label>
          Observação interna
          <textarea
            name="internalNotes"
            rows={3}
            maxLength={3000}
            defaultValue={r.internal_notes}
            disabled={busy}
            placeholder="Detalhes autorizados e relevantes para o atendimento."
          />
        </label>
        <button
          type="button"
          className="text-link"
          onClick={() => setCorrect(!correct)}
        >
          Corrigir associação ao cliente
          <Pencil size={13} />
        </button>
        {correct && (
          <div className="crm-association">
            <label>
              Procurar cliente
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nome ou telefone"
              />
            </label>
            <label>
              Cliente associado
              <select
                value={customerId}
                onChange={(e) => {
                  setCustomerId(e.target.value);
                  onDirty(true);
                }}
              >
                <option value={r.customer_id}>
                  {r.customer_name} · {r.customer_phone}
                </option>
                {customers.data?.items
                  .filter((c) => c.id !== r.customer_id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.phone}
                    </option>
                  ))}
              </select>
            </label>
            <p className="field-help">
              Os dados enviados no pedido ficam preservados. O histórico passa a
              estar associado ao perfil seleccionado.
            </p>
          </div>
        )}
        <FormError message={error} />
        <div className="crm-save-row">
          <button className="button secondary" disabled={busy}>
            {busy ? "A guardar…" : "Guardar alterações"}
          </button>
        </div>
      </form>
      <div className="crm-status-actions">
        {statusTransitions[r.status].map((next) => (
          <button
            key={next}
            type="button"
            className={`button ${next === "confirmed" || next === "completed" ? "primary" : "secondary"}`}
            disabled={busy}
            onClick={() => save(next)}
          >
            {next === "confirmed" ? (
              <Check size={16} />
            ) : next === "completed" ? (
              <CheckCircle2 size={16} />
            ) : (
              <X size={16} />
            )}
            {
              {
                confirmed: "Confirmar reserva",
                declined: "Recusar pedido",
                cancelled: "Cancelar reserva",
                completed: "Marcar como concluída",
                pending: "Pendente",
              }[next]
            }
          </button>
        ))}
        {statusTransitions[r.status].length === 0 && (
          <p className="field-help">
            Este pedido está {statusLabels[r.status].toLowerCase()}. Os dados de
            atendimento continuam disponíveis no histórico.
          </p>
        )}
      </div>
      {data.audit.length > 0 && (
        <details className="crm-audit">
          <summary>Histórico de alterações</summary>
          {data.audit.map((entry, index) => (
            <div key={index}>
              <span>
                {entry.action === "created"
                  ? "Pedido registado"
                  : entry.metadata.fromStatus !== entry.metadata.toStatus
                    ? `Estado: ${statusLabels[entry.metadata.toStatus as ReservationStatus] || ""}`
                    : "Dados actualizados"}
              </span>
              <small>
                {createdLabel(entry.created_at)} ·{" "}
                {entry.actor_name || "Website"}
              </small>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

function CustomerForm({
  customer,
  onSaved,
  onDirty,
  onSaving,
  notify,
}: {
  customer?: Customer;
  onSaved: (data: CustomerDetail) => void;
  onDirty: (v: boolean) => void;
  onSaving: (v: boolean) => void;
  notify: Notify;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    onSaving(true);
    setError("");
    const values = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const next = await api<CustomerDetail>(
        customer ? `crm/customers/${customer.id}` : "crm/customers",
        {
          ...values,
          vip: values.vip === "on",
          ...(customer ? { revision: customer.revision } : {}),
        },
        customer ? "PATCH" : "POST",
      );
      onSaved(next);
      notify(customer ? "Dados do cliente guardados." : "Cliente criado.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      onSaving(false);
    }
  }
  return (
    <form
      className="modal-form customer-edit-form"
      onSubmit={submit}
      onChange={() => onDirty(true)}
    >
      <label>
        Nome completo
        <input
          name="name"
          defaultValue={customer?.name}
          required
          minLength={2}
          maxLength={120}
          autoFocus={!customer}
        />
      </label>
      <div className="form-grid">
        <label>
          Telefone
          <input
            name="phone"
            type="tel"
            defaultValue={customer?.phone}
            required
            maxLength={50}
            placeholder="+244 9XX XXX XXX"
          />
        </label>
        <label>
          Email (opcional)
          <input
            name="email"
            type="email"
            defaultValue={customer?.email || ""}
            maxLength={254}
          />
        </label>
      </div>
      <label>
        Aniversário (opcional)
        <input
          name="birthday"
          type="date"
          defaultValue={customer?.birthday || ""}
          max={luandaDate()}
        />
      </label>
      <label className="checkbox-label vip-toggle">
        <input
          name="vip"
          type="checkbox"
          defaultChecked={customer?.vip || false}
        />
        <Star size={17} />
        Identificar como cliente VIP<small>Apenas para a equipa Palace.</small>
      </label>
      <label>
        Observações internas
        <textarea
          name="notes"
          defaultValue={customer?.notes || ""}
          rows={3}
          maxLength={3000}
          placeholder="Informações autorizadas e relevantes para o atendimento."
        />
      </label>
      <FormError message={error} />
      <div className="modal-actions">
        <button className="button primary" disabled={busy}>
          {busy
            ? "A guardar…"
            : customer
              ? "Guardar dados do cliente"
              : "Criar cliente"}
          <Check size={16} />
        </button>
      </div>
    </form>
  );
}
function CustomerDialog({
  id,
  onClose,
  onReservation,
  onChanged,
  onDirty,
  onSaving,
  notify,
}: {
  id: string;
  onClose: () => void;
  onReservation: (id: string) => void;
  onChanged: () => void;
  onDirty: (v: boolean) => void;
  onSaving: (v: boolean) => void;
  notify: Notify;
}) {
  const [data, setData] = useState<CustomerDetail | null>(null),
    [error, setError] = useState(""),
    [editing, setEditing] = useState(false);
  const load = useCallback(
    () =>
      api<CustomerDetail>(`crm/customers/${id}`)
        .then((value) => {
          setData(value);
          setError("");
        })
        .catch((e) => setError(e.message)),
    [id],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const now = Date.now(),
    upcoming =
      data?.reservations.filter(
        (r) => new Date(`${r.date}T${r.time}:00+01:00`).getTime() >= now,
      ) || [],
    past =
      data?.reservations.filter(
        (r) => new Date(`${r.date}T${r.time}:00+01:00`).getTime() < now,
      ) || [];
  return (
    <Modal
      title="Perfil do cliente"
      subtitle="A atenção a cada visita, com memória."
      wide
      onClose={onClose}
    >
      {error ? (
        <div className="modal-form">
          <FormError message={error} />
          <button className="button secondary" onClick={load}>
            Tentar novamente
          </button>
        </div>
      ) : !data ? (
        <Loading />
      ) : (
        <>
          <div className="customer-profile">
            <div className="crm-detail-summary">
              <div>
                <h3>{data.customer.name}</h3>
                <a href={`tel:${data.customer.normalized_phone}`}>
                  <Phone size={14} />
                  {data.customer.phone}
                </a>
                {data.customer.email && (
                  <a href={`mailto:${data.customer.email}`}>
                    {data.customer.email}
                  </a>
                )}
              </div>
              {data.customer.vip && (
                <span className="vip-badge">
                  <Star size={13} />
                  Cliente VIP
                </span>
              )}
            </div>
            <div className="crm-customer-metrics">
              <div>
                <strong>{data.customer.reservation_count}</strong>
                <span>Total de reservas</span>
              </div>
              <div>
                <strong>{data.customer.completed_visits}</strong>
                <span>Visitas concluídas</span>
              </div>
            </div>
            <div className="customer-record-info">
              <span>Registo: {createdLabel(data.customer.created_at)}</span>
              <span>
                Origem:{" "}
                {data.customer.source === "website"
                  ? "Website"
                  : "Registo manual"}
              </span>
              {data.customer.birthday && (
                <span>Aniversário: {shortDate(data.customer.birthday)}</span>
              )}
            </div>
            {!editing && data.customer.notes && (
              <div className="profile-notes">
                <span>Observações internas</span>
                <p>{data.customer.notes}</p>
              </div>
            )}
            <button
              className="text-link"
              onClick={() => {
                if (editing) {
                  if (
                    !confirm(
                      "Fechar a edição? Guarde as alterações antes de sair.",
                    )
                  )
                    return;
                  onDirty(false);
                }
                setEditing(!editing);
              }}
            >
              <Pencil size={14} />
              {editing ? "Fechar edição" : "Editar dados e identificação VIP"}
            </button>
          </div>
          {editing && (
            <CustomerForm
              key={data.customer.revision}
              customer={data.customer}
              notify={notify}
              onDirty={onDirty}
              onSaving={onSaving}
              onSaved={(next) => {
                setData(next);
                setEditing(false);
                onChanged();
              }}
            />
          )}
          <div className="customer-history">
            <h3>Histórico de reservas</h3>
            {!data.reservations.length ? (
              <p className="field-help">Este cliente ainda não tem reservas.</p>
            ) : (
              [
                { label: "Reservas futuras", items: upcoming },
                { label: "Reservas anteriores", items: past },
              ].map(
                (group) =>
                  group.items.length > 0 && (
                    <section key={group.label}>
                      <h4>{group.label}</h4>
                      {group.items.map((r) => (
                        <button
                          key={r.id}
                          className="customer-history-row"
                          onClick={() => onReservation(r.id)}
                        >
                          <CalendarDays size={17} />
                          <div>
                            <strong>
                              {shortDate(r.date)} · {r.time}
                            </strong>
                            <span>
                              {r.guests} pessoa(s)
                              {r.occasion ? ` · ${r.occasion}` : ""}
                            </span>
                          </div>
                          <Status status={r.status} />
                          <ArrowRight size={14} />
                        </button>
                      ))}
                    </section>
                  ),
              )
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
