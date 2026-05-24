import { IsArray, IsUUID, ArrayNotEmpty } from 'class-validator'

export class BulkUpdateMemberRoleDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID(4, { each: true })
  userIds!: string[]

  @IsUUID()
  roleId!: string
}
