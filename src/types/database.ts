export type DocumentStatus = 'DRAFT' | 'CONFIRMED';
export type BalanceNature = 'DEBIT' | 'CREDIT' | 'NEUTRAL';
export type IntakeSource = 'MANUAL' | 'IMAGE' | 'PDF' | 'API' | 'IMPORT';
export type MovementType = 'ORIGIN' | 'IMPUTATION' | 'REMAINDER' | 'APL_TRANSFER' | 'REVERSAL' | 'DESIMPUTATION';
export type DerivedDocumentStatus = 
  | 'PAID' 
  | 'PARTIAL' 
  | 'PENDING' 
  | 'AVAILABLE_CREDIT' 
  | 'SETTLED_CREDIT' 
  | 'REVERSED' 
  | 'APL_TRANSFER' 
  | 'NEUTRAL';

export interface Role {
  id: number;
  name: string;
  code: string;
  description?: string;
}

export interface Permission {
  id: number;
  code: string;
  name: string;
  module: string;
  description?: string;
}

export interface Profile {
  id: number;
  user_id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  full_name: string;
  role_id: number;
  is_active: boolean;
  role?: Role;
  permissions?: string[];
  created_at: string;
}

export interface Supplier {
  id: number;
  code: string;
  tax_id: string;
  legal_name: string;
  trade_name: string;
  email?: string;
  phone?: string;
  is_active: boolean;
  notes?: string;
  strict_due_date_discount?: boolean;
  discount_payment_note?: string | null;
  created_at: string;
}

export interface Seller {
  id: number;
  code?: string;
  first_name: string;
  last_name: string;
  display_name: string;
  phone?: string;
  email?: string;
  is_active: boolean;
  notes?: string;
  created_by?: number;
  created_at: string;
  updated_at: string;
}

export interface SupplierSeller {
  id: number;
  supplier_id: number;
  seller_id: number;
  is_active: boolean;
  valid_from: string;
  valid_to?: string | null;
  notes?: string;
  created_by?: number;
  created_at: string;
  seller?: Seller;
  supplier?: Supplier;
}

export interface ActiveSupplierSeller {
  relationship_id: number;
  supplier_id: number;
  supplier_trade_name: string;
  supplier_tax_id: string;
  seller_id: number;
  seller_code?: string;
  seller_first_name: string;
  seller_last_name: string;
  seller_display_name: string;
  seller_phone?: string;
  seller_email?: string;
  valid_from: string;
  valid_to?: string | null;
  relationship_active: boolean;
  seller_active: boolean;
  is_currently_valid: boolean;
  notes?: string;
  created_at: string;
}

export interface SupplierContact {
  id: number;
  supplier_id: number;
  first_name?: string;
  last_name?: string;
  full_name: string;
  role_title?: string;
  email?: string;
  phone?: string;
  is_primary: boolean;
  is_active?: boolean;
}

export type NumberingMode = 'EXTERNAL' | 'INTERNAL_SEQUENCE';

export interface DocumentType {
  id: number;
  code: string;
  name: string;
  description?: string;
  balance_nature: BalanceNature;
  affects_account_balance: boolean;
  can_be_source_application: boolean;
  can_be_target_application: boolean;
  requires_due_date?: boolean;
  is_system_internal?: boolean;
  numbering_mode?: NumberingMode;
  is_active: boolean;
}

export interface DocumentNumberingSeries {
  id: number;
  document_type_id: number;
  point_of_sale: number;
  letter?: string | null;
  description?: string | null;
  next_number: number | null;
  is_active: boolean;
  is_exhausted?: boolean;
  exhausted_at?: string | null;
  created_at: string;
  updated_at: string;
  document_type?: DocumentType;
}

export interface DocumentNumberingSeriesAdjustment {
  id: number;
  series_id: number;
  old_next_number: number;
  new_next_number: number;
  reason: string;
  adjusted_by: number;
  adjusted_at: string;
  adjuster_name?: string;
}

export type FileRole = 'ORIGINAL' | 'AI_DERIVATIVE' | 'INVOICE' | 'RECEIPT' | 'CREDIT_NOTE' | 'PAYMENT_PROOF' | 'OTHER';

