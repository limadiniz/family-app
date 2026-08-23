'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader, SuccessToast } from '@/components/ui';
import { getCadastroCategory } from '@/lib/cadastro-config';
import { FamiliaForm } from '@/components/cadastro-forms/familia-form';
import { PessoaForm } from '@/components/cadastro-forms/pessoa-form';
import { CuidadorForm } from '@/components/cadastro-forms/cuidador-form';
import { CompromissoForm } from '@/components/cadastro-forms/compromisso-form';
import { TarefaForm } from '@/components/cadastro-forms/tarefa-form';
import { SolicitacaoForm } from '@/components/cadastro-forms/solicitacao-form';
import { LocalForm } from '@/components/cadastro-forms/local-form';
import { RotinaForm } from '@/components/cadastro-forms/rotina-form';

/** Onde cada categoria manda a pessoa depois de criar com sucesso — a página que já mostra o que acabou de ser criado. */
const DESTINATION: Record<string, string> = {
  familia: '/app/family',
  pessoa: '/app/people',
  cuidador: '/app/care-network',
  compromisso: '/app/today',
  tarefa: '/app/tasks',
  solicitacao: '/app/requests',
  local: '/app/cadastros',
  rotina: '/app/calendar',
};

const SUCCESS_MESSAGE: Record<string, string> = {
  familia: 'Família criada.',
  pessoa: 'Pessoa adicionada.',
  cuidador: 'Cuidador adicionado — pendente até a Rede de Cuidado ativar.',
  compromisso: 'Compromisso criado.',
  tarefa: 'Tarefa criada.',
  solicitacao: 'Solicitação enviada.',
  local: 'Local salvo.',
  rotina: 'Rotina salva na agenda.',
};

export default function CadastroFormPage({ params }: { params: { categoria: string } }) {
  const category = getCadastroCategory(params.categoria);
  const router = useRouter();
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  if (!category) notFound();

  function goToHub() {
    router.push('/app/cadastros');
  }

  function handleSuccess() {
    setToastMessage(SUCCESS_MESSAGE[params.categoria] ?? 'Criado com sucesso.');
    // Pequeno atraso pra pessoa ver a confirmação antes da navegação —
    // sem isso o toast nunca chegaria a aparecer, já que a página muda.
    setTimeout(() => router.push(DESTINATION[params.categoria] ?? '/app/cadastros'), 600);
  }

  return (
    <div className="max-w-2xl">
      <Link href="/app/cadastros" className="text-sm text-inkMuted hover:text-ink">
        ← Central de Cadastros
      </Link>
      <PageHeader title={category.label} description={category.description} className="mt-2" />
      <div className="mt-6">
        {params.categoria === 'familia' && <FamiliaForm onSuccess={handleSuccess} onCancel={goToHub} />}
        {params.categoria === 'pessoa' && <PessoaForm onSuccess={handleSuccess} onCancel={goToHub} />}
        {params.categoria === 'cuidador' && <CuidadorForm onSuccess={handleSuccess} onCancel={goToHub} />}
        {params.categoria === 'compromisso' && <CompromissoForm onSuccess={handleSuccess} onCancel={goToHub} />}
        {params.categoria === 'tarefa' && <TarefaForm onSuccess={handleSuccess} onCancel={goToHub} />}
        {params.categoria === 'solicitacao' && <SolicitacaoForm onSuccess={handleSuccess} onCancel={goToHub} />}
        {params.categoria === 'local' && <LocalForm onSuccess={handleSuccess} onCancel={goToHub} />}
        {params.categoria === 'rotina' && <RotinaForm onSuccess={handleSuccess} onCancel={goToHub} />}
      </div>
      {toastMessage && <SuccessToast message={toastMessage} onDismiss={() => setToastMessage(null)} />}
    </div>
  );
}
