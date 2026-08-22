import { ArgumentsHost, ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';
import { PolicyDeniedError, PolicyRequiresConfirmationError } from '../src/common/policy.service';

/**
 * §8: both server-side paths that mean "finish onboarding first" —
 * current-actor.decorator's ForbiddenException({code: 'ONBOARDING_REQUIRED'})
 * and PolicyService's PolicyDeniedError('NOT_ONBOARDED') — must converge
 * on the SAME wire code, so apps/web only has to branch once.
 */
function makeHost(correlationId = 'corr-1') {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const response = { status };
  const request = { correlationId };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

function makeFilter() {
  const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
  return new HttpExceptionFilter(logger as never);
}

describe('HttpExceptionFilter — onboarding-required convergence', () => {
  it('maps PolicyDeniedError("NOT_ONBOARDED") to a stable ONBOARDING_REQUIRED code', () => {
    const filter = makeFilter();
    const { host, status, json } = makeHost();

    filter.catch(new PolicyDeniedError('NOT_ONBOARDED'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'ONBOARDING_REQUIRED', message: expect.stringMatching(/cadastro inicial/i), correlationId: 'corr-1' },
    });
  });

  it('maps a ForbiddenException({code: "ONBOARDING_REQUIRED"}) body to the same code', () => {
    const filter = makeFilter();
    const { host, status, json } = makeHost();

    filter.catch(
      new ForbiddenException({ code: 'ONBOARDING_REQUIRED', message: 'Conclua o cadastro inicial antes de continuar.' }),
      host,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'ONBOARDING_REQUIRED', message: expect.stringMatching(/cadastro inicial/i), correlationId: 'corr-1' },
    });
  });

  it('still falls back to any other PolicyDeniedError rule as generic POLICY_DENIED', () => {
    const filter = makeFilter();
    const { host, json } = makeHost();

    filter.catch(new PolicyDeniedError('NO_MATCHING_GRANT_DENY'), host);

    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'POLICY_DENIED',
        message: 'Você não possui permissão para realizar esta ação.',
        correlationId: 'corr-1',
      },
    });
  });

  it('still falls back to the generic HttpStatus name for a plain-string HttpException', () => {
    const filter = makeFilter();
    const { host, json } = makeHost();

    filter.catch(new HttpException('Algo específico.', HttpStatus.BAD_REQUEST), host);

    expect(json).toHaveBeenCalledWith({
      error: { code: 'BAD_REQUEST', message: 'Algo específico.', correlationId: 'corr-1' },
    });
  });

  it('still maps PolicyRequiresConfirmationError as before (unaffected by this change)', () => {
    const filter = makeFilter();
    const { host, status, json } = makeHost();

    filter.catch(new PolicyRequiresConfirmationError('SENSITIVE_ACTION'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.PRECONDITION_REQUIRED ?? 428);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'POLICY_REQUIRE_CONFIRMATION',
        message: 'Essa ação é sensível e precisa da sua confirmação explícita antes de continuar.',
        correlationId: 'corr-1',
      },
    });
  });
});
