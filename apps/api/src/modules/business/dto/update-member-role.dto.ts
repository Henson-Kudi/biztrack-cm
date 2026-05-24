import { IsUUID } from 'class-validator'
import type { UpdateMemberRoleRequest } from '@biztrack/types'

export class UpdateMemberRoleDto implements UpdateMemberRoleRequest {
  @IsUUID()
  roleId!: string
}
