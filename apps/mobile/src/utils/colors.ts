/**
 * Shared BizTrack brand color palette and style helpers.
 * Import from here instead of redeclaring constants per-screen.
 */

export const Colors = {
  NAVY:       '#042C53',
  BLUE:       '#185FA5',
  LIGHT_BLUE: '#378ADD',
  CREAM:      '#F1EFE8',
  GREEN:      '#639922',
  AMBER:      '#BA7517',
  PURPLE:     '#8B5CF6',
  WHITE:      '#FFFFFF',
  MUTED:      '#888780',
  BORDER:     '#D3D1C7',
} as const

/**
 * Appends a 2-character hex opacity suffix to a hex color string.
 * Safe — returns the original value unchanged if it is not a hex color.
 *
 * @example addOpacity(Colors.BLUE, '18') // '#185FA518'
 */
export function addOpacity(hex: string, opacity: string): string {
  if (!hex.startsWith('#')) return hex
  return `${hex}${opacity}`
}
