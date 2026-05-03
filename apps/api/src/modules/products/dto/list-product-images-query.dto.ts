import { ListQueryDto } from '@/common/dto/list-query.dto'
import type { ProductImagesQuery } from '@biztrack/types'

/**
 * Query DTO for listing product images
 * Reuses base ListQueryDto with no additional filters
 */
export class ListProductImagesQueryDto extends ListQueryDto implements ProductImagesQuery { }
