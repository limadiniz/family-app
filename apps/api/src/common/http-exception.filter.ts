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
      const message =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message ?? exception.message);
      this.logger.warn({ correlationId, status }, 'http_exception');
      return response.status(status).json({
        error: {
          code: HttpStatus[status] ?? 'ERROR',
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
