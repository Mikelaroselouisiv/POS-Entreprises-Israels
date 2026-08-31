/** Vente retirée des totaux (annulée, remboursée ou soft-delete) mais encore visible pour audit. */
export function isSaleVoided(sale: {
  status: string;
  deletedAt?: string | null;
}): boolean {
  return Boolean(sale.deletedAt) || sale.status === 'CANCELLED' || sale.status === 'REFUNDED';
}

export function saleStatusAuditLabel(sale: {
  status: string;
  deletedAt?: string | null;
  creditCustomerId?: number | null;
}): string {
  if (sale.deletedAt) return 'Supprimée';
  if (sale.status === 'CANCELLED') return 'Annulée';
  if (sale.status === 'REFUNDED') return 'Remboursée';
  if (sale.creditCustomerId != null) return 'Crédit';
  return 'Complétée';
}
