import { createParamDecorator, ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { ActorRequest, RequestActor } from './auth.guard';

/**
 * Raw factory behind `@CurrentActor()`, exported separately so it can be
 * unit-tested without going through Nest's decorator/DI machinery (see
 * `test/current-actor.test.ts`).
 *
 * Stable error code: any client past the login screen needs to tell
 * "you haven't finished onboarding" apart from every other 403 (e.g. a
 * Policy Engine DENY). `ForbiddenException`'s body carries `code:
 * 'ONBOARDING_REQUIRED'` for exactly that — `HttpExceptionFilter` reads
 * it and puts it on the wire instead of the generic `FORBIDDEN` name.
 * The message stays human-readable pt-BR (§118) and — for now, until
 * every client is confirmed to read `code` — still contains "cadastro
 * inicial" so an older client string-matching the message keeps working.
 */
export function resolveCurrentActor(
  opts: { requireOnboarded?: boolean } = { requireOnboarded: true },
  ctx: ExecutionContext,
): RequestActor {
  const request = ctx.switchToHttp().getRequest<ActorRequest>();
  const actor = request.actor;
  if ((opts.requireOnboarded ?? true) && (!actor.tenantId || !actor.personId)) {
    throw new ForbiddenException({
      code: 'ONBOARDING_REQUIRED',
      message: 'Conclua o cadastro inicial antes de continuar.',
    });
  }
  return actor;
}

/** Injects the authenticated actor. Use `@CurrentActor({ requireOnboarded: true })` (default) for any endpoint past onboarding. */
export const CurrentActor = createParamDecorator(resolveCurrentActor);
