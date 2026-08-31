/** Réutilise les lignes existantes (même minQuantity) pour ne pas casser la sync ni l’unicité. */

export function pickTierByMinQty<
  T extends { id: number; minQuantity: unknown; deletedAt: Date | null },
>(existing: T[]): { byMin: Map<number, T>; duplicateIds: number[] } {
  const byMin = new Map<number, T>();
  const duplicateIds: number[] = [];
  for (const row of existing) {
    const key = Number(row.minQuantity);
    const prev = byMin.get(key);
    if (!prev) {
      byMin.set(key, row);
      continue;
    }
    const preferNew = row.deletedAt == null && prev.deletedAt != null;
    if (preferNew) {
      duplicateIds.push(prev.id);
      byMin.set(key, row);
    } else {
      duplicateIds.push(row.id);
    }
  }
  return { byMin, duplicateIds };
}
