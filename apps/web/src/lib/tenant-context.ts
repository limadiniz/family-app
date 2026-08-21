'use client';

const STORAGE_KEY = 'zelii.currentTenantId';

/**
 * Seletor multi-família (§10/§68): o backend já suporta uma Account com
 * mais de uma membership ACTIVE em account_memberships (uma mesma Person
 * pode participar de mais de uma FamilyUnit legítima — regra dura do
 * projeto) e já aceita o header `x-tenant-id` pra escolher qual
 * membership vale pra cada request (apps/api/src/common/auth.guard.ts).
 * O que faltava era o frontend de fato usar isso — sem esta escolha,
 * uma conta com 2+ famílias ficava com `actor.tenantId === null` em
 * toda chamada e via um erro genérico de "conclua o cadastro".
 *
 * Guarda só o id escolhido — nunca a lista de memberships (isso vem
 * sempre de GET /accounts/me/tenants, nunca é confiado a partir do
 * cliente). O backend ainda valida, a cada request, que o tenant
 * enviado aqui realmente pertence à conta autenticada (AuthGuard rejeita
 * qualquer outro) — isto é só "lembrar a preferência", nunca uma
 * alegação de autorização por si só.
 */
export function getStoredTenantId(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredTenantId(tenantId: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, tenantId);
  } catch {
    // localStorage indisponível (modo privado, etc.) — a escolha simplesmente não persiste entre sessões.
  }
}

export function clearStoredTenantId(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // idem
  }
}
