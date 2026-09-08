-- ============================================================================
-- MIGRACIÓN: 20260907000018_secure_storage_policies_and_file_access.sql
-- PROYECTO: Sistema de Cuentas Corrientes de Proveedores
-- OBJETIVO:
--   1. Políticas estrictas de seguridad en storage.objects (Requirement 12)
--   2. Verificación de permisos documents.view y audit.view en Storage RLS
--   3. RPC rpc_get_document_file_url para validación centralizada de acceso
-- ============================================================================

-- 1. FUNCIÓN DE SEGURIDAD PARA EVALUACIÓN DE ACCESO EN STORAGE RLS
CREATE OR REPLACE FUNCTION public.fn_can_access_storage_object(p_object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id bigint;
    v_file record;
BEGIN
    v_user_id := current_app_user_id();
    IF v_user_id IS NULL THEN
        RETURN false;
    END IF;

    -- Buscar en document_files por storage_path
    SELECT df.id, df.document_id, df.file_category, df.uploaded_by, d.status
    INTO v_file
    FROM public.document_files df
    LEFT JOIN public.documents d ON d.id = df.document_id
    WHERE df.storage_path = p_object_name
    LIMIT 1;

    -- Si el archivo aún no está vinculado en document_files (carga temporal en proceso)
    IF NOT FOUND THEN
        IF p_object_name LIKE 'intake-uploads/%' OR p_object_name LIKE 'temp-uploads/%' THEN
            RETURN has_permission('documents.create') OR has_permission('system.manage');
        END IF;
        RETURN false;
    END IF;

    -- Si es derivado de IA (AI_DERIVATIVE), requiere audit.view
    IF v_file.file_category = 'AI_DERIVATIVE' THEN
        RETURN has_permission('audit.view');
    END IF;

    -- Si es original o adjunto normal, requiere documents.view o documents.ai_review
    IF has_permission('documents.view') OR has_permission('documents.ai_review') THEN
        RETURN true;
    END IF;

    -- Si no está confirmado y fue subido por el mismo usuario
    IF (v_file.status IS NULL OR v_file.status = 'DRAFT') AND v_file.uploaded_by = v_user_id THEN
        RETURN true;
    END IF;

    RETURN false;
END;
$$;

-- 2. REEMPLAZO DE POLÍTICAS EN storage.objects
DROP POLICY IF EXISTS "supplier_docs_select" ON storage.objects;
DROP POLICY IF EXISTS "supplier_docs_select_auth" ON storage.objects;
DROP POLICY IF EXISTS "supplier_docs_update" ON storage.objects;
DROP POLICY IF EXISTS "supplier_docs_insert" ON storage.objects;
DROP POLICY IF EXISTS "supplier_docs_insert_auth" ON storage.objects;

-- SELECT: Solo usuarios autenticados con permisos válidos sobre el archivo
CREATE POLICY "supplier_docs_select_secure" ON storage.objects
FOR SELECT TO authenticated
USING (
    bucket_id = 'supplier-documents'
    AND public.fn_can_access_storage_object(name)
);

-- UPDATE: Prohibido sobre documentos confirmados (enforzado por trigger + RLS)
CREATE POLICY "supplier_docs_update_secure" ON storage.objects
FOR UPDATE TO authenticated
USING (
    bucket_id = 'supplier-documents'
    AND public.fn_can_access_storage_object(name)
)
WITH CHECK (
    bucket_id = 'supplier-documents'
    AND public.fn_can_access_storage_object(name)
);

-- DELETE: Prohibido sobre documentos confirmados (enforzado por trigger + RLS)
DROP POLICY IF EXISTS "supplier_docs_delete_secure" ON storage.objects;
CREATE POLICY "supplier_docs_delete_secure" ON storage.objects
FOR DELETE TO authenticated
USING (
    bucket_id = 'supplier-documents'
    AND public.fn_can_access_storage_object(name)
);

-- INSERT: Usuarios autenticados con documents.create, o anon exclusivamente en temp-uploads/ para QR móvil
CREATE POLICY "supplier_docs_insert_secure" ON storage.objects
FOR INSERT TO authenticated, anon
WITH CHECK (
    bucket_id = 'supplier-documents'
    AND (
        (auth.role() = 'authenticated' AND (public.has_permission('documents.create') OR public.has_permission('system.manage')))
        OR
        (auth.role() = 'anon' AND name LIKE 'temp-uploads/%')
    )
);

-- 3. RPC rpc_get_document_file_url
CREATE OR REPLACE FUNCTION public.rpc_get_document_file_url(
    p_file_id bigint,
    p_document_id bigint DEFAULT NULL,
    p_expires_in integer DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id bigint;
    v_file record;
BEGIN
    v_user_id := current_app_user_id();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Acceso no autorizado: Debe estar autenticado.';
    END IF;

    SELECT df.*, d.status AS doc_status
    INTO v_file
    FROM public.document_files df
    LEFT JOIN public.documents d ON d.id = df.document_id
    WHERE df.id = p_file_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Archivo ID % no encontrado.', p_file_id;
    END IF;

    IF p_document_id IS NOT NULL AND v_file.document_id IS DISTINCT FROM p_document_id THEN
        RAISE EXCEPTION 'El archivo no pertenece al comprobante especificado.';
    END IF;

    -- Validar permisos según categoría
    IF v_file.file_category = 'AI_DERIVATIVE' THEN
        IF NOT has_permission('audit.view') THEN
            RAISE EXCEPTION 'Permiso denegado: Se requiere "audit.view" para acceder al derivado de IA.';
        END IF;
    ELSE
        IF NOT has_permission('documents.view') AND NOT has_permission('documents.ai_review') THEN
            RAISE EXCEPTION 'Permiso denegado: Se requiere "documents.view" para acceder al comprobante original.';
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'file_id', v_file.id,
        'document_id', v_file.document_id,
        'storage_bucket', v_file.storage_bucket,
        'storage_path', v_file.storage_path,
        'file_name', v_file.file_name,
        'mime_type', v_file.mime_type,
        'file_category', v_file.file_category,
        'expires_in_seconds', LEAST(GREATEST(p_expires_in, 60), 3600)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_get_document_file_url(bigint, bigint, integer) TO authenticated, service_role;
