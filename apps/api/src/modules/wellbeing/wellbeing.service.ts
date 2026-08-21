import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { RequestActor } from '../../common/auth.guard';
import { AuditService } from '../../common/audit.service';
import { PolicyDeniedError, PolicyService } from '../../common/policy.service';
import { SupabaseService } from '../../common/supabase.service';

/**
 * Health Core + Emergency Profile (Prompt Mestre V2 §41-44, §55-58, P0).
 * `getEmergencyProfile` is the one method in this codebase where a
 * DENY still produces an AuditEvent (§43: "AuditEvent registrado" is
 * required regardless of outcome) — every other module only audits on
 * SUCCESS, relying on the Policy Engine's own decision-time visibility
 * for denies, but emergency access is explicitly called out as always
 * traceable.
 */
@Injectable()
export class WellbeingService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly policy: PolicyService,
    private readonly audit: AuditService,
  ) {}

  private db(actor: RequestActor) {
    return this.supabase.forUser(actor.bearerToken);
  }

  // ------------------------------------------------------- health profile

  async getHealthProfile(actor: RequestActor, personId: string) {
    await this.policy.authorizeOrThrow(actor, 'VIEW', 'HEALTH', personId, { purpose: 'get_health_profile' });
    const { data, error } = await this.db(actor).from('health_profiles').select('*').eq('person_id', personId).maybeSingle();
    if (error) throw new BadRequestException(error.message);
    return data ?? null;
  }

  async upsertHealthProfile(
    actor: RequestActor,
    personId: string,
    patch: { bloodType?: string; allergies?: string[]; conditions?: string[]; healthPlanName?: string; healthPlanCardNumber?: string },
  ) {
    await this.policy.authorizeOrThrow(actor, 'EDIT', 'HEALTH', personId, { purpose: 'upsert_health_profile' });
    const { data, error } = await this.db(actor)
      .from('health_profiles')
      .upsert(
        {
          tenant_id: actor.tenantId,
          person_id: personId,
          blood_type: patch.bloodType,
          allergies: patch.allergies,
          conditions: patch.conditions,
          health_plan_name: patch.healthPlanName,
          health_plan_card_number: patch.healthPlanCardNumber,
        },
        { onConflict: 'tenant_id,person_id' },
      )
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  // ---------------------------------------------------------- medication

  async createMedication(
    actor: RequestActor,
    input: { subjectPersonId: string; name: string; dosageText?: string; prescriptionId?: string },
  ) {
    await this.policy.authorizeOrThrow(actor, 'CREATE', 'MEDICATION', input.subjectPersonId, { purpose: 'create_medication' });
    const { data, error } = await this.db(actor)
      .from('medications')
      .insert({
        tenant_id: actor.tenantId,
        subject_person_id: input.subjectPersonId,
        name: input.name,
        dosage_text: input.dosageText ?? null,
        prescription_id: input.prescriptionId ?? null,
        provenance: 'USER_DECLARED',
      })
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async listMedications(actor: RequestActor, subjectPersonId: string) {
    await this.policy.authorizeOrThrow(actor, 'VIEW', 'MEDICATION', subjectPersonId, { purpose: 'list_medications' });
    const { data, error } = await this.db(actor)
      .from('medications')
      .select('*, medication_schedules(*)')
      .eq('subject_person_id', subjectPersonId)
      .eq('active', true);
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  /**
   * §57-58: the AI/app may never invent, alter, or suggest compensating a
   * dose — this endpoint only ever RECORDS what a human (guardian,
   * caregiver within an active CareWindow) reports actually happened.
   */
  async recordAdministration(
    actor: RequestActor,
    input: { medicationId: string; scheduledAt: string; status: string; notes?: string },
  ) {
    const { data: medication, error: medError } = await this.db(actor)
      .from('medications')
      .select('subject_person_id')
      .eq('id', input.medicationId)
      .maybeSingle();
    if (medError) throw new BadRequestException(medError.message);
    if (!medication) throw new NotFoundException('Medicamento não encontrado.');

    await this.policy.authorizeOrThrow(actor, 'EDIT', 'MEDICATION', medication.subject_person_id as string, {
      purpose: 'record_medication_administration',
    });

    const { data, error } = await this.db(actor)
      .from('medication_administrations')
      .insert({
        tenant_id: actor.tenantId,
        medication_id: input.medicationId,
        scheduled_at: input.scheduledAt,
        administered_at: input.status === 'TAKEN' ? new Date().toISOString() : null,
        administered_by_person_id: actor.personId,
        status: input.status,
        notes: input.notes ?? null,
      })
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);

    await this.audit.record(actor, {
      eventType: 'ADMINISTER_MEDICATION',
      subjectPersonId: medication.subject_person_id as string,
      resourceType: 'medication_administrations',
      resourceId: data.id as string,
      result: 'SUCCESS',
      context: { status: input.status },
    });

    return data;
  }

  // ------------------------------------------------------- emergency profile

  async getEmergencyProfile(actor: RequestActor, subjectPersonId: string) {
    try {
      await this.policy.authorizeOrThrow(actor, 'VIEW', 'EMERGENCY', subjectPersonId, { purpose: 'emergency_profile_access' });
    } catch (err) {
      await this.audit.record(actor, {
        eventType: 'EMERGENCY_ACCESS',
        subjectPersonId,
        resourceType: 'emergency_profiles',
        result: 'DENIED',
        context: { rule: err instanceof PolicyDeniedError ? err.rule : 'UNKNOWN' },
      });
      throw err;
    }

    const { data, error } = await this.db(actor).from('emergency_profiles').select('*').eq('subject_person_id', subjectPersonId).maybeSingle();
    if (error) throw new BadRequestException(error.message);

    await this.audit.record(actor, {
      eventType: 'EMERGENCY_ACCESS',
      subjectPersonId,
      resourceType: 'emergency_profiles',
      result: 'SUCCESS',
    });

    return data ?? null;
  }

  async upsertEmergencyProfile(
    actor: RequestActor,
    subjectPersonId: string,
    patch: {
      bloodType?: string;
      allergies?: string[];
      conditions?: string[];
      criticalMedications?: string[];
      healthPlanName?: string;
      healthPlanCardNumber?: string;
      pediatricianName?: string;
      preferredHospital?: string;
      emergencyContacts?: Array<{ name: string; relationship?: string; phone: string }>;
    },
  ) {
    await this.policy.authorizeOrThrow(actor, 'MANAGE', 'EMERGENCY', subjectPersonId, { purpose: 'manage_emergency_profile' });
    const { data, error } = await this.db(actor)
      .from('emergency_profiles')
      .upsert(
        {
          tenant_id: actor.tenantId,
          subject_person_id: subjectPersonId,
          blood_type: patch.bloodType,
          allergies: patch.allergies,
          conditions: patch.conditions,
          critical_medications: patch.criticalMedications,
          health_plan_name: patch.healthPlanName,
          health_plan_card_number: patch.healthPlanCardNumber,
          pediatrician_name: patch.pediatricianName,
          preferred_hospital: patch.preferredHospital,
          emergency_contacts: patch.emergencyContacts ?? [],
        },
        { onConflict: 'tenant_id,subject_person_id' },
      )
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }
}
