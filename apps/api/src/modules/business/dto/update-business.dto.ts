import { PartialType } from '@nestjs/mapped-types'
import type { UpdateBusinessRequest } from '@biztrack/types'
import { CreateBusinessDto } from './create-business.dto'

export class UpdateBusinessDto extends PartialType(CreateBusinessDto) implements UpdateBusinessRequest {}
