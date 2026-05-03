import type { ProductUserSummary } from '@biztrack/types'

export class UserDto implements ProductUserSummary {
  id!: string
  name!: string

  static fromModel(model?: { id: string; name: string } | null): UserDto | null {
    if (!model) return null

    const dto = new UserDto()
    dto.id = model.id
    dto.name = model.name
    return dto
  }
}
