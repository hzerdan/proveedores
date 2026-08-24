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
  is_active: boolean;
}

export interface Document {
  id: number;
  supplier_id: number;
  document_type_id: number;
  status: DocumentStatus;
  letter?: string;
  point_of_sale?: number;
  document_number?: number;
  human_reference: string;
  external_reference?: string;
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
  reference_id: number;
  reference_human_ref: string;
  reference_type_code: string;
  reference_type_name: string;
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
}

export interface OpenDocumentDetail {
  document_id: number;
  supplier_id: number;
  supplier_trade_name: string;
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
}
