import type { InventoryAlertsQuery } from '@biztrack/types'
import { ListQueryDto } from '@/common/dto/list-query.dto'

export class ListInventoryAlertsQueryDto extends ListQueryDto implements InventoryAlertsQuery {}
