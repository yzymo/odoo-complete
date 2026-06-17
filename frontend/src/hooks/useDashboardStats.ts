import { useQuery } from "@tanstack/react-query";
import { productApi } from "../api/products";
import { odooApi } from "../api/odoo";

/**
 * Consolidates the dashboard metrics from EXISTING endpoints only:
 *   - GET /export/stats        → totals + by-status + image coverage
 *   - GET /products/duplicates → duplicate group count
 *   - GET /odoo/test-connection→ connection banner
 * Values are `null` when their source hasn't loaded (→ graceful "—"); a missing
 * status key on loaded stats correctly resolves to 0. No metric is invented.
 */
export function useDashboardStats() {
  const statsQuery = useQuery({
    queryKey: ["export-stats"],
    queryFn: () => productApi.getExportStats(),
  });

  const duplicatesQuery = useQuery({
    queryKey: ["duplicates-count"],
    queryFn: () => productApi.getDuplicatesByCode({ page: 1, limit: 1, min_count: 2 }),
  });

  const odooQuery = useQuery({
    queryKey: ["odoo-connection"],
    queryFn: () => odooApi.testConnection(),
    retry: 0,
  });

  const stats = statsQuery.data;
  const byStatus = stats?.by_status ?? {};
  const statusValue = (key: string): number | null => (stats ? byStatus[key] ?? 0 : null);

  return {
    isLoading: statsQuery.isLoading,
    isError: statsQuery.isError,
    refetch: () => {
      statsQuery.refetch();
      duplicatesQuery.refetch();
      odooQuery.refetch();
    },

    total: stats ? stats.total_products : null,
    raw: statusValue("raw"),
    enriched: statusValue("enriched"),
    validated: statusValue("validated"),
    exported: statusValue("exported"),
    withoutImages: stats ? stats.without_images : null,

    duplicateGroups: duplicatesQuery.data?.total_groups ?? null,
    duplicatesLoading: duplicatesQuery.isLoading,

    odoo: odooQuery.data,
    odooLoading: odooQuery.isLoading,
  };
}
