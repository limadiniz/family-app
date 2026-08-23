import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RequestActor } from '../src/common/auth.guard';
import type { PolicyService } from '../src/common/policy.service';
import type { SupabaseService } from '../src/common/supabase.service';
import { AiResponseCacheService } from '../src/modules/ai/ai-response-cache.service';
import { McpProxyService } from '../src/modules/ai/mcp-proxy.service';
import { SupervisedAgentService } from '../src/modules/ai/supervised-agent.service';

const actor: RequestActor = {
  authUserId: 'auth-1',
  tenantId: 'tenant-1',
  personId: 'person-1',
  bearerToken: 'token',
};

afterEach(() => {
  delete process.env.FF_AI_ENABLED;
  delete process.env.FF_AI_EXACT_CACHE;
  delete process.env.FF_AI_SEMANTIC_CACHE;
  delete process.env.FF_AI_MCP_READ;
  delete process.env.FF_AI_AGENT_LOOP;
});

describe('advanced AI rollout gates', () => {
  it('does not access service-role storage when cache review gates are incomplete', async () => {
    process.env.FF_AI_ENABLED = 'true';
    process.env.FF_AI_EXACT_CACHE = 'true';
    const serviceRole = vi.fn();
    const cache = new AiResponseCacheService({ serviceRole } as unknown as SupabaseService);
    await expect(
      cache.getExact(actor, {
        question: 'O que a escola pediu?',
        facts: [],
        signals: [],
        allowedDomains: ['SCHOOL'],
        promptVersion: 'v1',
        modelVersion: 'model-1',
      }),
    ).resolves.toBeNull();
    expect(serviceRole).not.toHaveBeenCalled();
  });

  it('does not call an MCP connector before provider, privacy and safety approval', async () => {
    process.env.FF_AI_ENABLED = 'true';
    process.env.FF_AI_MCP_READ = 'true';
    const connectorCall = vi.fn();
    const forUser = vi.fn();
    const proxy = new McpProxyService(
      { forUser } as unknown as SupabaseService,
      { authorizeOrThrow: vi.fn() } as unknown as PolicyService,
      { call: connectorCall },
    );
    await expect(
      proxy.callRead(actor, {
        toolName: 'READ_SCHOOL_NOTICES',
        arguments: { subjectPersonId: 'child-1' },
        requestId: 'request-1',
      }),
    ).rejects.toThrow();
    expect(connectorCall).not.toHaveBeenCalled();
    expect(forUser).not.toHaveBeenCalled();
  });

  it('does not load family data or run a planner while the agent gate is blocked', async () => {
    process.env.FF_AI_ENABLED = 'true';
    process.env.FF_AI_AGENT_LOOP = 'true';
    const forUser = vi.fn();
    const planner = vi.fn();
    const agent = new SupervisedAgentService(
      { forUser } as unknown as SupabaseService,
      {} as PolicyService,
      {} as McpProxyService,
      planner,
    );
    await expect(agent.run(actor, 'Organizar a semana')).rejects.toThrow();
    expect(forUser).not.toHaveBeenCalled();
    expect(planner).not.toHaveBeenCalled();
  });
});
