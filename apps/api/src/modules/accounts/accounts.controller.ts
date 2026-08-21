import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/auth.guard';
import type { RequestActor } from '../../common/auth.guard';
import { CurrentActor } from '../../common/current-actor.decorator';
import { AccountsService } from './accounts.service';

@ApiTags('accounts')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('accounts')
export class AccountsController {
  constructor(private readonly service: AccountsService) {}

  /**
   * `requireOnboarded: false` de propósito: uma conta com 2+ famílias
   * chega aqui com `actor.tenantId === null` (AuthGuard não adivinha
   * qual tenant usar sem um `x-tenant-id` — §10) e é exatamente esse
   * caso que este endpoint existe para resolver, não um caso de erro.
   */
  @Get('me/tenants')
  listMyTenants(@CurrentActor({ requireOnboarded: false }) actor: RequestActor) {
    return this.service.listMyTenants(actor);
  }
}
