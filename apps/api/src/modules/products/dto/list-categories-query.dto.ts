import { ListQueryDto } from '@/common/dto/list-query.dto'
import type { CategoriesQuery } from '@biztrack/types'

/**
 * Query DTO for listing product categories
 * Reuses base ListQueryDto with no additional filters
 */
export class ListCategoriesQueryDto extends ListQueryDto implements CategoriesQuery { }
