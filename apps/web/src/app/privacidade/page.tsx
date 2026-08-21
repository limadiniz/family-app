import { MarketingPage } from '@/components/marketing-page';

export default function PrivacidadePage() {
  return (
    <MarketingPage title="Privacidade">
      <p>
        A ZELII é desenvolvida com privacidade desde a concepção (Privacy by Design) e privacidade como
        padrão (Privacy by Default), considerando a LGPD e o tratamento de dados de crianças e adolescentes.
      </p>
      <h2>Minimização</h2>
      <p>Coletamos apenas o necessário para cada finalidade declarada — nunca exigimos CPF de criança ou responsável como identificador estrutural.</p>
      <h2>Seus direitos</h2>
      <p>Você pode exportar seus dados e solicitar a exclusão da sua conta a qualquer momento, respeitando retenções legais aplicáveis.</p>
      <p className="text-sm">
        Este texto é um resumo técnico preparado para revisão jurídica — ver PRIVACY.md. Não constitui aconselhamento
        jurídico definitivo.
      </p>
    </MarketingPage>
  );
}
