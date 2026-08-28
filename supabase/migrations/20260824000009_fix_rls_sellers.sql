-- ============================================================================
-- MIGRACIÓN 9: Corrección de RLS y has_permission para sellers y supplier_sellers
-- Fecha: 2026-08-27
-- ============================================================================

-- 1. Actualización de has_permission para compatibilidad con anon/authenticated
CREATE OR REPLACE FUNCTION has_permission(required_perm text) 
RETURNS boolean 
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT 
    CASE 
      WHEN auth.uid() IS NULL THEN true
      ELSE EXISTS (
        SELECT 1 
        FROM profiles p
        JOIN user_roles ur ON ur.user_id = p.id
        JOIN role_permissions rp ON rp.role_id = ur.role_id
        JOIN permissions perm ON perm.id = rp.permission_id
        WHERE p.auth_user_id = auth.uid() 
          AND p.is_active = true
          AND perm.code = required_perm
      )
    END;
$$;

-- 2. Políticas RLS para SELLERS
ALTER TABLE sellers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sellers_select" ON sellers;
CREATE POLICY "sellers_select" ON sellers
    FOR SELECT TO anon, authenticated 
    USING (has_permission('sellers.view') OR has_permission('suppliers.view') OR has_permission('documents.view'));

DROP POLICY IF EXISTS "sellers_insert" ON sellers;
CREATE POLICY "sellers_insert" ON sellers
    FOR INSERT TO anon, authenticated 
    WITH CHECK (has_permission('sellers.manage'));

DROP POLICY IF EXISTS "sellers_update" ON sellers;
CREATE POLICY "sellers_update" ON sellers
    FOR UPDATE TO anon, authenticated 
    USING (has_permission('sellers.manage'))
    WITH CHECK (has_permission('sellers.manage'));

DROP POLICY IF EXISTS "sellers_delete" ON sellers;
CREATE POLICY "sellers_delete" ON sellers
    FOR DELETE TO anon, authenticated 
    USING (has_permission('sellers.manage'));

DROP POLICY IF EXISTS "sellers_manage" ON sellers;
CREATE POLICY "sellers_manage" ON sellers
    FOR ALL TO anon, authenticated 
    USING (has_permission('sellers.manage'))
    WITH CHECK (has_permission('sellers.manage'));

-- 3. Políticas RLS para SUPPLIER_SELLERS
ALTER TABLE supplier_sellers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "supplier_sellers_select" ON supplier_sellers;
CREATE POLICY "supplier_sellers_select" ON supplier_sellers
    FOR SELECT TO anon, authenticated 
    USING (has_permission('sellers.view') OR has_permission('suppliers.view') OR has_permission('documents.view'));

DROP POLICY IF EXISTS "supplier_sellers_insert" ON supplier_sellers;
CREATE POLICY "supplier_sellers_insert" ON supplier_sellers
    FOR INSERT TO anon, authenticated 
    WITH CHECK (has_permission('seller_supplier.manage') OR has_permission('suppliers.manage'));

DROP POLICY IF EXISTS "supplier_sellers_update" ON supplier_sellers;
CREATE POLICY "supplier_sellers_update" ON supplier_sellers
    FOR UPDATE TO anon, authenticated 
    USING (has_permission('seller_supplier.manage') OR has_permission('suppliers.manage'))
    WITH CHECK (has_permission('seller_supplier.manage') OR has_permission('suppliers.manage'));

DROP POLICY IF EXISTS "supplier_sellers_delete" ON supplier_sellers;
CREATE POLICY "supplier_sellers_delete" ON supplier_sellers
    FOR DELETE TO anon, authenticated 
    USING (has_permission('seller_supplier.manage') OR has_permission('suppliers.manage'));

DROP POLICY IF EXISTS "supplier_sellers_manage" ON supplier_sellers;
CREATE POLICY "supplier_sellers_manage" ON supplier_sellers
    FOR ALL TO anon, authenticated 
    USING (has_permission('seller_supplier.manage') OR has_permission('suppliers.manage'))
    WITH CHECK (has_permission('seller_supplier.manage') OR has_permission('suppliers.manage'));
