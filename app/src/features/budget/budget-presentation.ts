export function budgetRemainingRingPercent(totalLimitMinor: number, spentMinor: number): number {
  if (totalLimitMinor <= 0) return 0
  const spentPercent = (spentMinor / totalLimitMinor) * 100
  return Math.max(0, 100 - Math.min(100, spentPercent))
}
