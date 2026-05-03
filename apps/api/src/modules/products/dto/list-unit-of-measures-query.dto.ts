import { ListQueryDto } from '@/common/dto/list-query.dto'
import type { UnitOfMeasuresQuery } from '@biztrack/types'

/**
 * Query DTO for listing unit of measures
 * Reuses base ListQueryDto with no additional filters currently
 * Can be extended in future if filtering is needed (e.g., by type)
 */
export class ListUnitOfMeasuresQueryDto extends ListQueryDto implements UnitOfMeasuresQuery { }
