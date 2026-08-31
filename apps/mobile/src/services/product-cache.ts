import type { Product } from '../types/api';
import { getProducts } from './api';
import { getDb } from './db';

export function productsCacheKey(departmentId: number | undefined): string {
  return departmentId === undefined ? 'products_all' : `products_dept_${departmentId}`;
}

async function cacheSet(key: string, products: Product[]) {
  await getDb().runAsync(
    'INSERT OR REPLACE INTO app_cache (key, value_json, updated_at) VALUES (?, ?, ?)',
    key,
    JSON.stringify(products),
    Date.now(),
  );
}

/** Écrit le snapshot catalogue pour la caisse (toutes clés département). */
export async function writeCatalogCaches(products: Product[]): Promise<void> {
  await cacheSet(productsCacheKey(undefined), products);
  const byDept = new Map<number, Product[]>();
  for (const p of products) {
    const deptId = p.department?.id;
    if (typeof deptId !== 'number') continue;
    const list = byDept.get(deptId) ?? [];
    list.push(p);
    byDept.set(deptId, list);
  }
  await Promise.all(
    [...byDept.entries()].map(([deptId, list]) => cacheSet(productsCacheKey(deptId), list)),
  );
}

/** Charge les produits depuis l'API et met en cache SQLite ; si hors ligne / erreur réseau, lit le cache. */
export async function loadProductsWithCache(departmentId: number | undefined): Promise<Product[]> {
  const key = productsCacheKey(departmentId);
  try {
    const products = await getProducts(departmentId);
    if (departmentId === undefined) {
      await writeCatalogCaches(products);
    } else {
      await cacheSet(key, products);
    }
    return products;
  } catch {
    const row = await getDb().getFirstAsync<{ value_json: string }>(
      'SELECT value_json FROM app_cache WHERE key = ?',
      key,
    );
    if (row) return JSON.parse(row.value_json) as Product[];
    throw new Error('Catalogue indisponible (pas de réseau ni cache local)');
  }
}
