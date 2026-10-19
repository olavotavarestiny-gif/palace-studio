"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  Home,
  Images,
  LayoutGrid,
  LogOut,
  Menu,
  Plus,
  QrCode,
  Settings2,
  UtensilsCrossed,
  Users,
  X,
  AlertCircle,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { Brand } from "./brand";
import { Modal, api, FormError, type Notify } from "./ui";
import { Library } from "./library";
import { Editor } from "./editor";
import { Publications } from "./publications";
import { MenuPaper } from "./menu-paper";
import { Crm } from "./crm";
import { dateLabel, timeLabel } from "@/lib/format";
import type { StudioState } from "@/lib/types";

const nav = [
  { key: "inicio", label: "Início", href: "/studio", icon: Home },
  {
    key: "menu",
    label: "Menus",
    href: "/studio/menu",
    icon: UtensilsCrossed,
  },
  {
    key: "publicacoes",
    label: "Publicações",
    href: "/studio/publicacoes",
    icon: Images,
  },
  {
    key: "reservas",
    label: "Reservas",
    href: "/studio/reservas",
    icon: CalendarDays,
  },
  { key: "clientes", label: "Clientes", href: "/studio/clientes", icon: Users },
];
export function Studio({ section }: { section: string }) {
  const router = useRouter();
  const [data, setData] = useState<StudioState | null>(null),
    [error, setError] = useState(""),
    [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const [mobileNav, setMobileNav] = useState(false),
    [account, setAccount] = useState(false),
    [settings, setSettings] = useState(false),
    [qr, setQr] = useState(false),
    [dirty, setDirty] = useState(false);
  const notify: Notify = useCallback(
    (text, error = false) => setToast({ text, error }),
    [],
  );
  const refresh = useCallback(async () => {
    const next = await api<StudioState>("state");
    setData(next);
    setError("");
    return next;
  }, []);
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 9000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  function go(href: string) {
    if (
      dirty &&
      !confirm("Tem alterações por guardar. Sair desta página e descartá-las?")
    )
      return;
    setDirty(false);
    setMobileNav(false);
    router.push(href);
  }
  async function logout() {
    if (
      dirty &&
      !confirm("Tem alterações por guardar. Terminar sessão e descartá-las?")
    )
      return;
    try {
      await api("auth/logout", {});
      setDirty(false);
      window.location.href = "/login";
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(data!.publicUrl);
      notify("Link do menu copiado.");
    } catch {
      notify(
        "Não foi possível copiar. Seleccione e copie o endereço apresentado.",
        true,
      );
    }
  }
  return (
    <div className="studio-layout">
      {mobileNav && (
        <button
          className="sidebar-overlay"
          aria-label="Fechar navegação"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <Link
          href="/studio"
          className="sidebar-brand"
          onClick={(e) => {
            e.preventDefault();
            go("/studio");
          }}
        >
          <Brand />
          <span>PALACE STUDIO</span>
        </Link>
        <div className="sidebar-label">O SEU ESPAÇO DE CRIAÇÃO</div>
        <nav aria-label="Navegação principal">
          {nav.map((n) => (
            <div key={n.key}>
              <Link
                key={n.key}
                href={n.href}
                className={`nav-link ${section === n.key || (n.key === "menu" && section === "biblioteca") ? "active" : ""}`}
                aria-current={section === n.key ? "page" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  go(n.href);
                }}
              >
                <n.icon size={18} />
                <span>{n.label}</span>
                {section === n.key && <span className="nav-dot" />}
              </Link>
              {n.key === "menu" && ["menu", "biblioteca"].includes(section) && (
                <div className="menu-subnav">
                  {[
                    { key: "menu", label: "Menu do Dia", href: "/studio/menu" },
                    {
                      key: "biblioteca",
                      label: "Biblioteca de Pratos",
                      href: "/studio/biblioteca",
                    },
                  ].map((child) => (
                    <Link
                      key={child.key}
                      className={child.key === section ? "selected" : ""}
                      href={child.href}
                      aria-current={child.key === section ? "page" : undefined}
                      onClick={(e) => {
                        e.preventDefault();
                        go(child.href);
                      }}
                    >
                      {child.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-menu-card">
            <span className="eyebrow">SEMPRE À MÃO</span>
            <QrCode size={25} />
            <p>
              Um menu.
              <br />
              <em>Um só endereço.</em>
            </p>
            <a href="/menu" target="_blank" rel="noreferrer">
              Abrir menu digital <ArrowUpRight size={15} />
            </a>
          </div>
          <button className="nav-link" onClick={() => setSettings(true)}>
            <Settings2 size={17} />
            Definições
          </button>
          <div className="sidebar-footer">
            FEITO PARA BEM RECEBER<span>PALACE LOUNGE · LUANDA</span>
          </div>
        </div>
      </aside>
      <div className="studio-main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              aria-label="Abrir navegação"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={22} />
            </button>
            <span className="breadcrumb">
              O seu Studio <span>/</span>{" "}
              <strong>
                {section === "biblioteca"
                  ? "Menus · Biblioteca de Pratos"
                  : nav.find((n) => n.key === section)?.label}
              </strong>
            </span>
          </div>
          <div className="topbar-right">
            <a
              className="public-shortcut"
              href="/menu"
              target="_blank"
              rel="noreferrer"
            >
              Menu público <ArrowUpRight size={14} />
            </a>
            <span className="topbar-divider" />
            <div className="account-wrapper">
              <button
                className="account-button"
                onClick={() => setAccount(!account)}
                aria-expanded={account}
              >
                <span className="avatar">
                  {data?.user.name
                    .split(" ")
                    .slice(0, 2)
                    .map((n) => n[0])
                    .join("") || "P"}
                </span>
                <span className="account-label">
                  {data?.user.name || "Palace"}
                  <small>Administrador</small>
                </span>
                <ChevronDown size={14} />
              </button>
              {account && (
                <div className="account-menu">
                  <button
                    onClick={() => {
                      setSettings(true);
                      setAccount(false);
                    }}
                  >
                    <Settings2 size={16} />
                    Conta e definições
                  </button>
                  <button onClick={logout}>
                    <LogOut size={16} />
                    Terminar sessão
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="workspace">
          {!data ? (
            error ? (
              <div className="load-state">
                <AlertCircle size={30} />
                <h2>Não foi possível carregar o Studio.</h2>
                <p>{error}</p>
                <button
                  className="button secondary"
                  onClick={() => refresh().catch((e) => setError(e.message))}
                >
                  Tentar novamente
                </button>
                <a className="text-link" href="/login">
                  Entrar novamente
                </a>
              </div>
            ) : (
              <div className="load-state" role="status">
                <LoaderCircle className="spinning" size={30} />
                <p>A preparar o seu Studio…</p>
              </div>
            )
          ) : (
            <>
              {section === "inicio" && (
                <Dashboard
                  data={data}
                  go={go}
                  onQr={() => setQr(true)}
                  onCopy={copy}
                />
              )}
              {section === "biblioteca" && (
                <Library
                  data={data}
                  refresh={refresh}
                  notify={notify}
                  go={go}
                />
              )}
              {section === "menu" && (
                <Editor
                  data={data}
                  refresh={refresh}
                  notify={notify}
                  onDirty={setDirty}
                />
              )}
              {section === "publicacoes" && (
                <Publications data={data} refresh={refresh} notify={notify} />
              )}
              {(section === "reservas" || section === "clientes") && (
                <Crm
                  key={section}
                  section={section}
                  notify={notify}
                  onDirty={setDirty}
                />
              )}
              <footer className="workspace-footer">
                <span>Palace Menu Studio</span>
                <span>A arte de bem receber, em cada detalhe.</span>
                <span>LUANDA · ANGOLA</span>
              </footer>
            </>
          )}
        </main>
      </div>
      {toast && (
        <div
          className={`toast ${toast.error ? "toast-error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <AlertCircle size={21} /> : <CheckCircle2 size={21} />}
          <span>{toast.text}</span>
          <button
            className="icon-button"
            aria-label="Fechar notificação"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {qr && data && (
        <Modal
          title="Um só QR Code. Todos os dias."
          subtitle="Imprima uma vez. O conteúdo acompanha cada publicação."
          onClose={() => setQr(false)}
        >
          <div className="qr-modal">
            <img
              src="/api/qr"
              width={240}
              height={240}
              alt="QR Code para o menu digital permanente"
            />
            <code>{data.publicUrl}</code>
            <button className="text-link" onClick={copy}>
              <Copy size={15} />
              Copiar link permanente
            </button>
            <div className="button-row">
              <a className="button primary" href="/api/qr?download=1">
                <Download size={16} />
                Descarregar PNG
              </a>
              <a
                className="button secondary"
                href="/api/qr?format=svg&download=1"
              >
                <Download size={16} />
                SVG
              </a>
            </div>
            <p>
              O endereço deve ser configurado para o domínio final antes de
              imprimir o QR Code.
            </p>
          </div>
        </Modal>
      )}
      {settings && data && (
        <SettingsModal
          data={data}
          onClose={() => setSettings(false)}
          refresh={refresh}
          notify={notify}
        />
      )}
    </div>
  );
}

function Dashboard({
  data,
  go,
  onQr,
  onCopy,
}: {
  data: StudioState;
  go: (path: string) => void;
  onQr: () => void;
  onCopy: () => void;
}) {
  const pub = data.todayPublication,
    assets = pub?.assets || [];
  return (
    <>
      <div className="page-heading dashboard-heading">
        <div>
          <span className="eyebrow">
            <span className="tiny-line" />O SEU MENU, SEMPRE ACTUALIZADO
          </span>
          <h1>
            Bem-vindo ao <em>Palace Menu Studio</em>
          </h1>
          <p>Um novo dia. A mesma atenção a cada detalhe.</p>
        </div>
        <span className="date-chip">
          <CalendarDays size={16} />
          {dateLabel(data.today)}
        </span>
      </div>
      <section className="welcome-banner">
        <div className="welcome-copy">
          <span className="eyebrow">DA SUA COZINHA PARA O MUNDO</span>
          <h2>
            Um menu cuidado.
            <br />
            Uma experiência <em>memorável.</em>
          </h2>
          <p>
            Prepare o menu do dia. Publique no menu digital.
            <br />
            Leve a identidade Palace às suas redes sociais.
          </p>
          <button className="button primary" onClick={() => go("/studio/menu")}>
            Actualizar menu do dia <ArrowRight size={17} />
          </button>
          <span className="banner-note">
            <Check size={13} />
            Uma edição. Tudo actualizado.
          </span>
        </div>
        <div className="palace-art">
          <img
            src="/brand/logo.jpg"
            alt="Fachada do Palace Lounge, no logótipo oficial"
            width="973"
            height="973"
          />
          <span>PALACE LOUNGE · LUANDA</span>
        </div>
      </section>
      <div className="section-heading">
        <h2>O essencial de hoje</h2>
        <span className="eyebrow">SIMPLES. RÁPIDO. PALACE.</span>
      </div>
      <div className="dashboard-grid">
        <section className="card today-card">
          <div className="card-top">
            <span className="outlined-icon">
              <CalendarDays size={19} />
            </span>
            <span className={`status-badge ${pub ? "published" : ""}`}>
              <span />
              {pub
                ? "Publicado"
                : data.draft.items.length
                  ? "Rascunho"
                  : "Por preparar"}
            </span>
          </div>
          <span className="card-kicker">À MESA DO PALACE</span>
          <h3>Menu de hoje</h3>
          <p className="card-date">{dateLabel(data.today, true)}</p>
          <div className="menu-summary">
            <div>
              <strong>
                {pub?.items.length ||
                  data.draft.items.length.toString().padStart(2, "0")}
              </strong>
              <span>pratos {pub ? "publicados" : "no rascunho"}</span>
            </div>
            <span className="summary-divider" />
            <div>
              <strong className="time-value">
                {pub ? timeLabel(pub.published_at) : "—"}
              </strong>
              <span>última publicação</span>
            </div>
          </div>
          <div className="card-bottom">
            <span>
              {pub
                ? "O menu de hoje está disponível."
                : "Tudo começa com uma boa selecção."}
            </span>
            <button className="text-link" onClick={() => go("/studio/menu")}>
              Editar menu <ArrowRight size={16} />
            </button>
          </div>
        </section>
        <section className="card digital-card">
          <div className="card-top">
            <span className="outlined-icon">
              <QrCode size={19} />
            </span>
            <span className="mini-label">UM LINK PERMANENTE</span>
          </div>
          <span className="card-kicker">SEMPRE DISPONÍVEL</span>
          <h3>Menu digital</h3>
          <p>
            {pub
              ? "O menu publicado já pode ser consultado."
              : "O seu endereço está pronto para receber o menu."}
          </p>
          <div className="url-box">
            <span>{data.publicUrl.replace(/^https?:\/\//, "")}</span>
            <button
              className="icon-button"
              onClick={onCopy}
              aria-label="Copiar link"
            >
              <Copy size={15} />
            </button>
          </div>
          <div className="digital-actions">
            <a
              className="text-link"
              href="/menu"
              target="_blank"
              rel="noreferrer"
            >
              Abrir menu <ArrowUpRight size={16} />
            </a>
            <button className="text-link" onClick={onQr}>
              <QrCode size={16} />
              QR Code
            </button>
          </div>
          <div className="card-bottom">
            <ShieldCheck size={14} />
            <span>
              {pub
                ? "Público · sem necessidade de login"
                : "A aguardar a publicação de hoje"}
            </span>
          </div>
        </section>
        <section className="card publication-card">
          <div className="card-top">
            <span className="outlined-icon">
              <Images size={19} />
            </span>
            <span className="mini-label">PRONTAS PARA PARTILHAR</span>
          </div>
          <span className="card-kicker">A SUA MARCA, EM CADA PUBLICAÇÃO</span>
          <h3>Publicações</h3>
          <div className="mini-publications">
            {(["feed", "story"] as const).map((format) => {
              const asset = assets.find((a) => a.format === format);
              return (
                <div key={format} className={`mini-publication ${format}`}>
                  <div className="mini-publication-paper">
                    {asset ? (
                      <img
                        src={`/api/assets/${asset.id}`}
                        alt={`Publicação ${format}`}
                      />
                    ) : (
                      <>
                        <span>PALACE LOUNGE</span>
                        <strong>
                          Menu
                          <br />
                          do Dia
                        </strong>
                        <i />
                        <i />
                        <i />
                      </>
                    )}
                  </div>
                  <span>
                    {format === "feed" ? "Instagram Feed" : "Stories / Status"}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="download-row">
            {["feed", "story"].map((f) =>
              assets.some((a) => a.format === f) ? (
                <a
                  key={f}
                  href={`/api/exports/${pub!.id}/${f}`}
                  className="button secondary small"
                >
                  <Download size={14} />
                  {f === "feed" ? "Feed" : "Story"}
                </a>
              ) : (
                <button
                  key={f}
                  className="button secondary small"
                  disabled
                  title="Publique um menu para gerar as imagens"
                >
                  <Download size={14} />
                  {f === "feed" ? "Feed" : "Story"}
                </button>
              ),
            )}
          </div>
          {!assets.length && (
            <span className="publication-hint">
              Geradas automaticamente ao publicar.
            </span>
          )}
        </section>
      </div>
      <section className="workflow-strip">
        <div className="workflow-intro">
          <span className="eyebrow">DO PRIMEIRO PRATO À PUBLICAÇÃO</span>
          <h2>Três passos. Poucos minutos.</h2>
        </div>
        {[
          {
            n: "01",
            title: "Escolha os pratos",
            desc: "A sua biblioteca, sempre à mão.",
            href: "/studio/biblioteca",
            icon: UtensilsCrossed,
          },
          {
            n: "02",
            title: "Prepare o menu",
            desc: "Organize e dê o último toque.",
            href: "/studio/menu",
            icon: LayoutGrid,
          },
          {
            n: "03",
            title: "Publique e partilhe",
            desc: "Menu online. Imagens prontas.",
            href: "/studio/publicacoes",
            icon: Images,
          },
        ].map((step) => (
          <button
            className="workflow-step"
            key={step.n}
            onClick={() => go(step.href)}
          >
            <span className="step-number">{step.n}</span>
            <div>
              <strong>{step.title}</strong>
              <span>{step.desc}</span>
            </div>
            <ArrowUpRight size={16} />
          </button>
        ))}
      </section>
      {!data.dishes.length && (
        <div className="getting-started">
          <div>
            <span className="outlined-icon">
              <Plus size={20} />
            </span>
            <div>
              <h3>Vamos preparar a sua biblioteca?</h3>
              <p>
                Adicione os pratos e categorias oficiais. Nos próximos dias,
                basta seleccionar.
              </p>
            </div>
          </div>
          <button
            className="text-link"
            onClick={() => go("/studio/biblioteca")}
          >
            Adicionar primeiro prato <ArrowRight size={16} />
          </button>
        </div>
      )}
    </>
  );
}

function SettingsModal({
  data,
  onClose,
  refresh,
  notify,
}: {
  data: StudioState;
  onClose: () => void;
  refresh: () => Promise<StudioState>;
  notify: Notify;
}) {
  const [tab, setTab] = useState("restaurant"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = Object.fromEntries(new FormData(e.currentTarget));
    if (form.newPassword === "") delete form.newPassword;
    try {
      await api(tab === "restaurant" ? "settings" : "account", form);
      await refresh();
      notify("Definições guardadas.");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Conta e definições"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="tabs">
        <button
          className={tab === "restaurant" ? "selected" : ""}
          onClick={() => {
            setTab("restaurant");
            setError("");
          }}
        >
          Restaurante
        </button>
        <button
          className={tab === "account" ? "selected" : ""}
          onClick={() => {
            setTab("account");
            setError("");
          }}
        >
          A minha conta
        </button>
      </div>
      <form className="modal-form" key={tab} onSubmit={submit}>
        {tab === "restaurant" ? (
          <>
            <label>
              Nome do restaurante
              <input
                name="restaurantName"
                defaultValue={data.settings.restaurantName}
                required
                maxLength={160}
              />
            </label>
            <label>
              Website oficial (opcional)
              <input
                name="website"
                type="url"
                defaultValue={data.settings.website}
                placeholder="https://…"
              />
            </label>
            <label>
              Contacto oficial (opcional)
              <input
                name="contact"
                defaultValue={data.settings.contact}
                placeholder="Telefone ou email"
                maxLength={100}
              />
            </label>
            <label>
              Link permanente do menu
              <input value={data.publicUrl} readOnly />
              <small>Definido na variável PUBLIC_URL do servidor.</small>
            </label>
          </>
        ) : (
          <>
            <label>
              Nome
              <input
                name="name"
                defaultValue={data.user.name}
                required
                maxLength={160}
              />
            </label>
            <label>
              Email
              <input value={data.user.email} readOnly />
            </label>
            <label>
              Palavra-passe actual
              <input
                name="currentPassword"
                type="password"
                required
                autoComplete="current-password"
              />
            </label>
            <label>
              Nova palavra-passe (opcional)
              <input
                name="newPassword"
                type="password"
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
              />
              <small>
                Deixe vazio para manter a actual. Mínimo de 12 caracteres.
              </small>
            </label>
          </>
        )}
        <FormError message={error} />
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "A guardar…" : "Guardar alterações"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
