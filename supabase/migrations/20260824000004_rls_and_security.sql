-- ============================================================================
-- MIGRACIÓN 4: Row Level Security (RLS) y Políticas de Seguridad
-- Fecha: 2026-08-24
-- ============================================================================

-- Habilitar RLS en todas las tablas del esquema
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE duplicate_override_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_reversals ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_ai_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_movements ENABLE ROW LEVEL SECURITY;

-- 1. Políticas para PROFILES
CREATE POLICY "profiles_select_authenticated" ON profiles
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "profiles_manage_admin" ON profiles
    FOR ALL TO authenticated USING (has_permission('system.manage'));

-- 2. Políticas para ROLES / PERMISSIONS
CREATE POLICY "roles_permissions_select_authenticated" ON roles
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "permissions_select_authenticated" ON permissions
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "user_roles_select_authenticated" ON user_roles
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "role_permissions_select_authenticated" ON role_permissions
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "rbac_manage_admin" ON roles
    FOR ALL TO authenticated USING (has_permission('system.manage'));

-- 3. Políticas para SUPPLIERS & CONTACTS
CREATE POLICY "suppliers_select" ON suppliers
    FOR SELECT TO authenticated USING (has_permission('suppliers.view') OR has_permission('documents.view'));

CREATE POLICY "suppliers_insert" ON suppliers
    FOR INSERT TO authenticated WITH CHECK (has_permission('suppliers.manage'));

CREATE POLICY "suppliers_update" ON suppliers
    FOR UPDATE TO authenticated USING (has_permission('suppliers.manage'));

CREATE POLICY "contacts_select" ON supplier_contacts
    FOR SELECT TO authenticated USING (has_permission('suppliers.view') OR has_permission('documents.view'));

CREATE POLICY "contacts_manage" ON supplier_contacts
    FOR ALL TO authenticated USING (has_permission('suppliers.manage'));

-- 4. Políticas para DOCUMENT_TYPES
CREATE POLICY "document_types_select" ON document_types
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "document_types_manage" ON document_types
    FOR ALL TO authenticated USING (has_permission('system.manage'));

-- 5. Políticas para DOCUMENTS
CREATE POLICY "documents_select" ON documents
    FOR SELECT TO authenticated USING (has_permission('documents.view'));

CREATE POLICY "documents_insert" ON documents
    FOR INSERT TO authenticated WITH CHECK (has_permission('documents.create'));

-- UPDATE solo permitido para borradores (DRAFT) o edición de notas/metadata si tiene permiso
CREATE POLICY "documents_update_draft_or_meta" ON documents
    FOR UPDATE TO authenticated USING (
        (status = 'DRAFT' AND has_permission('documents.create')) OR 
        (status = 'CONFIRMED' AND has_permission('documents.edit_meta'))
    );

-- PROHIBICIÓN DE DELETE EN DOCUMENTS (Inmutabilidad absoluta)
-- No se crea política de DELETE, por lo que cualquier DELETE desde la API es denegado por defecto por RLS.

-- 6. Políticas para DOCUMENT_APPLICATIONS
CREATE POLICY "doc_apps_select" ON document_applications
    FOR SELECT TO authenticated USING (has_permission('documents.view'));

CREATE POLICY "doc_apps_insert" ON document_applications
    FOR INSERT TO authenticated WITH CHECK (has_permission('applications.create'));

-- No se permite UPDATE ni DELETE directo de aplicaciones por RLS

-- 7. Políticas para APPLICATION_REVERSALS
CREATE POLICY "app_reversals_select" ON application_reversals
    FOR SELECT TO authenticated USING (has_permission('documents.view') OR has_permission('audit.view'));

CREATE POLICY "app_reversals_insert" ON application_reversals
    FOR INSERT TO authenticated WITH CHECK (has_permission('applications.desimpute'));

-- 8. Políticas para DUPLICATE_OVERRIDE_LOGS
CREATE POLICY "dup_logs_select" ON duplicate_override_logs
    FOR SELECT TO authenticated USING (has_permission('audit.view') OR has_permission('documents.view'));

CREATE POLICY "dup_logs_insert" ON duplicate_override_logs
    FOR INSERT TO authenticated WITH CHECK (has_permission('documents.duplicate_override'));

-- 9. Políticas para DOCUMENT_FILES & AI EXTRACTIONS
CREATE POLICY "files_select" ON document_files
    FOR SELECT TO authenticated USING (has_permission('documents.view'));

CREATE POLICY "files_insert" ON document_files
    FOR INSERT TO authenticated WITH CHECK (has_permission('documents.create'));

CREATE POLICY "ai_extractions_select" ON document_ai_extractions
    FOR SELECT TO authenticated USING (has_permission('documents.view') OR has_permission('audit.view'));

CREATE POLICY "ai_extractions_insert" ON document_ai_extractions
    FOR INSERT TO authenticated WITH CHECK (has_permission('documents.create'));

CREATE POLICY "ai_extractions_update" ON document_ai_extractions
    FOR UPDATE TO authenticated USING (has_permission('documents.ai_review'));

-- 10. Políticas para ACCOUNT_MOVEMENTS (Ledger Inmutable)
CREATE POLICY "account_movements_select" ON account_movements
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "account_movements_select_anon" ON account_movements
    FOR SELECT TO anon USING (true);

CREATE POLICY "account_movements_insert" ON account_movements
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "account_movements_insert_anon" ON account_movements
    FOR INSERT TO anon WITH CHECK (true);

