interface SensitiveDataNoticeProps {
  /** Descreve o que está sendo mostrado, ex.: "Dados de saúde de Ana". */
  label: string;
  className?: string;
}

/**
 * Aviso visível de que a tela está exibindo dado protegido (saúde e/ou
 * de criança — §4). Isto é só a camada de transparência da UI: a
 * decisão de MOSTRAR ou NÃO já foi tomada pelo backend/Policy Engine
 * antes destes dados chegarem aqui (§10, "regras críticas nunca só no
 * frontend"). Este componente nunca controla acesso, só o comunica.
 */
export function SensitiveDataNotice({ label, className = '' }: SensitiveDataNoticeProps) {
  return (
    <div
      role="note"
      className={`flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-ink ${className}`}
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-warning" aria-hidden="true">
        <path
          fillRule="evenodd"
          d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.516-2.625L8.485 2.495ZM10 6a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 6Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
          clipRule="evenodd"
        />
      </svg>
      <span>
        <strong className="font-medium">Dado protegido:</strong> {label}. Visível somente para quem tem autorização.
      </span>
    </div>
  );
}

interface AccessUntilProps {
  /** ISO datetime — corresponde a AuthorityGrant.validUntil (packages/domain/src/entities/authority-grant.ts). `null`/`undefined` = sem prazo definido. */
  validUntil?: string | null;
  className?: string;
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

/**
 * Mostra até quando um acesso temporário (AuthorityGrant.validUntil)
 * vale — apenas informativo. A expiração real é aplicada pelo backend
 * (isGrantCurrentlyActive + RLS), nunca por este componente deixar de
 * renderizar algo.
 */
export function AccessUntil({ validUntil, className = '' }: AccessUntilProps) {
  if (!validUntil) return null;
  const expired = new Date(validUntil) < new Date();
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${expired ? 'text-critical' : 'text-inkMuted'} ${className}`}>
      {expired ? 'Acesso expirou em' : 'Acesso até'} {formatDateTime(validUntil)}
    </span>
  );
}
