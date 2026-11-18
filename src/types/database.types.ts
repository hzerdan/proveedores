export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      _bak_application_reversals: {
        Row: {
          application_id: number | null
          created_at: string | null
          created_by: number | null
          id: number | null
          reversal_document_id: number | null
          reversal_reason: string | null
        }
        Insert: {
          application_id?: number | null
          created_at?: string | null
          created_by?: number | null
          id?: number | null
          reversal_document_id?: number | null
          reversal_reason?: string | null
        }
        Update: {
          application_id?: number | null
          created_at?: string | null
          created_by?: number | null
          id?: number | null
          reversal_document_id?: number | null
          reversal_reason?: string | null
        }
        Relationships: []
      }
      _bak_document_applications: {
        Row: {
          application_date: string | null
          applied_amount: number | null
          created_at: string | null
          created_by: number | null
          id: number | null
          notes: string | null
          source_document_id: number | null
          target_document_id: number | null
        }
        Insert: {
          application_date?: string | null
          applied_amount?: number | null
          created_at?: string | null
          created_by?: number | null
          id?: number | null
          notes?: string | null
          source_document_id?: number | null
          target_document_id?: number | null
        }
        Update: {
          application_date?: string | null
          applied_amount?: number | null
          created_at?: string | null
          created_by?: number | null
          id?: number | null
          notes?: string | null
          source_document_id?: number | null
          target_document_id?: number | null
        }
        Relationships: []
      }
      account_movements: {
        Row: {
          amount: number
          created_at: string
          created_by: number
          currency: string
          document_id: number
          id: number
          line_number: number
          movement_date: string
          movement_type: string
          notes: string | null
          reference_id: number
          supplier_id: number
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: number
          currency?: string
          document_id: number
          id?: never
          line_number?: number
          movement_date: string
          movement_type: string
          notes?: string | null
          reference_id: number
          supplier_id: number
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: number
          currency?: string
          document_id?: number
          id?: never
          line_number?: number
          movement_date?: string
          movement_type?: string
          notes?: string | null
          reference_id?: number
          supplier_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "account_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_movements_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_movements_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "v_document_summary"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "account_movements_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "v_open_reference_balances"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "account_movements_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_movements_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "v_document_summary"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "account_movements_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "v_open_reference_balances"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "account_movements_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_movements_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "v_supplier_account_summary"
            referencedColumns: ["supplier_id"]
          },
        ]
      }
      document_ai_extractions: {
        Row: {
          confidence_score: number | null
          confirmed_at: string | null
          confirmed_by: number | null
          confirmed_payload_diff: Json | null
          created_by: number
          document_id: number | null
          error_message: string | null
          extracted_at: string
          extracted_raw_payload: Json
          extraction_duration_ms: number | null
          file_id: number
          id: number
          model_name: string
          model_provider: string
          status: string
        }
        Insert: {
          confidence_score?: number | null
          confirmed_at?: string | null
          confirmed_by?: number | null
          confirmed_payload_diff?: Json | null
          created_by: number
          document_id?: number | null
          error_message?: string | null
          extracted_at?: string
          extracted_raw_payload: Json
          extraction_duration_ms?: number | null
          file_id: number
          id?: never
          model_name: string
          model_provider: string
          status?: string
        }
        Update: {
          confidence_score?: number | null
          confirmed_at?: string | null
          confirmed_by?: number | null
          confirmed_payload_diff?: Json | null
          created_by?: number
          document_id?: number | null
          error_message?: string | null
          extracted_at?: string
          extracted_raw_payload?: Json
          extraction_duration_ms?: number | null
          file_id?: number
          id?: never
          model_name?: string
          model_provider?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_ai_extractions_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_ai_extractions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_ai_extractions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_ai_extractions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "v_document_summary"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "document_ai_extractions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "v_open_reference_balances"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "document_ai_extractions_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "document_files"
            referencedColumns: ["id"]
          },
        ]
      }
      document_files: {
        Row: {
          created_at: string
          document_id: number | null
          file_category: string
          file_hash: string | null
          file_name: string
          file_size_bytes: number
          id: number
          mime_type: string
          parent_file_id: number | null
          storage_bucket: string
          storage_path: string
          uploaded_by: number
        }
        Insert: {
          created_at?: string
          document_id?: number | null
          file_category?: string
          file_hash?: string | null
          file_name: string
          file_size_bytes: number
          id?: never
          mime_type: string
          parent_file_id?: number | null
          storage_bucket?: string
          storage_path: string
          uploaded_by: number
        }
        Update: {
          created_at?: string
          document_id?: number | null
          file_category?: string
          file_hash?: string | null
          file_name?: string
          file_size_bytes?: number
          id?: never
          mime_type?: string
          parent_file_id?: number | null
          storage_bucket?: string
          storage_path?: string
          uploaded_by?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_files_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_files_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "v_document_summary"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "document_files_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "v_open_reference_balances"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "document_files_parent_file_id_fkey"
            columns: ["parent_file_id"]
            isOneToOne: false
            referencedRelation: "document_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      document_numbering_series: {
        Row: {
          created_at: string
          created_by: number
          description: string | null
          document_type_id: number
          exhausted_at: string | null
          id: number
          is_active: boolean
          is_exhausted: boolean
          letter: string | null
          next_number: number | null
          point_of_sale: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: number
          description?: string | null
          document_type_id: number
          exhausted_at?: string | null
          id?: never
          is_active?: boolean
          is_exhausted?: boolean
          letter?: string | null
          next_number?: number | null
          point_of_sale: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: number
          description?: string | null
          document_type_id?: number
          exhausted_at?: string | null
          id?: never
          is_active?: boolean
          is_exhausted?: boolean
          letter?: string | null
          next_number?: number | null
          point_of_sale?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_numbering_series_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_numbering_series_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_numbering_series_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "v_open_reference_balances"
            referencedColumns: ["document_type_id"]
          },
        ]
      }
      document_numbering_series_adjustments: {
        Row: {
          adjusted_by: number
          created_at: string
          id: number
          new_number: number
          previous_number: number
          reason: string
          series_id: number
        }
        Insert: {
          adjusted_by: number
          created_at?: string
          id?: never
          new_number: number
          previous_number: number
          reason: string
          series_id: number
        }
        Update: {
          adjusted_by?: number
          created_at?: string
          id?: never
          new_number?: number
          previous_number?: number
          reason?: string
          series_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_numbering_series_adjustments_adjusted_by_fkey"
            columns: ["adjusted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_numbering_series_adjustments_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "document_numbering_series"
            referencedColumns: ["id"]
          },
        ]
      }
      document_seller_history: {
        Row: {
          change_type: string
          changed_at: string
          changed_by: number
          document_id: number
          id: number
          new_seller_id: number
          old_seller_id: number | null
          reason: string
          relation_validity_status: string
        }
        Insert: {
          change_type: string
          changed_at?: string
          changed_by: number
          document_id: number
          id?: never
          new_seller_id: number
          old_seller_id?: number | null
          reason: string
          relation_validity_status: string
        }
        Update: {
          change_type?: string
          changed_at?: string
          changed_by?: number
          document_id?: number
          id?: never
          new_seller_id?: number
          old_seller_id?: number | null
          reason?: string
          relation_validity_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_seller_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_seller_history_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_seller_history_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "v_document_summary"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "document_seller_history_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "v_open_reference_balances"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "document_seller_history_new_seller_id_fkey"
            columns: ["new_seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_seller_history_new_seller_id_fkey"
            columns: ["new_seller_id"]
            isOneToOne: false
            referencedRelation: "v_seller_account_summary"
            referencedColumns: ["seller_id"]
          },
          {
            foreignKeyName: "document_seller_history_old_seller_id_fkey"
            columns: ["old_seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_seller_history_old_seller_id_fkey"
            columns: ["old_seller_id"]
            isOneToOne: false
            referencedRelation: "v_seller_account_summary"
            referencedColumns: ["seller_id"]
          },
        ]
      }
      document_types: {
        Row: {
          affects_account_balance: boolean
          balance_nature: string
          can_be_source_application: boolean
          can_be_target_application: boolean
          code: string
          created_at: string
          description: string | null
          id: number
          is_active: boolean
          is_system_internal: boolean
          name: string
          numbering_mode: string
          requires_due_date: boolean
        }
        Insert: {
          affects_account_balance?: boolean
          balance_nature: string
          can_be_source_application?: boolean
          can_be_target_application?: boolean
          code: string
          created_at?: string
          description?: string | null
          id?: never
          is_active?: boolean
          is_system_internal?: boolean
          name: string
          numbering_mode?: string
          requires_due_date?: boolean
        }
        Update: {
          affects_account_balance?: boolean
          balance_nature?: string
          can_be_source_application?: boolean
          can_be_target_application?: boolean
          code?: string
          created_at?: string
          description?: string | null
          id?: never
          is_active?: boolean
          is_system_internal?: boolean
          name?: string
          numbering_mode?: string
          requires_due_date?: boolean
        }
        Relationships: []
      }
      document_upload_sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: number | null
          document_id: number | null
          expires_at: string
          file_id: number | null
          id: string
          status: string
          storage_path: string | null
          token_hash: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: number | null
          document_id?: number | null
          expires_at: string
          file_id?: number | null
          id?: string
          status?: string
          storage_path?: string | null
          token_hash: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: number | null
          document_id?: number | null
          expires_at?: string
          file_id?: number | null
          id?: string
          status?: string
          storage_path?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_upload_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_upload_sessions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_upload_sessions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "v_document_summary"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "document_upload_sessions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "v_open_reference_balances"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "document_upload_sessions_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "document_files"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          concept: string | null
          confirmed_at: string | null
          confirmed_by: number | null
          created_at: string
          created_by: number
          currency: string
          document_number: number | null
          document_type_id: number
          due_date: string | null
          exchange_rate: number
          external_reference: string | null
          human_reference: string
          id: number
          intake_source: string
          issue_date: string
          letter: string | null
          notes: string | null
          numbering_series_id: number | null
          point_of_sale: number | null
          seller_id: number | null
          status: string
          supplier_id: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          concept?: string | null
          confirmed_at?: string | null
          confirmed_by?: number | null
          created_at?: string
          created_by: number
          currency?: string
          document_number?: number | null
          document_type_id: number
          due_date?: string | null
          exchange_rate?: number
          external_reference?: string | null
          human_reference: string
          id?: never
          intake_source?: string
          issue_date: string
          letter?: string | null
          notes?: string | null
          numbering_series_id?: number | null
          point_of_sale?: number | null
          seller_id?: number | null
          status?: string
          supplier_id: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          concept?: string | null
          confirmed_at?: string | null
          confirmed_by?: number | null
          created_at?: string
          created_by?: number
          currency?: string
          document_number?: number | null
          document_type_id?: number
          due_date?: string | null
          exchange_rate?: number
          external_reference?: string | null
          human_reference?: string
          id?: never
          intake_source?: string
          issue_date?: string
          letter?: string | null
          notes?: string | null
          numbering_series_id?: number | null
          point_of_sale?: number | null
          seller_id?: number | null
          status?: string
          supplier_id?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "v_open_reference_balances"
            referencedColumns: ["document_type_id"]
          },
          {
            foreignKeyName: "documents_numbering_series_id_fkey"
            columns: ["numbering_series_id"]
            isOneToOne: false
            referencedRelation: "document_numbering_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "v_seller_account_summary"
            referencedColumns: ["seller_id"]
          },
          {
            foreignKeyName: "documents_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "v_supplier_account_summary"
            referencedColumns: ["supplier_id"]
          },
        ]
      }
      duplicate_override_logs: {
        Row: {
          authorized_at: string
          authorized_by: number
          document_id: number
          id: number
          matched_document_id: number
          reason: string
        }
        Insert: {
          authorized_at?: string
          authorized_by: number
          document_id: number
          id?: never
          matched_document_id: number
          reason: string
        }
        Update: {
          authorized_at?: string
          authorized_by?: number
          document_id?: number
          id?: never
          matched_document_id?: number
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "duplicate_override_logs_authorized_by_fkey"
            columns: ["authorized_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duplicate_override_logs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duplicate_override_logs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "v_document_summary"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "duplicate_override_logs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "v_open_reference_balances"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "duplicate_override_logs_matched_document_id_fkey"
            columns: ["matched_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duplicate_override_logs_matched_document_id_fkey"
            columns: ["matched_document_id"]
            isOneToOne: false
            referencedRelation: "v_document_summary"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "duplicate_override_logs_matched_document_id_fkey"
            columns: ["matched_document_id"]
            isOneToOne: false
            referencedRelation: "v_open_reference_balances"
            referencedColumns: ["document_id"]
          },
        ]
      }
      permissions: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: number
          module: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: never
          module: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: never
          module?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          auth_user_id: string
          created_at: string
          email: string
          first_name: string
          id: number
          is_active: boolean
          last_name: string
          updated_at: string
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          email: string
          first_name: string
          id?: never
          is_active?: boolean
          last_name: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          email?: string
          first_name?: string
          id?: never
          is_active?: boolean
          last_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          assigned_at: string
          permission_id: number
          role_id: number
        }
        Insert: {
          assigned_at?: string
          permission_id: number
          role_id: number
        }
        Update: {
          assigned_at?: string
          permission_id?: number
          role_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: number
          is_active: boolean
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: never
          is_active?: boolean
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: never
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      sellers: {
        Row: {
          code: string | null
          created_at: string
          created_by: number | null
          display_name: string
          email: string | null
          first_name: string
          id: number
          is_active: boolean
          last_name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          created_by?: number | null
          display_name: string
          email?: string | null
          first_name: string
          id?: never
          is_active?: boolean
          last_name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          created_by?: number | null
          display_name?: string
          email?: string | null
          first_name?: string
          id?: never
          is_active?: boolean
          last_name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sellers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_contacts: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          first_name: string
          id: number
          is_active: boolean
          last_name: string
          notes: string | null
          phone: string | null
          role_title: string
          supplier_id: number
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          first_name: string
          id?: never
          is_active?: boolean
          last_name: string
          notes?: string | null
          phone?: string | null
          role_title: string
          supplier_id: number
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          first_name?: string
          id?: never
          is_active?: boolean
          last_name?: string
          notes?: string | null
          phone?: string | null
          role_title?: string
          supplier_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_contacts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_contacts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "v_supplier_account_summary"
            referencedColumns: ["supplier_id"]
          },
        ]
      }
      supplier_sellers: {
        Row: {
          created_at: string
          created_by: number | null
          id: number
          is_active: boolean
          notes: string | null
          seller_id: number
          supplier_id: number
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          id?: never
          is_active?: boolean
          notes?: string | null
          seller_id: number
          supplier_id: number
          valid_from?: string
          valid_to?: string | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          id?: never
          is_active?: boolean
          notes?: string | null
          seller_id?: number
          supplier_id?: number
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_sellers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_sellers_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_sellers_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "v_seller_account_summary"
            referencedColumns: ["seller_id"]
          },
          {
            foreignKeyName: "supplier_sellers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_sellers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "v_supplier_account_summary"
            referencedColumns: ["supplier_id"]
          },
        ]
      }
      suppliers: {
        Row: {
          code: string
          created_at: string
          created_by: number
          discount_payment_note: string | null
          email: string | null
          id: number
          is_active: boolean
          legal_name: string
          notes: string | null
          phone: string | null
          strict_due_date_discount: boolean
          tax_id: string
          trade_name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by: number
          discount_payment_note?: string | null
          email?: string | null
          id?: never
          is_active?: boolean
          legal_name: string
          notes?: string | null
          phone?: string | null
          strict_due_date_discount?: boolean
          tax_id: string
          trade_name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: number
          discount_payment_note?: string | null
          email?: string | null
          id?: never
          is_active?: boolean
          legal_name?: string
          notes?: string | null
          phone?: string | null
          strict_due_date_discount?: boolean
          tax_id?: string
          trade_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          assigned_at: string
          role_id: number
          user_id: number
        }
        Insert: {
          assigned_at?: string
          role_id: number
          user_id: number
        }
        Update: {
          assigned_at?: string
          role_id?: number
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_active_supplier_sellers: {
        Row: {
          created_at: string | null
          is_currently_valid: boolean | null
          notes: string | null
          relationship_active: boolean | null
          relationship_id: number | null
          seller_active: boolean | null
          seller_code: string | null
          seller_display_name: string | null
          seller_email: string | null
          seller_first_name: string | null
          seller_id: number | null
          seller_last_name: string | null
          seller_phone: string | null
          supplier_id: number | null
          supplier_tax_id: string | null
          supplier_trade_name: string | null
          valid_from: string | null
          valid_to: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_sellers_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_sellers_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "v_seller_account_summary"
            referencedColumns: ["seller_id"]
          },
          {
            foreignKeyName: "supplier_sellers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_sellers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "v_supplier_account_summary"
            referencedColumns: ["supplier_id"]
          },
        ]
      }
      v_document_ledger: {
        Row: {
          amount: number | null
          created_at: string | null
          created_by: number | null
          created_by_name: string | null
          currency: string | null
          document_human_ref: string | null
          document_id: number | null
          document_seller_id: number | null
          document_type_code: string | null
          document_type_name: string | null
          movement_date: string | null
          movement_id: number | null
          movement_type: string | null
          notes: string | null
          reference_human_ref: string | null
          reference_id: number | null
          reference_seller_code: string | null
          reference_seller_id: number | null
          reference_seller_name: string | null
          reference_type_code: string | null
          reference_type_name: string | null
          running_balance: number | null
          supplier_id: number | null
          supplier_tax_id: string | null
          supplier_trade_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_movements_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_movements_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "v_document_summary"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "account_movements_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "v_open_reference_balances"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "account_movements_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_movements_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "v_document_summary"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "account_movements_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "v_open_reference_balances"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "account_movements_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_movements_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "v_supplier_account_summary"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "documents_seller_id_fkey"
            columns: ["reference_seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_seller_id_fkey"
            columns: ["document_seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_seller_id_fkey"
            columns: ["reference_seller_id"]
            isOneToOne: false
            referencedRelation: "v_seller_account_summary"
            referencedColumns: ["seller_id"]
          },
          {
            foreignKeyName: "documents_seller_id_fkey"
            columns: ["document_seller_id"]
            isOneToOne: false
            referencedRelation: "v_seller_account_summary"
            referencedColumns: ["seller_id"]
          },
        ]
      }
      v_document_summary: {
        Row: {
          balance_nature: string | null
          concept: string | null
          created_at: string | null
          created_by: number | null
          created_by_name: string | null
          currency: string | null
          derived_status: string | null
          discount_payment_note: string | null
          document_id: number | null
          document_number: number | null
          document_type_code: string | null
          document_type_id: number | null
          document_type_name: string | null
          due_date: string | null
          files_count: number | null
          human_reference: string | null
          issue_date: string | null
          letter: string | null
          notes: string | null
          numbering_series_id: number | null
          point_of_sale: number | null
          primary_file_mime: string | null
          primary_file_name: string | null
          reference_balance: number | null
          seller_code: string | null
          seller_display_name: string | null
          seller_id: number | null
          signed_total_amount: number | null
          status: string | null
          strict_due_date_discount: boolean | null
          supplier_id: number | null
          supplier_tax_id: string | null
          supplier_trade_name: string | null
          total_amount: number | null
          total_emitted_amount: number | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "v_open_reference_balances"
            referencedColumns: ["document_type_id"]
          },
          {
            foreignKeyName: "documents_numbering_series_id_fkey"
            columns: ["numbering_series_id"]
            isOneToOne: false
            referencedRelation: "document_numbering_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "v_seller_account_summary"
            referencedColumns: ["seller_id"]
          },
          {
            foreignKeyName: "documents_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "v_supplier_account_summary"
            referencedColumns: ["supplier_id"]
          },
        ]
      }
      v_open_reference_balances: {
        Row: {
          balance_nature: string | null
          concept: string | null
          currency: string | null
          discount_payment_note: string | null
          document_id: number | null
          document_type_code: string | null
          document_type_id: number | null
          document_type_name: string | null
          due_date: string | null
          human_reference: string | null
          issue_date: string | null
          notes: string | null
          numbering_series_id: number | null
          reference_balance: number | null
          seller_code: string | null
          seller_display_name: string | null
          seller_id: number | null
          status: string | null
          strict_due_date_discount: boolean | null
          supplier_id: number | null
          supplier_legal_name: string | null
          supplier_tax_id: string | null
          supplier_trade_name: string | null
          total_amount: number | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_numbering_series_id_fkey"
            columns: ["numbering_series_id"]
            isOneToOne: false
            referencedRelation: "document_numbering_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "v_seller_account_summary"
            referencedColumns: ["seller_id"]
          },
          {
            foreignKeyName: "documents_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "v_supplier_account_summary"
            referencedColumns: ["supplier_id"]
          },
        ]
      }
      v_seller_account_summary: {
        Row: {
          active_suppliers_count: number | null
          currency: string | null
          net_seller_balance: number | null
          open_documents_count: number | null
          seller_code: string | null
          seller_display_name: string | null
          seller_email: string | null
          seller_id: number | null
          seller_is_active: boolean | null
          seller_phone: string | null
          total_available_credit: number | null
          total_pending_debt: number | null
        }
        Relationships: []
      }
      v_supplier_account_summary: {
        Row: {
          currency: string | null
          legal_name: string | null
          net_account_balance: number | null
          supplier_id: number | null
          tax_id: string | null
          total_available_credit: number | null
          total_credits: number | null
          total_debits: number | null
          total_pending_debt: number | null
          trade_name: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      current_app_user_id: { Args: never; Returns: number }
      fn_allocate_internal_document_number: {
        Args: {
          p_doc_type_code: string
          p_is_reversal?: boolean
          p_series_id: number
        }
        Returns: {
          assigned_number: number
          human_reference: string
          letter: string
          point_of_sale: number
        }[]
      }
      fn_can_access_storage_object: {
        Args: { p_object_name: string }
        Returns: boolean
      }
      fn_get_eligible_sellers_for_document: {
        Args: { p_document_id: number }
        Returns: {
          display_name: string
          email: string
          first_name: string
          is_relationship_active: boolean
          is_seller_active: boolean
          last_name: string
          phone: string
          relation_validity_label: string
          relation_validity_status: string
          relationship_id: number
          seller_code: string
          seller_id: number
          valid_from: string
          valid_to: string
        }[]
      }
      fn_get_valid_sellers_for_supplier: {
        Args: { p_issue_date?: string; p_supplier_id: number }
        Returns: {
          display_name: string
          email: string
          first_name: string
          is_active: boolean
          last_name: string
          phone: string
          relationship_id: number
          seller_code: string
          seller_id: number
          valid_from: string
          valid_to: string
        }[]
      }
      fn_next_supplier_code: { Args: never; Returns: string }
      fn_parse_canonical_date: { Args: { p_str: string }; Returns: string }
      fn_validate_cuit: { Args: { p_cuit: string }; Returns: boolean }
      has_permission: { Args: { required_perm: string }; Returns: boolean }
      rpc_adjust_numbering_series: {
        Args: { p_new_number: number; p_reason: string; p_series_id: number }
        Returns: Json
      }
      rpc_apply_documents: {
        Args: { p_applications: Json; p_source_document_id: number }
        Returns: Json
      }
      rpc_apply_existing_balance:
        | {
            Args: {
              p_notes?: string
              p_source_document_id: number
              p_target_applications: Json
            }
            Returns: Json
          }
        | {
            Args: {
              p_notes?: string
              p_numbering_series_id?: number
              p_source_document_id: number
              p_target_applications: Json
            }
            Returns: Json
          }
      rpc_change_document_seller: {
        Args: {
          p_document_id: number
          p_expected_current_seller_id?: number
          p_new_seller_id: number
          p_reason: string
        }
        Returns: Json
      }
      rpc_claim_upload_session_for_upload: {
        Args: {
          p_file_name: string
          p_file_size: number
          p_mime_type: string
          p_session_token: string
        }
        Returns: Json
      }
      rpc_confirm_document: {
        Args: { p_document_id: number; p_override_reason?: string }
        Returns: Json
      }
      rpc_create_and_confirm_document: {
        Args: {
          p_ai_extraction_id?: number
          p_concept?: string
          p_confirmed_payload_diff?: Json
          p_currency?: string
          p_document_number?: number
          p_document_type_id: number
          p_due_date?: string
          p_file_id?: number
          p_human_reference?: string
          p_issue_date?: string
          p_letter?: string
          p_notes?: string
          p_numbering_series_id?: number
          p_override_reason?: string
          p_point_of_sale?: number
          p_seller_id?: number
          p_supplier_id: number
          p_total_amount?: number
        }
        Returns: Json
      }
      rpc_create_and_confirm_op: {
        Args: {
          p_concept?: string
          p_currency?: string
          p_document_number?: number
          p_document_type_id?: number
          p_human_reference?: string
          p_imputations?: Json
          p_issue_date?: string
          p_notes?: string
          p_numbering_series_id?: number
          p_override_reason?: string
          p_point_of_sale?: number
          p_supplier_id: number
          p_total_amount?: number
        }
        Returns: Json
      }
      rpc_create_upload_session: {
        Args: { p_expires_in_minutes?: number }
        Returns: Json
      }
      rpc_desimpute_applications: {
        Args: { p_application_ids: number[]; p_reason: string }
        Returns: Json
      }
      rpc_end_supplier_seller_relationship: {
        Args: { p_end_date?: string; p_relationship_id: number }
        Returns: Json
      }
      rpc_finalize_mobile_upload: {
        Args: { p_file_name: string; p_session_token: string }
        Returns: Json
      }
      rpc_get_abandoned_uploads_for_cleanup: {
        Args: { p_retention_days?: number }
        Returns: {
          created_at: string
          file_id: number
          file_name: string
          storage_path: string
        }[]
      }
      rpc_get_document_file_url: {
        Args: {
          p_document_id?: number
          p_expires_in?: number
          p_file_id: number
        }
        Returns: Json
      }
      rpc_get_document_files: {
        Args: { p_document_id: number; p_include_derivatives?: boolean }
        Returns: {
          created_at: string
          document_id: number
          file_category: string
          file_hash: string
          file_id: number
          file_name: string
          file_size_bytes: number
          mime_type: string
          parent_file_id: number
          storage_bucket: string
          storage_path: string
          uploaded_by: number
          uploaded_by_name: string
        }[]
      }
      rpc_get_open_documents_detail: {
        Args: {
          p_bucket_code?: string
          p_context: string
          p_currency: string
          p_cutoff_date?: string
          p_date_from?: string
          p_date_to?: string
          p_supplier_id: number
          p_week_start?: string
        }
        Returns: {
          balance_nature: string
          concept: string
          currency: string
          discount_payment_note: string
          document_id: number
          document_type_code: string
          document_type_name: string
          due_date: string
          files_count: number
          human_reference: string
          issue_date: string
          notes: string
          primary_file_mime: string
          reference_balance: number
          strict_due_date_discount: boolean
          supplier_id: number
          supplier_trade_name: string
          total_amount: number
        }[]
      }
      rpc_get_payment_projection: {
        Args: {
          p_cutoff_date?: string
          p_date_from?: string
          p_date_to?: string
        }
        Returns: {
          amount: number
          bucket_type: string
          currency: string
          discount_payment_note: string
          doc_count: number
          has_no_due_date_docs: boolean
          min_due_date: string
          strict_due_date_discount: boolean
          supplier_id: number
          supplier_tax_id: string
          supplier_trade_name: string
          week_end: string
          week_start: string
        }[]
      }
      rpc_get_seller_aging: {
        Args: { p_cutoff_date?: string }
        Returns: {
          active_suppliers_count: number
          currency: string
          due_0_30: number
          due_31_60: number
          due_gt_60: number
          net_total_balance: number
          no_due_date_amount: number
          overdue_1_30: number
          overdue_31_60: number
          overdue_gt_60: number
          seller_code: string
          seller_display_name: string
          seller_id: number
          total_pending_debt: number
        }[]
      }
      rpc_get_seller_documents_detail: {
        Args: {
          p_bucket_code?: string
          p_context: string
          p_currency: string
          p_cutoff_date?: string
          p_date_from?: string
          p_date_to?: string
          p_seller_id: number
          p_week_start?: string
        }
        Returns: {
          balance_nature: string
          concept: string
          currency: string
          document_id: number
          document_type_code: string
          document_type_name: string
          due_date: string
          human_reference: string
          issue_date: string
          notes: string
          reference_balance: number
          seller_display_name: string
          seller_id: number
          supplier_id: number
          supplier_trade_name: string
          total_amount: number
        }[]
      }
      rpc_get_seller_payment_projection: {
        Args: {
          p_cutoff_date?: string
          p_date_from?: string
          p_date_to?: string
        }
        Returns: {
          amount: number
          bucket_type: string
          currency: string
          doc_count: number
          seller_code: string
          seller_display_name: string
          seller_id: number
          suppliers_count: number
          week_end: string
          week_start: string
        }[]
      }
      rpc_get_seller_suppliers_summary: {
        Args: { p_seller_id: number }
        Returns: {
          available_credit: number
          currency: string
          net_balance: number
          open_doc_count: number
          pending_debt: number
          relationship_active: boolean
          relationship_id: number
          supplier_code: string
          supplier_id: number
          supplier_tax_id: string
          supplier_trade_name: string
          valid_from: string
          valid_to: string
        }[]
      }
      rpc_get_supplier_aging: {
        Args: { p_cutoff_date?: string }
        Returns: {
          currency: string
          discount_payment_note: string
          due_0_30: number
          due_31_60: number
          due_gt_60: number
          free_credits_amount: number
          has_no_due_date_docs: boolean
          min_due_date: string
          net_total_balance: number
          no_due_date_amount: number
          overdue_1_30: number
          overdue_31_60: number
          overdue_gt_60: number
          strict_due_date_discount: boolean
          supplier_id: number
          supplier_tax_id: string
          supplier_trade_name: string
          total_pending_debt: number
        }[]
      }
      rpc_get_supplier_seller_breakdown: {
        Args: { p_currency?: string; p_supplier_id: number }
        Returns: {
          currency: string
          is_free_credit: boolean
          is_unassigned_debt: boolean
          item_category: string
          net_balance: number
          open_doc_count: number
          seller_code: string
          seller_display_name: string
          seller_id: number
          supplier_id: number
          total_credit_amount: number
          total_debit_amount: number
        }[]
      }
      rpc_get_upload_session_status: {
        Args: { p_session_token: string }
        Returns: Json
      }
      rpc_link_supplier_seller: {
        Args: {
          p_notes?: string
          p_seller_id: number
          p_supplier_id: number
          p_valid_from?: string
          p_valid_to?: string
        }
        Returns: Json
      }
      rpc_quick_create_supplier: {
        Args: { p_legal_name?: string; p_tax_id: string; p_trade_name: string }
        Returns: Json
      }
      rpc_register_document_file: {
        Args: {
          p_file_category?: string
          p_file_name: string
          p_file_size: number
          p_mime_type: string
          p_storage_path: string
        }
        Returns: Json
      }
      rpc_reverse_document: {
        Args: { p_document_id: number; p_reason: string }
        Returns: Json
      }
      rpc_reverse_imputation:
        | { Args: { p_movement_id: number; p_reason: string }; Returns: Json }
        | {
            Args: {
              p_movement_id: number
              p_numbering_series_id?: number
              p_reason: string
            }
            Returns: Json
          }
      rpc_submit_mobile_upload: {
        Args: {
          p_file_name: string
          p_file_size: number
          p_mime_type: string
          p_session_token: string
          p_storage_path: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
