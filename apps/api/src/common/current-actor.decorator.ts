import { createParamDecorator, ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { ActorRequest, RequestActor } from './auth.guard';

/** Injects the authenticated actor. Use `@CurrentActor({ requireOnboarded: true })` (default) for any endpoint past onboarding. */
export const CurrentActor = createParamDecorator(
  (opts: { requireOnboarded?: boolean } = { requireOnboarded: true }, ctx: ExecutionContext): RequestActor => {
    const request = ctx.switchToHttp().getRequest<ActorRequest>();
    const actor = request.actor;
    if ((opts.requireOnboarded ?? true) && (!actor.tenantId || !actor.personId)) {
      throw new ForbiddenException('Conclua o cadastro inicial antes de continuar.');
    }
    return actor;
  },
);