export interface DocumentFile {
  id: number;
  document_id: number;
  storage_path: string;
  file_name: string;
  file_size?: number;
  mime_type?: string;
  file_role: FileRole;
  source_file_id?: number | null;
  ai_extraction_id?: number | null;
  created_by?: number;
  created_at: string;
}

export type PunctualPaymentStatus = 'OVERDUE' | 'DUE_SOON' | 'ON_TIME' | 'NO_DUE_DATE';

export interface Document {
  id: number;
  supplier_id: number;
  seller_id?: number | null;
  document_type_id: number;
  status: DocumentStatus;
  letter?: string;
  point_of_sale?: number;
  document_number?: number;
  human_reference: string;
  external_reference?: string;
  numbering_series_id?: number | null;
  issue_date: string;
  due_date?: string;
  currency: string;
  exchange_rate: number;
  total_amount: number;
  concept?: string;
  notes?: string;
  intake_source: IntakeSource;
  created_by: number;
  confirmed_by?: number;
  confirmed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface AccountMovement {
  id: number;
  supplier_id: number;
  document_id: number;
  reference_id: number;
  line_number: number;
  movement_type: MovementType;
  movement_date: string;
  currency: string;
  amount: number;
  notes?: string;
  created_by: number;
  created_at: string;
}

export interface DocumentLedgerView {
  movement_id: number;
  supplier_id: number;
  supplier_trade_name: string;
  supplier_tax_id: string;
  movement_date: string;
  movement_type: MovementType;
  currency: string;
  amount: number;
  running_balance: number;
  document_id: number;
  document_human_ref: string;
  document_type_code: string;
  document_type_name: string;
  document_seller_id?: number | null;
  reference_id: number;
  reference_human_ref: string;
  reference_type_code: string;
  reference_type_name: string;
  reference_seller_id?: number | null;
  reference_seller_code?: string;
  reference_seller_name?: string;
  notes?: string;
  created_by: number;
  created_by_name: string;
  created_at: string;
}

export interface DocumentSummaryView {
  document_id: number;
  supplier_id: number;
  supplier_trade_name: string;
  supplier_tax_id: string;
  seller_id?: number | null;
  seller_code?: string;
  seller_display_name?: string;
  document_type_id: number;
  document_type_code: string;
  document_type_name: string;
  balance_nature: BalanceNature;
  status: DocumentStatus;
  letter?: string;
  point_of_sale?: number;
  document_number?: number;
  human_reference: string;
  issue_date: string;
  due_date?: string;
  currency: string;
  total_amount: number;
  signed_total_amount: number;
  reference_balance: number;
  total_emitted_amount: number;
  derived_status: DerivedDocumentStatus;
  concept?: string;
  notes?: string;
  created_by: number;
  created_by_name: string;
  created_at: string;
  numbering_series_id?: number | null;
  files_count?: number;
  strict_due_date_discount?: boolean;
  discount_payment_note?: string | null;
}

export type DocumentBalanceView = DocumentSummaryView;

export interface SupplierAccountSummary {
  supplier_id: number;
  trade_name: string;
  legal_name: string;
  tax_id: string;
  currency: string;
  total_debits: number;
  total_credits: number;
  total_pending_debt: number;
  total_available_credit: number;
  net_account_balance: number;
}

export interface SupplierSellerBreakdownRow {
  supplier_id: number;
  currency: string;
  seller_id: number | null;
  seller_code: string | null;
  seller_display_name: string;
  is_unassigned_debt: boolean;
  is_free_credit: boolean;
  item_category: 'SELLER' | 'UNASSIGNED_DEBT' | 'FREE_CREDIT';
  row_category?: 'SELLER' | 'UNASSIGNED_DEBT' | 'FREE_CREDIT';
  open_doc_count: number;
  open_documents_count?: number;
  total_debit_amount: number;
  pending_debt?: number;
  total_credit_amount: number;
  available_credit?: number;
  net_balance: number;
}

export interface SellerAccountSummary {
  seller_id: number;
  seller_code: string;
  seller_display_name: string;
  seller_email?: string;
  seller_phone?: string;
  seller_is_active: boolean;
  currency: string;
  active_suppliers_count: number;
  open_documents_count: number;
  total_pending_debt: number;
  total_available_credit: number;
  net_seller_balance: number;
}

export interface SellerAgingRow {
  seller_id: number;
  seller_code: string;
  seller_display_name: string;
  currency: string;
  overdue_gt_60: number;
  overdue_31_60: number;
  overdue_1_30: number;
  due_0_30: number;
  due_31_60: number;
  due_gt_60: number;
  no_due_date_amount: number;
  total_pending_debt: number;
  net_total_balance: number;
  active_suppliers_count: number;
}

export interface SellerPaymentProjectionRecord {
  seller_id: number;
  seller_code: string;
  seller_display_name: string;
  currency: string;
  bucket_type: 'OVERDUE' | 'WEEK' | 'NO_DUE_DATE';
  week_start: string | null;
  week_end: string | null;
  amount: number;
  doc_count: number;
  suppliers_count: number;
}

export interface SellerSuppliersSummaryRow {
  supplier_id: number;
  supplier_code: string;
  supplier_trade_name: string;
  supplier_tax_id: string;
  currency: string;
  relationship_id: number | null;
  relationship_active: boolean;
  valid_from: string | null;
  valid_to: string | null;
  open_doc_count: number;
  pending_debt: number;
  available_credit: number;
  net_balance: number;
}

export interface SupplierAgingRow {
  supplier_id: number;
  supplier_trade_name: string;
  supplier_tax_id: string;
  currency: string;
  overdue_gt_60: number;
  overdue_31_60: number;
  overdue_1_30: number;
  due_0_30: number;
  due_31_60: number;
  due_gt_60: number;
  no_due_date_amount: number;
  free_credits_amount: number;
  total_pending_debt: number;
  net_total_balance: number;
  strict_due_date_discount?: boolean;
  discount_payment_note?: string | null;
  min_due_date?: string | null;
  has_no_due_date_docs?: boolean;
}

export interface PaymentProjectionRecord {
  supplier_id: number;
  supplier_trade_name: string;
  supplier_tax_id: string;
  currency: string;
  bucket_type: 'OVERDUE' | 'WEEK' | 'NO_DUE_DATE';
  week_start: string | null;
  week_end: string | null;
  amount: number;
  doc_count: number;
  strict_due_date_discount?: boolean;
  discount_payment_note?: string | null;
  min_due_date?: string | null;
  has_no_due_date_docs?: boolean;
}

export interface OpenDocumentDetail {
  document_id: number;
  supplier_id: number;
  supplier_trade_name: string;
  seller_id?: number | null;
  seller_display_name?: string | null;
  human_reference: string;
  document_type_code: string;
  document_type_name: string;
  balance_nature: string;
  issue_date: string;
  due_date: string | null;
  currency: string;
  total_amount: number;
  reference_balance: number;
  concept?: string;
  notes?: string;
  files_count?: number;
  strict_due_date_discount?: boolean;
  discount_payment_note?: string | null;
}

export type DocumentSellerChangeType = 'HISTORICAL_ASSIGNMENT' | 'CORRECTION';

export type DocumentSellerRelationValidityStatus =
  | 'VALID_FOR_DOCUMENT_DATE'
  | 'CURRENT_RELATION_OUTSIDE_DOCUMENT_DATE'
  | 'HISTORICAL_RELATION_OUTSIDE_DOCUMENT_DATE';

export interface DocumentSellerHistory {
  id: number;
  document_id: number;
  old_seller_id?: number | null;
  new_seller_id: number;
  change_type: DocumentSellerChangeType;
  relation_validity_status: DocumentSellerRelationValidityStatus;
  reason: string;
  changed_by: number;
  changed_at: string;
  old_seller?: Seller | null;
  new_seller?: Seller | null;
  changer?: Profile | null;
  document?: Document | null;
}

export interface EligibleSellerForDocument {
  relationship_id: number;
  seller_id: number;
  seller_code?: string;
  first_name: string;
  last_name: string;
  display_name: string;
  phone?: string;
  email?: string;
  valid_from: string;
  valid_to?: string | null;
  is_relationship_active: boolean;
  is_seller_active: boolean;
  relation_validity_status: DocumentSellerRelationValidityStatus;
  relation_validity_label: string;
}

