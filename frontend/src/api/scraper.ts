import apiClient from './client';

export interface ScrapedProduct {
  name: string;
  default_code: string | null;
  barcode: string | null;
  code_ean: string | null;
  constructeur: string | null;
  ref_constructeur: string | null;
  description_courte: string | null;
  features_description: string | null;
  list_price: number | null;
  source_url: string;
  /** Extracted image URLs: index 0 = main (→ image_1920), rest = gallery.
   *  Optional — old cached results pre-dating this feature may omit the field. */
  image_urls?: string[];
}

export interface ScrapedOdooMatch {
  odoo_id: number;
  name: string;
  default_code: string | null;
  barcode: string | null;
  code_ean: string | null;
  constructeur: string | null;
  ref_constructeur: string | null;
  list_price: number | null;
  image_128: string | null;
  score: number;
  match_type: string;
  match_label: string;
}

export interface ScrapeProductResult {
  scraped: ScrapedProduct;
  odoo_matches: ScrapedOdooMatch[];
}

export interface ScrapeResponse {
  url: string;
  total_products: number;
  total_matched: number;
  warning: string | null;
  products: ScrapeProductResult[];
}

/** Per-product status entry populated during a category crawl. */
export interface ProductStatus {
  source_url: string;
  name: string | null;
  /** pending → scraping → extracting → matching → done | failed */
  status: 'pending' | 'scraping' | 'extracting' | 'matching' | 'done' | 'failed';
  scraped: ScrapedProduct | null;
  odoo_matches: ScrapedOdooMatch[];
  error: string | null;
}

export interface ScrapeJobResponse extends ScrapeResponse {
  job_id: string;
  /** "pending" | "running" | "done" | "failed" */
  status: string;
  from_cache: boolean;
  error?: string | null;
  /** Current phase label, e.g. "fetching" | "extracting" | "matching" | "crawling" | "scraping" */
  phase?: string;
  phase_detail?: string;
  /** For category crawls: live per-product status entries */
  product_statuses?: ProductStatus[];
  /** How many products have been fully processed so far */
  processed?: number;
}

export const scraperApi = {
  scrapeUrl: async (url: string): Promise<ScrapeJobResponse> => {
    const { data } = await apiClient.post<ScrapeJobResponse>('/scraper/scrape', { url });
    return data;
  },

  getJob: async (jobId: string): Promise<ScrapeJobResponse> => {
    const { data } = await apiClient.get<ScrapeJobResponse>(`/scraper/jobs/${jobId}`);
    return data;
  },
};
