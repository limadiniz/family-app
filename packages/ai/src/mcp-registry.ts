import type { PermissionAction, PermissionDomain } from '@family-app/domain';

export const MCP_READ_TOOLS = [
  'READ_FAMILY_CALENDAR',
  'READ_SCHOOL_NOTICES',
  'READ_DOCUMENT_METADATA',
] as const;
export type McpReadToolName = (typeof MCP_READ_TOOLS)[number];

export type McpReadToolDefinition = {
  name: McpReadToolName;
  connectorId: string;
  remoteToolName: string;
  description: string;
  risk: 'READ_ONLY';
  requiredAuthorization: Array<{ domain: PermissionDomain; action: PermissionAction }>;
  allowedArgumentKeys: readonly string[];
  maxResponseCharacters: number;
};

export const MCP_READ_TOOL_REGISTRY: Record<McpReadToolName, McpReadToolDefinition> = {
  READ_FAMILY_CALENDAR: {
    name: 'READ_FAMILY_CALENDAR',
    connectorId: 'calendar-approved-adapter',
    remoteToolName: 'calendar.events.list',
    description: 'Consultar compromissos de uma pessoa em calendário externo aprovado.',
    risk: 'READ_ONLY',
    requiredAuthorization: [{ domain: 'SCHEDULE', action: 'VIEW' }],
    allowedArgumentKeys: ['subjectPersonId', 'startsAt', 'endsAt'],
    maxResponseCharacters: 20_000,
  },
  READ_SCHOOL_NOTICES: {
    name: 'READ_SCHOOL_NOTICES',
    connectorId: 'school-approved-adapter',
    remoteToolName: 'school.notices.list',
    description: 'Consultar comunicados escolares em um conector aprovado.',
    risk: 'READ_ONLY',
    requiredAuthorization: [{ domain: 'SCHOOL', action: 'VIEW' }],
    allowedArgumentKeys: ['subjectPersonId', 'since'],
    maxResponseCharacters: 20_000,
  },
  READ_DOCUMENT_METADATA: {
    name: 'READ_DOCUMENT_METADATA',
    connectorId: 'documents-approved-adapter',
    remoteToolName: 'documents.metadata.list',
    description: 'Consultar somente metadados de documentos autorizados.',
    risk: 'READ_ONLY',
    requiredAuthorization: [{ domain: 'DOCUMENTS', action: 'VIEW' }],
    allowedArgumentKeys: ['subjectPersonId'],
    maxResponseCharacters: 10_000,
  },
};

export interface McpConnectorExecutor {
  call(input: {
    connectorId: string;
    remoteToolName: string;
    arguments: Record<string, unknown>;
    requestId: string;
  }): Promise<unknown>;
}

export async function executeGovernedMcpRead(input: {
  toolName: string;
  arguments: Record<string, unknown>;
  requestId: string;
  authorize: (requirement: { domain: PermissionDomain; action: PermissionAction }) => Promise<void>;
  executor: McpConnectorExecutor;
}): Promise<{ type: 'UNTRUSTED_EXTERNAL_CONTENT'; toolName: McpReadToolName; content: unknown }> {
  if (!MCP_READ_TOOLS.includes(input.toolName as McpReadToolName))
    throw new Error('MCP_TOOL_NOT_ALLOWLISTED');
  const definition = MCP_READ_TOOL_REGISTRY[input.toolName as McpReadToolName];
  if (!input.arguments.subjectPersonId || typeof input.arguments.subjectPersonId !== 'string') {
    throw new Error('MCP_SUBJECT_REQUIRED');
  }
  const argumentKeys = Object.keys(input.arguments);
  if (argumentKeys.some((key) => !definition.allowedArgumentKeys.includes(key))) {
    throw new Error('MCP_ARGUMENT_NOT_ALLOWED');
  }
  if (
    Object.values(input.arguments).some(
      (value) => typeof value !== 'string' || value.length === 0 || value.length > 250,
    )
  ) {
    throw new Error('MCP_ARGUMENT_INVALID');
  }
  for (const dateKey of ['startsAt', 'endsAt', 'since']) {
    const value = input.arguments[dateKey];
    if (value !== undefined && (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))) {
      throw new Error('MCP_ARGUMENT_INVALID');
    }
  }
  for (const requirement of definition.requiredAuthorization) await input.authorize(requirement);
  const content = await input.executor.call({
    connectorId: definition.connectorId,
    remoteToolName: definition.remoteToolName,
    arguments: input.arguments,
    requestId: input.requestId,
  });
  if (JSON.stringify(content).length > definition.maxResponseCharacters)
    throw new Error('MCP_RESPONSE_TOO_LARGE');
  return { type: 'UNTRUSTED_EXTERNAL_CONTENT', toolName: definition.name, content };
}
