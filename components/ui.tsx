"use client";
import { useEffect, useRef, useId } from "react";
import { X, ArrowRight, AlertCircle } from "lucide-react";
export async function api<T = unknown>(
  url: string,
  data?: unknown,
  method = "POST",
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(
      `/api/${url}`,
      data === undefined
        ? { cache: "no-store" }
        : {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          },
    );
  } catch {
    throw new Error(
      "Sem ligação. O seu trabalho continua nesta página. Tente novamente.",
    );
  }
  if (response.status === 401 && !url.startsWith("auth/"))
    throw new Error(
      "A sessão expirou. Guarde uma cópia do seu trabalho e entre novamente noutra janela.",
    );
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "Não foi possível concluir a operação.");
  return result as T;
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const el = ref.current!;
    el.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      el.close();
      document.body.style.overflow = "";
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-header">
        <div>
          <span className="eyebrow">PALACE MENU STUDIO</span>
          <h2 id={titleId}>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Fechar"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Empty({
  title,
  description,
  icon,
  action,
  onAction,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action && (
        <button className="button secondary" onClick={onAction}>
          {action}
          <ArrowRight size={16} />
        </button>
      )}
    </div>
  );
}
export function FormError({ message }: { message: string }) {
  return message ? (
    <div className="notice" role="alert">
      <AlertCircle size={18} />
      <span>{message}</span>
    </div>
  ) : null;
}
export type Notify = (message: string, error?: boolean) => void;
