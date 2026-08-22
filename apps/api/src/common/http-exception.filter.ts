import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Logger } from '@family-app/observability';
import { PolicyDeniedError, PolicyRequiresConfirmationError } from './policy.service';

/**
 * Converts every thrown error into a human-readable, pt-BR response body
 * (§118: "Você não possui permissão..." instead of "403 policy
 * violation"). Technical detail (stack, correlationId) is logged
 * server-side only, with redaction applied by the shared logger.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { correlationId?: string }>();
    const correlationId = request.correlationId;

    if (exception instanceof PolicyDeniedError) {
      this.logger.warn({ correlationId, rule: exception.rule }, 'policy_denied');
      // NOT_ONBOARDED is a DENY at the Policy Engine level (no
      // tenantId/personId to evaluate against) but it isn't a real
      // authorization refusal — it's "finish onboarding first". Surface
      // the same stable ONBOARDING_REQUIRED code current-actor.decorator
      // uses, so a client only has to branch on one code regardless of
      // which code path caught the not-onboarded case (§8).
      if (exception.rule === 'NOT_ONBOARDED') {
        return response.status(HttpStatus.FORBIDDEN).json({
          error: {
            code: 'ONBOARDING_REQUIRED',
            message: 'Conclua o cadastro inicial antes de continuar.',
            correlationId,
          },
        });
      }
      return response.status(HttpStatus.FORBIDDEN).json({
        error: {
          code: 'POLICY_DENIED',
          message: 'Você não possui permissão para realizar esta ação.',
          correlationId,
        },
      });
    }

    if (exception instanceof PolicyRequiresConfirmationError) {
      this.logger.info({ correlationId, rule: exception.rule }, 'policy_requires_confirmation');
      return response.status(HttpStatus.PRECONDITION_REQUIRED ?? 428).json({
        error: {
          code: 'POLICY_REQUIRE_CONFIRMATION',
          message: 'Essa ação é sensível e precisa da sua confirmação explícita antes de continuar.',
          correlationId,
        },
      });
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const bodyObj = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null;
      const message =
        typeof body === 'string' ? body : ((bodyObj?.message as string | string[] | undefined) ?? exception.message);
      // An exception thrown with an object body carrying its own `code`
      // (e.g. current-actor.decorator's ONBOARDING_REQUIRED) wins over
      // the generic HttpStatus name — that's how call sites opt into a
      // stable, app-specific code instead of the framework's 'FORBIDDEN'.
      const code = (typeof bodyObj?.code === 'string' ? bodyObj.code : undefined) ?? HttpStatus[status] ?? 'ERROR';
      this.logger.warn({ correlationId, status, code }, 'http_exception');
      return response.status(status).json({
        error: {
          code,
          message: Array.isArray(message) ? message.join(' ') : message,
          correlationId,
        },
      });
    }

    this.logger.error({ correlationId, err: exception }, 'unhandled_exception');
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Algo deu errado do nosso lado. Já registramos o problema.',
        correlationId,
      },
    });
  }
}
