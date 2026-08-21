import { Injectable } from '@nestjs/common';
import { AiGateway } from '@family-app/ai';
import type { RetrievalRequest, RetrievedFact } from '@family-app/ai';
import type { RequestActor } from '../../common/auth.guard';
import { AuditService } from '../../common/audit.service';
import { PolicyService } from '../../common/policy.service';
import { SupabaseService } from '../../common/supabase.service';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Context Engine + Family Copilot wiring (V3 §57-63) — this is the
 * concrete implementation the `AiGateway` (packages/ai) constructor asks
 * for. Nothing here can retrieve a fact the Policy Engine hasn't already
 * allowed for the current actor/domain/subject — `AiGateway.ask()` calls
 * `retrieve()` per-request only after its own `authorize()` call returns
 * ALLOW (see packages/ai/src/ai-gateway.ts). This class only supplies:
 * scoped reads from real tables, a gated LLM call, and audit recording.
 */
@Injectable()
export class AiService {
  private readonly aiEnabled: boolean;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly policy: PolicyService,
    private readonly audit: AuditService,
  ) {
    this.aiEnabled = process.env.AI_ENABLED === 'true';
  }

  private db(actor: RequestActor) {
    return this.supabase.forUser(actor.bearerToken);
  }

  private gatewayFor(actor: RequestActor): AiGateway {
    // NOTE: AiGateway's own callback signatures only pass back a bare
    // `PolicyActor` (personId/tenantId/userId — see packages/ai/src/
    // ai-gateway.ts), not the full `RequestActor` this module needs
    // (bearerToken, for a per-user Supabase client scoped by RLS).
    // Deliberately closing over the real `actor` here instead of trusting
    // the gateway's echoed-back value.
    return new AiGateway({
      aiEnabled: this.aiEnabled,
      retrieve: (request) => this.retrieve(actor, request),
      complete: (input) => this.complete(input),
      loadPolicyInput: (_actor, subjectPersonId) => this.policy.loadPolicyEngineInput(actor, subjectPersonId),
      recordAudit: async ({ allowedDomains, deniedDomains }) => {
        // Deliberately NOT persisting the raw question text (§76 — audit
        // context "MUST be redacted... never store medical detail"). A
        // health/medication question would leak exactly the sensitive
        // detail the redaction rule exists to keep out of the audit
        // trail. Domains touched + counts are enough to reconstruct what
        // happened without capturing what was asked.
        await this.audit.record(actor, {
          eventType: 'AI_QUERY',
          result: deniedDomains.length > 0 && allowedDomains.length === 0 ? 'DENIED' : 'SUCCESS',
          context: { allowedDomains, deniedDomains },
        });
      },
    });
  }

  async ask(actor: RequestActor, question: string, subjectPersonIds: string[]) {
    const gateway = this.gatewayFor(actor);
    const answer = await gateway.ask(
      { personId: actor.personId!, tenantId: actor.tenantId!, userId: actor.authUserId },
      question,
      subjectPersonIds,
    );
    return { ...answer, suggestedAction: this.suggestAction(question, subjectPersonIds, answer.facts) };
  }

  // ------------------------------------------------------------ retrieve

  private async retrieve(actor: RequestActor, request: RetrievalRequest): Promise<RetrievedFact[]> {
    switch (request.domain) {
      case 'SCHEDULE':
        return this.retrieveCalendarEvents(actor, request.subjectPersonId, 'SCHEDULE');
      case 'SCHOOL':
        return this.retrieveCalendarEvents(actor, request.subjectPersonId, 'SCHOOL', 'SCHOOL');
      case 'ACTIVITIES':
        return this.retrieveCalendarEvents(actor, request.subjectPersonId, 'ACTIVITIES', 'SPORT');
      case 'FINANCE':
        return this.retrieveCalendarEvents(actor, request.subjectPersonId, 'FINANCE', 'FINANCE');
      case 'MEDICATION':
        return this.retrieveMedications(actor, request.subjectPersonId);
      case 'HEALTH':
        return this.retrieveHealthProfile(actor, request.subjectPersonId);
      case 'EMERGENCY':
        return this.retrieveEmergencyProfile(actor, request.subjectPersonId);
      case 'DOCUMENTS':
        return this.retrieveDocuments(actor, request.subjectPersonId);
      default:
        // No retrieval implemented yet for this domain (PROFILE, VACCINATION,
        // TRANSPORTATION, CONTACTS, NOTES, LOCATION, AI, AUDIT) — returning
        // an empty fact list is the honest answer; AiGateway already turns
        // "zero facts" into "não encontrei informações", never a guess.
        return [];
    }
  }

  private async retrieveCalendarEvents(
    actor: RequestActor,
    subjectPersonId: string,
    domain: RetrievedFact['domain'],
    category?: string,
  ): Promise<RetrievedFact[]> {
    const now = new Date().toISOString();
    const in7days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    let query = this.db(actor)
      .from('calendar_events')
      .select('*')
      .eq('subject_person_id', subjectPersonId)
      .gte('starts_at', now)
      .lte('starts_at', in7days)
      .order('starts_at')
      .limit(10);
    if (category) query = query.eq('category', category);
    const { data, error } = await query;
    if (error || !data) return [];
    return data.map((e) => ({
      domain,
      subjectPersonId,
      summary: `${e.title as string} em ${formatDateTime(e.starts_at as string)}`,
      source: { type: 'calendar_events', id: e.id as string, occurredAt: e.starts_at as string },
    }));
  }

  private async retrieveMedications(actor: RequestActor, subjectPersonId: string): Promise<RetrievedFact[]> {
    const { data, error } = await this.db(actor)
      .from('medications')
      .select('*')
      .eq('subject_person_id', subjectPersonId)
      .eq('active', true);
    if (error || !data) return [];
    return data.map((m) => ({
      domain: 'MEDICATION' as const,
      subjectPersonId,
      summary: `${m.name as string}${m.dosage_text ? ` — ${m.dosage_text as string}` : ''}`,
      source: { type: 'medications', id: m.id as string },
    }));
  }

  private async retrieveHealthProfile(actor: RequestActor, subjectPersonId: string): Promise<RetrievedFact[]> {
    const { data, error } = await this.db(actor).from('health_profiles').select('*').eq('person_id', subjectPersonId).maybeSingle();
    if (error || !data) return [];
    const parts: string[] = [];
    if (data.blood_type) parts.push(`tipo sanguíneo ${data.blood_type as string}`);
    if ((data.allergies as string[] | null)?.length) parts.push(`alergias: ${(data.allergies as string[]).join(', ')}`);
    if ((data.conditions as string[] | null)?.length) parts.push(`condições: ${(data.conditions as string[]).join(', ')}`);
    if (parts.length === 0) return [];
    return [{ domain: 'HEALTH', subjectPersonId, summary: parts.join('; '), source: { type: 'health_profiles', id: data.id as string } }];
  }

  private async retrieveEmergencyProfile(actor: RequestActor, subjectPersonId: string): Promise<RetrievedFact[]> {
    const { data, error } = await this.db(actor).from('emergency_profiles').select('*').eq('subject_person_id', subjectPersonId).maybeSingle();
    if (error || !data) return [];
    const parts: string[] = [];
    if ((data.allergies as string[] | null)?.length) parts.push(`alergias: ${(data.allergies as string[]).join(', ')}`);
    if (data.pediatrician_name) parts.push(`pediatra: ${data.pediatrician_name as string}`);
    if (data.preferred_hospital) parts.push(`hospital de referência: ${data.preferred_hospital as string}`);
    if (parts.length === 0) return [];
    return [{ domain: 'EMERGENCY', subjectPersonId, summary: parts.join('; '), source: { type: 'emergency_profiles', id: data.id as string } }];
  }

  private async retrieveDocuments(actor: RequestActor, subjectPersonId: string): Promise<RetrievedFact[]> {
    const { data, error } = await this.db(actor)
      .from('documents')
      .select('*')
      .eq('subject_person_id', subjectPersonId)
      .order('created_at', { ascending: false })
      .limit(5);
    if (error || !data) return [];
    return data.map((d) => ({
      domain: 'DOCUMENTS' as const,
      subjectPersonId,
      summary: (d.title as string) ?? 'Documento sem título',
      source: { type: 'documents', id: d.id as string, occurredAt: d.created_at as string },
    }));
  }

  // ------------------------------------------------------------- complete

  /**
   * Gated LLM call (§50, §57-58's "IA MÉDICA" constraints): read-only by
   * construction — `facts` are already-authorized text summaries, never
   * raw rows, and there is no write path from here into any domain
   * table. When no real provider is configured (the honest default —
   * `AI_ENABLED=false` ships off), or the HTTP call itself fails, this
   * falls back to a plain, deterministic listing of the retrieved facts
   * rather than fabricating a natural-language answer.
   */
  private async complete(input: { question: string; facts: RetrievedFact[] }): Promise<string> {
    const apiKey = process.env.AI_PROVIDER_API_KEY;
    const model = process.env.AI_MODEL;
    const provider = process.env.AI_PROVIDER ?? 'anthropic';

    if (!apiKey || !model || provider !== 'anthropic') {
      return this.deterministicSummary(input.facts);
    }

    try {
      const response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 512,
          system:
            'Você é a ZELII. Responda SOMENTE com base nos fatos fornecidos abaixo. ' +
            'Nunca invente informação, nunca altere dose de medicamento, nunca diagnostique como fato. ' +
            'Se os fatos não bastarem para responder, diga isso claramente.',
          messages: [
            {
              role: 'user',
              content: `Pergunta: ${input.question}\n\nFatos disponíveis:\n${input.facts.map((f) => `- ${f.summary}`).join('\n')}`,
            },
          ],
        }),
      });
      if (!response.ok) return this.deterministicSummary(input.facts);
      const body = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
      const text = body.content?.find((c) => c.type === 'text')?.text;
      return text?.trim() || this.deterministicSummary(input.facts);
    } catch {
      // Network/provider failure — degrade to the deterministic path
      // rather than surfacing a 500 for what is, from the user's
      // perspective, still a question with a real answer available.
      return this.deterministicSummary(input.facts);
    }
  }

  private deterministicSummary(facts: RetrievedFact[]): string {
    if (facts.length === 0) return 'Não encontrei informações registradas para responder a essa pergunta.';
    return facts.map((f) => `- ${f.summary}`).join('\n');
  }

  // -------------------------------------------------------- action layer

  /**
   * §60 Family Action Layer — first real producer. Deliberately narrow:
   * only fires for an explicit "quem pode buscar/levar" question, and
   * only suggests (never creates) a ResponsibilityAssignment proposal —
   * shaped exactly like `CareNetworkService.create()`'s input so the
   * confirming client can POST it verbatim to the already-audited,
   * already-tested `/care-network/assignments` endpoint. Same
   * documented-heuristic posture as packages/ai/src/intent.ts.
   */
  private suggestAction(
    question: string,
    subjectPersonIds: string[],
    facts: RetrievedFact[],
  ): { type: string; payload: Record<string, unknown> } | undefined {
    const lower = question.toLowerCase();
    const asksWhoCanPickUp = /(quem pode|quem consegue).*(buscar|levar|pegar)/.test(lower);
    if (!asksWhoCanPickUp || subjectPersonIds.length === 0 || facts.length === 0) return undefined;

    return {
      type: 'PROPOSE_RESPONSIBILITY_ASSIGNMENT',
      payload: {
        subjectPersonId: subjectPersonIds[0],
        responsibilityType: 'PICKUP',
        note: 'Sugestão da ZELII — confirme o cuidador antes de enviar.',
      },
    };
  }
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`;
}
