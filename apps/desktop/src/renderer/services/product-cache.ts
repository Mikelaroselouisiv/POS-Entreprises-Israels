import { getProducts } from './api';
import * as localDb from './local-db-bridge';
import type { Product } from '../types/api';

export function productsCacheKey(departmentId: number | undefined): string {
  return departmentId === undefined ? 'products_all' : `products_dept_${departmentId}`;
}

function productDepartmentId(p: Product): number | undefined {
  const d = p.department?.id;
  return typeof d === 'number' ? d : undefined;
}

/** Écrit le snapshot catalogue pour la caisse (toutes clés département). */
export async function writeCatalogCaches(products: Product[]): Promise<void> {
  if (!localDb.hasLocalDb()) return;
  await localDb.cacheSet(productsCacheKey(undefined), JSON.stringify(products));
  const byDept = new Map<number, Product[]>();
  for (const p of products) {
    const deptId = productDepartmentId(p);
    if (deptId == null) continue;
    const list = byDept.get(deptId) ?? [];
    list.push(p);
    byDept.set(deptId, list);
  }
  await Promise.all(
    [...byDept.entries()].map(([deptId, list]) =>
      localDb.cacheSet(productsCacheKey(deptId), JSON.stringify(list)),
    ),
  );
}

/** Charge les produits depuis l’API et met en cache SQLite ; si hors ligne / erreur réseau, lit le cache. */
export async function loadProductsWithCache(departmentId: number | undefined): Promise<Product[]> {
  const key = productsCacheKey(departmentId);
  try {
    const products = await getProducts(departmentId);
    if (localDb.hasLocalDb()) {
      if (departmentId === undefined) {
        await writeCatalogCaches(products);
      } else {
        await localDb.cacheSet(key, JSON.stringify(products));
      }
    }
    return products;
  } catch {
    const raw = localDb.hasLocalDb() ? await localDb.cacheGet(key) : null;
    if (raw) {
      return JSON.parse(raw) as Product[];
    }
    throw new Error('Catalogue indisponible (pas de réseau ni cache local)');
  }
}
