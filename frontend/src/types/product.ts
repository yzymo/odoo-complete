/**
 * TypeScript types for Product data models.
 * Corresponds to backend Pydantic schemas.
 */

export interface OdooMatchInfo {
  odoo_id: number;
  score?: number;
  match_label?: string;
  /** True when applied automatically (score ≥ 90%). */
  auto: boolean;
  applied_fields: string[];
  matched_at?: string;
}

export interface ProductImage {
  image_id: string;
  is_main: boolean;
  original_filename: string;
  paths: {
    size_256?: string;
    size_512?: string;
    size_1024?: string;
    size_1920?: string;
  };
  extracted_from?: {
    file_path: string;
    page_number?: number;
    confidence: number;
  };
}

export interface ProductDocument {
  name: string;
  path: string;
}

export interface ProductSource {
  source_id: string;
  origin_file: string;
  origin_file_type: string;
  source_type?: string;        // "pdf" | "web_scrape" — set on new documents
  page_number?: number;
  extraction_type: string;
  extracted_text?: string;
  confidence_score: number;
  fields_extracted: string[];
  timestamp: string;
}

export interface ManualEdit {
  field: string;
  old_value: any;
  new_value: any;
  edited_date: string;
  edited_by?: string;
}

export interface ExtractionError {
  error_type: string;
  error_message: string;
  field?: string;
  timestamp: string;
}

export interface ExtractionMetadata {
  extraction_date: string;
  extraction_job_id?: string;
  status: 'raw' | 'enriched' | 'validated' | 'exported';
  validation_date?: string;
  validated_by?: string;
  field_confidence_scores: Record<string, number>;
  manual_edits: ManualEdit[];
  errors: ExtractionError[];
}

export interface Product {
  _id: string;

  // Identifiers
  default_code?: string;
  barcode?: string;
  Code_EAN?: string;  // Nom exact Odoo

  // Product Information
  name?: string;
  type: string;
  active: boolean;
  is_published: boolean;

  // Classification
  categ_id?: string;
  country_of_origin?: string;

  // Manufacturer
  constructeur?: string;
  refConstructeur?: string;  // Nom exact Odoo

  // Descriptions
  description_courte?: string;
  description_ecommerce?: string;
  features_description?: string;

  // Dimensions
  length?: number;
  width?: number;
  height?: number;
  weight?: number;

  // Logistics
  hs_code?: string;
  contient_du_lithium: boolean;

  // Pricing
  lst_price?: number;
  taxes_id: string[];

  // Media
  images: ProductImage[];
  image_512?: string;
  image_256?: string;
  image_1920?: string;
  image_1024?: string;
  product_template_image_ids: number[];
  /** Web-scraped image URLs: index 0 = main, rest = gallery */
  image_urls?: string[];
  source_url?: string;
  /** Web-scrape origin URLs (index 0 = primary). */
  scrape_source_urls?: string[];

  // Documents
  fiche_constructeur?: ProductDocument;
  fiche_technique?: ProductDocument;
  fiche_constructeur_nom?: string;
  fiche_technique_nom?: string;

  // Extraction Metadata
  sources: ProductSource[];
  extraction_metadata: ExtractionMetadata;

  // Odoo Integration
  product_tmpl_id?: number;
  odoo_product_tmpl_id?: number;
  odoo_id?: number;
  /** Link to the Odoo product this catalog product was matched/applied to. */
  odoo_match?: OdooMatchInfo;

  // Deduplication
  duplicate_group_id?: string;
  is_master_record: boolean;
  merged_from: string[];

  // Timestamps
  created_at: string;
  updated_at: string;
  write_date?: string;
}

export interface ProductListResponse {
  products: Product[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

/** One product inside a duplicate group (GET /products/duplicates/by-code). */
export interface DuplicateProduct {
  _id: string;
  name?: string;
  constructeur?: string;
  source_type?: string;
  status?: string;
  image_count: number;
}

export interface DuplicateGroup {
  default_code: string;
  count: number;
  products: DuplicateProduct[];
}

export interface DuplicatesByCodeResponse {
  groups: DuplicateGroup[];
  total_groups: number;
  page: number;
  limit: number;
  pages: number;
}

export interface ProductResponse {
  product: Product;
  message?: string;
}

export interface ProductUpdate {
  default_code?: string;
  barcode?: string;
  Code_EAN?: string;  // Nom exact Odoo
  name?: string;
  type?: string;
  active?: boolean;
  is_published?: boolean;
  categ_id?: string;
  country_of_origin?: string;
  constructeur?: string;
  refConstructeur?: string;  // Nom exact Odoo
  description_courte?: string;
  description_ecommerce?: string;
  features_description?: string;
  length?: number;
  width?: number;
  height?: number;
  weight?: number;
  hs_code?: string;
  contient_du_lithium?: boolean;
  lst_price?: number;
  taxes_id?: string[];
  fiche_constructeur_nom?: string;
  fiche_technique_nom?: string;
  edited_by?: string;
}

export interface ExtractionResult {
  message: string;
  filename: string;
  from_cache?: boolean;
  products_extracted: number;
  products: Array<{
    id: string;
    name?: string;
    default_code?: string;
  }>;
}

export interface ExtractionFileStatus {
  filename: string;
  /** pending → processing → done | cached | skipped | failed */
  status: 'pending' | 'processing' | 'done' | 'cached' | 'skipped' | 'failed';
  products: Array<{ id: string; name?: string; default_code?: string }>;
  product_count: number;
  from_cache: boolean;
  error: string | null;
}

export interface ExtractionJob {
  job_id: string;
  source: string;
  /** pending → running → done | failed */
  status: string;
  phase: string;
  phase_detail: string;
  created_at?: string;
  started_at?: string | null;
  finished_at?: string | null;
  total_files: number;
  processed_files: number;
  cached_files_count: number;
  failed_files_count: number;
  total_products: number;
  file_statuses: ExtractionFileStatus[];
  summary: {
    total_files: number;
    processed_successfully: number;
    cached: number;
    failed: number;
    total_products_extracted: number;
    images_processed?: number;
    images_associated?: number;
  } | null;
  error: string | null;
}
