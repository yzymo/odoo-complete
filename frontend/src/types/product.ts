/**
 * TypeScript types for Product data models.
 * Corresponds to backend Pydantic schemas.
 */

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
  products_extracted: number;
  products: Array<{
    id: string;
    name?: string;
    default_code?: string;
  }>;
}
