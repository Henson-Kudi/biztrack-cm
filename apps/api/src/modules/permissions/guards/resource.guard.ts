import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PermissionsService } from '../permissions.service'
import type { Resource } from '@biztrack/types'
import { I18nService } from 'nestjs-i18n'
import type { I18nTranslations } from '@/i18n/i18n.types'
import { AppForbiddenException } from '@/common/exceptions/app-exceptions'

export const RequireResource = (resource: Resource) => SetMetadata('required_resource', resource)

@Injectable()
export class ResourceGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private permissionsService: PermissionsService,
    private i18n: I18nService<I18nTranslations>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<Resource>('required_resource', context.getHandler())
    if (!required) return true

    const req = context.switchToHttp().getRequest()
    const businessId = req.user?.businessId
    if (!businessId) {
      throw new AppForbiddenException()
    }

    const permissions = await this.permissionsService.getEffectivePermissions(businessId)
    if (!permissions.includes(required)) {
      const requiredPlan = await this.permissionsService.getMinimumPlanFor(required)
      // Boolean feature denial stays a 403 even after quotas are introduced.
      // That keeps "this feature is not on your plan" separate from
      // "this feature is on your plan but you consumed the limit".
      throw new AppForbiddenException(
        await this.i18n.translate('errors.plan_upgrade_required', {
          args: { plan: requiredPlan },
        }),
        'PLAN_UPGRADE_REQUIRED',
        {
          resource: required,
          requiredPlan,
        },
      )
    }

    return true
  }
}
