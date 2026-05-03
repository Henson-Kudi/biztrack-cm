// Shared stock status utility — extracted so ProductCard and PosProductTile
// don't duplicate this logic.

export interface StockStatus {
  label: string
  color: string
  bg: string
  isOut: boolean
  isLow: boolean
}

export function getStockStatus(qty: number, threshold: number): StockStatus {
  const isOut = qty <= 0
  const isLow = qty > 0 && qty <= threshold
  if (isOut) return { label: 'Rupture', color: '#E24B4A', bg: '#FCEBEB', isOut: true, isLow: false }
  if (isLow) return { label: 'Stock bas', color: '#BA7517', bg: '#FAEEDA', isOut: false, isLow: true }
  return { label: 'En stock', color: '#639922', bg: '#EAF3DE', isOut: false, isLow: false }
}

export const UNIT_LABELS: Record<string, string> = {
  piece: 'pce',
  kg: 'kg',
  litre: 'L',
  metre: 'm',
  box: 'bte',
  dozen: 'dz',
  pack: 'pack',
}
