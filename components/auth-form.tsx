"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  LockKeyhole,
  Eye,
  EyeOff,
  AlertCircle,
} from "lucide-react";
import { Brand } from "./brand";
export function AuthForm({
  setup,
  needsToken,
}: {
  setup: boolean;
  needsToken?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [show, setShow] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch(`/api/auth/${setup ? "setup" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      window.location.href = "/studio";
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Verifique a ligação e tente novamente.",
      );
      setBusy(false);
    }
  }
  return (
    <main className="auth-layout">
      <section className="auth-editorial">
        <Brand />
        <div className="auth-heading">
          <span className="eyebrow">PALACE MENU STUDIO</span>
          <h1>
            A arte de receber.
            <br />
            <em>Em cada detalhe.</em>
          </h1>
          <div className="gold-rule" />
          <p>
            O seu menu, sempre actualizado.
            <br />A experiência Palace começa aqui.
          </p>
        </div>
        <span className="eyebrow">PALACE LOUNGE · LUANDA</span>
      </section>
      <section className="auth-panel">
        <div className="auth-form">
          <span className="outlined-icon">
            <LockKeyhole size={23} />
          </span>
          <span className="eyebrow">
            {setup ? "BEM-VINDO AO SEU STUDIO" : "ÁREA DA EQUIPA"}
          </span>
          <h2>{setup ? "O primeiro passo." : "Bem-vindo de volta."}</h2>
          <p>
            {setup
              ? "Crie a primeira conta administrativa para começar a preparar os menus do Palace."
              : "Entre para preparar o próximo menu do Palace."}
          </p>
          <form onSubmit={submit}>
            {setup && (
              <label>
                Nome
                <input
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={160}
                  placeholder="O seu nome"
                />
              </label>
            )}
            <label>
              Email
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                placeholder="O seu email profissional"
              />
            </label>
            <label>
              Palavra-passe
              <div className="password-field">
                <input
                  name="password"
                  type={show ? "text" : "password"}
                  autoComplete={setup ? "new-password" : "current-password"}
                  minLength={setup ? 12 : 1}
                  maxLength={128}
                  required
                  placeholder={
                    setup ? "Pelo menos 12 caracteres" : "A sua palavra-passe"
                  }
                />
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setShow(!show)}
                  aria-label={
                    show ? "Ocultar palavra-passe" : "Mostrar palavra-passe"
                  }
                >
                  {show ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>
            {setup && needsToken && (
              <label>
                Código de configuração
                <input
                  name="token"
                  type="password"
                  required
                  autoComplete="off"
                />
                <small>O código SETUP_TOKEN configurado no servidor.</small>
              </label>
            )}
            {error && (
              <div className="notice" role="alert">
                <AlertCircle size={18} />
                {error}
              </div>
            )}
            <button className="button primary full" disabled={busy}>
              {busy
                ? "A entrar…"
                : setup
                  ? "Criar conta e começar"
                  : "Entrar no Studio"}
              <ArrowRight size={17} />
            </button>
          </form>
          <p className="auth-note">
            <LockKeyhole size={13} /> Acesso exclusivo à equipa do Palace Lounge
          </p>
          <Link className="text-link" href="/menu">
            Consultar o menu público <ArrowRight size={14} />
          </Link>
        </div>
      </section>
    </main>
  );
}
