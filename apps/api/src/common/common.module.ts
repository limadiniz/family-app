import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuthGuard } from './auth.guard';
import { PolicyService } from './policy.service';
import { SupabaseService } from './supabase.service';

@Global()
@Module({
  providers: [SupabaseService, AuthGuard, PolicyService, AuditService],
  exports: [SupabaseService, AuthGuard, PolicyService, AuditService],
})
export class CommonModule {}
