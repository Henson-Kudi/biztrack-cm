import { getApiErrorMessage } from '@/services/api-response'
import { ProductLocalError } from '@/services/products.local'

type Translate = (key: string) => string

export function getCategoryErrorMessage(error: unknown, t: Translate, fallback: string) {
  if (error instanceof ProductLocalError) {
    switch (error.code) {
      case 'BUSINESS_REQUIRED':
        return t('errors.business_required')
      case 'CATEGORY_NOT_FOUND':
        return t('errors.category_not_found')
      case 'CATEGORY_NAME_REQUIRED':
        return t('errors.category_name_required')
      case 'CATEGORY_NAME_TOO_LONG':
        return t('errors.category_name_too_long')
      case 'CATEGORY_NAME_IN_USE':
        return t('errors.category_name_in_use')
      case 'CATEGORY_COLOR_INVALID':
        return t('errors.category_color_invalid')
      case 'CATEGORY_ICON_TOO_LONG':
        return t('errors.category_icon_too_long')
      case 'CATEGORY_IMAGE_URL_TOO_LONG':
        return t('errors.category_image_url_too_long')
      case 'CATEGORY_SORT_ORDER_INVALID':
        return t('errors.category_sort_order_invalid')
      case 'CATEGORY_HAS_PRODUCTS':
        return t('errors.category_has_products')
      case 'CATEGORY_SAVE_RELOAD_FAILED':
        return t('errors.category_save_reload_failed')
      default:
        break
    }
  }

  return getApiErrorMessage(error, fallback)
}

export function getUnitErrorMessage(error: unknown, t: Translate, fallback: string) {
  if (error instanceof ProductLocalError) {
    switch (error.code) {
      case 'BUSINESS_REQUIRED':
        return t('errors.business_required')
      case 'UNIT_NOT_FOUND':
        return t('errors.unit_not_found')
      case 'UNIT_NAME_REQUIRED':
        return t('errors.unit_name_required')
      case 'UNIT_NAME_TOO_LONG':
        return t('errors.unit_name_too_long')
      case 'UNIT_NAME_IN_USE':
        return t('errors.unit_name_in_use')
      case 'UNIT_ABBREVIATION_REQUIRED':
        return t('errors.unit_abbreviation_required')
      case 'UNIT_ABBREVIATION_TOO_LONG':
        return t('errors.unit_abbreviation_too_long')
      case 'UNIT_TYPE_INVALID':
        return t('errors.unit_type_invalid')
      case 'UNIT_SYSTEM_IMMUTABLE':
        return t('errors.unit_system_immutable')
      case 'UNIT_HAS_PRODUCTS':
        return t('errors.unit_has_products')
      case 'UNIT_SAVE_RELOAD_FAILED':
        return t('errors.unit_save_reload_failed')
      default:
        break
    }
  }

  return getApiErrorMessage(error, fallback)
}
