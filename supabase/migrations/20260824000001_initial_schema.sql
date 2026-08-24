-- ============================================================================
-- MIGRACIÓN 1: Esquema Principal de Cuentas Corrientes de Proveedores
-- Fecha: 2026-08-24
-- ============================================================================

-- 1. Perfiles de Usuario (Mapeo Supabase Auth UUID <-> bigint de Negocio)
CREATE TABLE IF NOT EXISTS profiles (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    auth_user_id uuid NOT NULL UNIQUE,
    first_name text NOT NULL,
    last_name text NOT NULL,
    email text NOT NULL UNIQUE,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX idx_profiles_auth_id ON profiles(auth_user_id);
CREATE INDEX idx_profiles_is_active ON profiles(is_active);

-- 2. Roles y Permisos (RBAC Parametrizable)
CREATE TABLE IF NOT EXISTS roles (
    id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code varchar(30) NOT NULL UNIQUE,
    name text NOT NULL,
    description text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS permissions (
    id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code varchar(60) NOT NULL UNIQUE,
    module varchar(30) NOT NULL,
    description text,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS user_roles (
    user_id bigint NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    role_id smallint NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    assigned_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id smallint NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    permission_id smallint NOT NULL REFERENCES permissions(id) ON DELETE RESTRICT,
    assigned_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (role_id, permission_id)
);

-- 3. Proveedores
CREATE TABLE IF NOT EXISTS suppliers (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code varchar(30) NOT NULL UNIQUE,
    trade_name text NOT NULL,
    legal_name text NOT NULL,
    tax_id varchar(20) NOT NULL UNIQUE,
    email text,
    phone text,
    is_active boolean NOT NULL DEFAULT true,
    notes text,
    created_by bigint NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX idx_suppliers_tax_id ON suppliers(tax_id);
CREATE INDEX idx_suppliers_is_active ON suppliers(is_active);

-- 4. Contactos de Proveedores
CREATE TABLE IF NOT EXISTS supplier_contacts (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    supplier_id bigint NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    first_name text NOT NULL,
    last_name text NOT NULL,
    role_title varchar(50) NOT NULL,
    email text,
    phone text,
    address text,
    is_active boolean NOT NULL DEFAULT true,
    notes text,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX idx_supplier_contacts_supplier ON supplier_contacts(supplier_id);

-- 5. Tipos de Documento Parametrizables
CREATE TABLE IF NOT EXISTS document_types (
    id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code varchar(30) NOT NULL UNIQUE,
    name varchar(60) NOT NULL,
    description text,
    balance_nature varchar(10) NOT NULL,
    affects_account_balance boolean NOT NULL DEFAULT true,
    can_be_source_application boolean NOT NULL DEFAULT false,
    can_be_target_application boolean NOT NULL DEFAULT false,
    requires_due_date boolean NOT NULL DEFAULT false,
    is_system_internal boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT chk_document_types_nature CHECK (balance_nature IN ('DEBIT', 'CREDIT', 'NEUTRAL'))
);

CREATE INDEX idx_document_types_code ON document_types(code);

-- 6. Documentos (Comprobantes y Transacciones)
CREATE TABLE IF NOT EXISTS documents (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    supplier_id bigint NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    document_type_id smallint NOT NULL REFERENCES document_types(id) ON DELETE RESTRICT,
    status varchar(15) NOT NULL DEFAULT 'DRAFT',
    letter varchar(2),
    point_of_sale integer,
    document_number bigint,
    human_reference varchar(80) NOT NULL,
    external_reference text,
    issue_date date NOT NULL,
    due_date date,
    currency varchar(3) NOT NULL DEFAULT 'ARS',
    exchange_rate numeric(14,4) NOT NULL DEFAULT 1.0000,
    total_amount numeric(15,2) NOT NULL DEFAULT 0.00,
    concept text,
    notes text,
    intake_source varchar(20) NOT NULL DEFAULT 'MANUAL',
    created_by bigint NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    confirmed_by bigint REFERENCES profiles(id) ON DELETE RESTRICT,
    confirmed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT chk_documents_status CHECK (status IN ('DRAFT', 'CONFIRMED')),
    CONSTRAINT chk_documents_total_amount CHECK (total_amount >= 0),
    CONSTRAINT chk_documents_exchange_rate CHECK (exchange_rate > 0),
    CONSTRAINT chk_documents_intake_source CHECK (intake_source IN ('MANUAL', 'IMAGE', 'PDF', 'API', 'IMPORT'))
);

CREATE INDEX idx_documents_supplier_status ON documents(supplier_id, status);
CREATE INDEX idx_documents_supplier_issue_date ON documents(supplier_id, issue_date);
CREATE INDEX idx_documents_human_ref ON documents(human_reference);
CREATE INDEX idx_documents_due_date ON documents(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX idx_documents_fiscal_search ON documents(supplier_id, document_type_id, letter, point_of_sale, document_number) 
    WHERE letter IS NOT NULL AND point_of_sale IS NOT NULL AND document_number IS NOT NULL;

-- 7. Auditoría de Excepción de Duplicados
CREATE TABLE IF NOT EXISTS duplicate_override_logs (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    document_id bigint NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
    matched_document_id bigint NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
    reason text NOT NULL,
    authorized_by bigint NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    authorized_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX idx_duplicate_override_doc ON duplicate_override_logs(document_id);
CREATE INDEX idx_duplicate_override_matched ON duplicate_override_logs(matched_document_id);

-- 8. Aplicaciones de Documentos (M:N)
CREATE TABLE IF NOT EXISTS document_applications (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_document_id bigint NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
    target_document_id bigint NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
    applied_amount numeric(15,2) NOT NULL,
    application_date date NOT NULL DEFAULT CURRENT_DATE,
    notes text,
    created_by bigint NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT chk_document_applications_amount CHECK (applied_amount > 0),
    CONSTRAINT chk_document_applications_no_self CHECK (source_document_id <> target_document_id)
);

CREATE INDEX idx_doc_app_source ON document_applications(source_document_id);
CREATE INDEX idx_doc_app_target ON document_applications(target_document_id);
CREATE INDEX idx_doc_app_date ON document_applications(application_date);

-- 9. Reversión / Desimputación de Aplicaciones
CREATE TABLE IF NOT EXISTS application_reversals (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    reversal_document_id bigint NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
    application_id bigint NOT NULL UNIQUE REFERENCES document_applications(id) ON DELETE RESTRICT,
    reversal_reason text NOT NULL,
    created_by bigint NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX idx_app_reversals_rev_doc ON application_reversals(reversal_document_id);
CREATE INDEX idx_app_reversals_app_id ON application_reversals(application_id);

-- 10. Archivos Adjuntos en Storage
CREATE TABLE IF NOT EXISTS document_files (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    document_id bigint REFERENCES documents(id) ON DELETE RESTRICT,
    storage_bucket varchar(50) NOT NULL DEFAULT 'supplier-documents',
    storage_path text NOT NULL UNIQUE,
    file_name text NOT NULL,
    mime_type varchar(100) NOT NULL,
    file_size_bytes bigint NOT NULL,
    file_category varchar(30) NOT NULL DEFAULT 'ORIGINAL',
    uploaded_by bigint NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX idx_document_files_doc_id ON document_files(document_id);

-- 11. Trazabilidad y Auditoría de Extracción IA
CREATE TABLE IF NOT EXISTS document_ai_extractions (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    file_id bigint NOT NULL REFERENCES document_files(id) ON DELETE RESTRICT,
    document_id bigint REFERENCES documents(id) ON DELETE RESTRICT,
    model_name varchar(80) NOT NULL,
    model_provider varchar(40) NOT NULL,
    extracted_raw_payload jsonb NOT NULL,
    confidence_score numeric(5,4),
    extraction_duration_ms integer,
    status varchar(20) NOT NULL DEFAULT 'SUCCESS',
    error_message text,
    confirmed_payload_diff jsonb,
    extracted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    created_by bigint NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    CONSTRAINT chk_ai_extractions_status CHECK (status IN ('SUCCESS', 'PARTIAL', 'FAILED'))
);

CREATE INDEX idx_ai_extractions_file ON document_ai_extractions(file_id);
CREATE INDEX idx_ai_extractions_doc ON document_ai_extractions(document_id);
