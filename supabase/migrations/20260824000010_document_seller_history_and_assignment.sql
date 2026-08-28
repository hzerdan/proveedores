-- ============================================================================
-- MIGRACIÓN 10: Asignación y Corrección Auditada de Vendedor en Comprobantes
-- Fecha: 2026-08-27
-- ============================================================================

-- 1. Permisos RBAC Diferenciados
INSERT INTO permissions (code, module, description) VALUES
    ('documents.assign_seller', 'DOCUMENTS', 'Asignar vendedor inicial a comprobantes sin vendedor asignado (seller_id IS NULL).'),
    ('documents.change_seller', 'DOCUMENTS', 'Corregir o reasignar vendedor en comprobantes que ya poseen uno asignado.')
ON CONFLICT (code) DO NOTHING;

-- OPERADOR, ENCARGADO y ADMIN pueden regularizar comprobantes sin vendedor
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code IN ('OPERADOR', 'ENCARGADO', 'ADMIN') AND p.code = 'documents.assign_seller'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Solo ENCARGADO y ADMIN pueden cambiar un vendedor ya asignado
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code IN ('ENCARGADO', 'ADMIN') AND p.code = 'documents.change_seller'
ON CONFLICT (role_id, permission_id) DO NOTHING;


-- 2. Tabla de Historial Inmutable: document_seller_history
CREATE TABLE IF NOT EXISTS document_seller_history (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    document_id bigint NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
    old_seller_id bigint REFERENCES sellers(id) ON DELETE RESTRICT,
    new_seller_id bigint NOT NULL REFERENCES sellers(id) ON DELETE RESTRICT,
    change_type varchar(30) NOT NULL, -- 'HISTORICAL_ASSIGNMENT' | 'CORRECTION'
    relation_validity_status varchar(50) NOT NULL, -- 'VALID_FOR_DOCUMENT_DATE' | 'CURRENT_RELATION_OUTSIDE_DOCUMENT_DATE' | 'HISTORICAL_RELATION_OUTSIDE_DOCUMENT_DATE'
    reason text NOT NULL,
    changed_by bigint NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT chk_doc_seller_history_type CHECK (change_type IN ('HISTORICAL_ASSIGNMENT', 'CORRECTION')),
    CONSTRAINT chk_doc_seller_diff CHECK (old_seller_id IS DISTINCT FROM new_seller_id),
    CONSTRAINT chk_doc_seller_validity CHECK (relation_validity_status IN (
        'VALID_FOR_DOCUMENT_DATE',
        'CURRENT_RELATION_OUTSIDE_DOCUMENT_DATE',
        'HISTORICAL_RELATION_OUTSIDE_DOCUMENT_DATE'
    ))
);

CREATE INDEX IF NOT EXISTS idx_doc_seller_hist_doc ON document_seller_history(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_seller_hist_old ON document_seller_history(old_seller_id);
CREATE INDEX IF NOT EXISTS idx_doc_seller_hist_new ON document_seller_history(new_seller_id);
CREATE INDEX IF NOT EXISTS idx_doc_seller_hist_date ON document_seller_history(changed_at);


-- 3. Inmutabilidad de document_seller_history (Append-Only)
CREATE OR REPLACE FUNCTION trg_enforce_seller_history_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'INMUTABILIDAD DE AUDITORÍA: Los registros de document_seller_history son de solo lectura y no pueden ser modificados ni eliminados.';
END;
$$;

DROP TRIGGER IF EXISTS trg_seller_history_immutability ON document_seller_history;
CREATE TRIGGER trg_seller_history_immutability
BEFORE UPDATE OR DELETE ON document_seller_history
FOR EACH ROW
EXECUTE FUNCTION trg_enforce_seller_history_immutability();


-- 4. RLS para document_seller_history
ALTER TABLE document_seller_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "document_seller_history_select" ON document_seller_history;
CREATE POLICY "document_seller_history_select" ON document_seller_history
    FOR SELECT TO anon, authenticated
    USING (has_permission('documents.view') OR has_permission('audit.view'));

DROP POLICY IF EXISTS "document_seller_history_insert" ON document_seller_history;
CREATE POLICY "document_seller_history_insert" ON document_seller_history
    FOR INSERT TO anon, authenticated
    WITH CHECK (has_permission('documents.assign_seller') OR has_permission('documents.change_seller'));


-- 5. Función Auxiliar: Obtener Vendedores Elegibles para un Comprobante con Clasificación de Vigencia
CREATE OR REPLACE FUNCTION fn_get_eligible_sellers_for_document(
    p_document_id bigint
)
RETURNS TABLE (
    relationship_id bigint,
    seller_id bigint,
    seller_code varchar(30),
    first_name text,
    last_name text,
    display_name text,
    phone text,
    email text,
    valid_from date,
    valid_to date,
    is_relationship_active boolean,
    is_seller_active boolean,
    relation_validity_status varchar(50),
    relation_validity_label text
)
LANGUAGE sql
STABLE
AS $$
    SELECT 
        ss.id AS relationship_id,
        s.id AS seller_id,
        s.code AS seller_code,
        s.first_name,
        s.last_name,
        s.display_name,
        s.phone,
        s.email,
        ss.valid_from,
        ss.valid_to,
        ss.is_active AS is_relationship_active,
        s.is_active AS is_seller_active,
        CASE 
            -- Caso 1: Válido para la fecha del comprobante
            WHEN (ss.valid_from <= d.issue_date AND (ss.valid_to IS NULL OR ss.valid_to >= d.issue_date)) 
                THEN 'VALID_FOR_DOCUMENT_DATE'::varchar(50)
            -- Caso 2: Relación actualmente activa pero fuera de la fecha del comprobante
            WHEN (ss.is_active = true AND s.is_active = true AND (ss.valid_to IS NULL OR ss.valid_to >= CURRENT_DATE))
                THEN 'CURRENT_RELATION_OUTSIDE_DOCUMENT_DATE'::varchar(50)
            -- Caso 3: Relación histórica inactiva fuera del período
            ELSE 'HISTORICAL_RELATION_OUTSIDE_DOCUMENT_DATE'::varchar(50)
        END AS relation_validity_status,
        CASE 
            WHEN (ss.valid_from <= d.issue_date AND (ss.valid_to IS NULL OR ss.valid_to >= d.issue_date)) 
                THEN 'Válido para la fecha del comprobante'::text
            WHEN (ss.is_active = true AND s.is_active = true AND (ss.valid_to IS NULL OR ss.valid_to >= CURRENT_DATE))
                THEN 'Relación actual, fuera de la fecha del comprobante'::text
            ELSE 'Relación histórica, fuera del período del comprobante'::text
        END AS relation_validity_label
    FROM documents d
    JOIN supplier_sellers ss ON ss.supplier_id = d.supplier_id
    JOIN sellers s ON s.id = ss.seller_id
    WHERE d.id = p_document_id
    ORDER BY 
        -- Priorizar los válidos en la fecha del comprobante
        CASE WHEN (ss.valid_from <= d.issue_date AND (ss.valid_to IS NULL OR ss.valid_to >= d.issue_date)) THEN 0 ELSE 1 END,
        -- Luego los actualmente activos
        CASE WHEN (ss.is_active = true AND s.is_active = true) THEN 0 ELSE 1 END,
        s.last_name, s.first_name;
$$;


-- 6. RPC Transaccional: rpc_change_document_seller
CREATE OR REPLACE FUNCTION rpc_change_document_seller(
    p_document_id bigint,
    p_new_seller_id bigint,
    p_reason text,
    p_expected_current_seller_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id bigint;
    v_doc record;
    v_new_seller record;
    v_change_type varchar(30);
    v_relation record;
    v_relation_validity varchar(50);
    v_history_id bigint;
    v_old_seller_name text;
    v_new_seller_name text;
BEGIN
    -- 1. Obtener usuario autenticado
    v_user_id := current_app_user_id();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Acceso no autorizado o perfil inactivo.';
    END IF;

    -- 2. Validar motivo obligatorio
    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'El motivo del cambio de vendedor es obligatorio y debe ser descriptivo.';
    END IF;

    IF length(trim(p_reason)) < 5 THEN
        RAISE EXCEPTION 'El motivo debe contener al menos 5 caracteres descriptivos.';
    END IF;

    -- 3. Bloqueo de fila atómico (SELECT FOR UPDATE)
    SELECT * INTO v_doc 
    FROM documents 
    WHERE id = p_document_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Documento ID % no encontrado.', p_document_id;
    END IF;

    -- 4. Control de concurrencia optimista con IS NOT DISTINCT FROM
    IF p_expected_current_seller_id IS NOT NULL OR v_doc.seller_id IS NOT NULL THEN
        IF v_doc.seller_id IS DISTINCT FROM p_expected_current_seller_id THEN
            RAISE EXCEPTION 'Conflicto de concurrencia: El vendedor actual del comprobante fue modificado por otro usuario. Recargue la pantalla antes de continuar.';
        END IF;
    END IF;

    -- 5. Validar que no se intente asignar el mismo vendedor
    IF v_doc.seller_id IS NOT DISTINCT FROM p_new_seller_id THEN
        RAISE EXCEPTION 'El nuevo vendedor seleccionado es idéntico al vendedor actualmente asignado al comprobante.';
    END IF;

    -- 6. Derivar change_type exclusivamente en backend
    IF v_doc.seller_id IS NULL THEN
        v_change_type := 'HISTORICAL_ASSIGNMENT';
        IF NOT has_permission('documents.assign_seller') THEN
            RAISE EXCEPTION 'Permiso denegado: No tiene autorización para asignar vendedor a comprobantes ("documents.assign_seller").';
        END IF;
    ELSE
        v_change_type := 'CORRECTION';
        IF NOT has_permission('documents.change_seller') THEN
            RAISE EXCEPTION 'Permiso denegado: No tiene autorización para corregir/cambiar el vendedor de comprobantes ("documents.change_seller").';
        END IF;
    END IF;

    -- 7. Validar existencia del nuevo vendedor
    SELECT * INTO v_new_seller FROM sellers WHERE id = p_new_seller_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El nuevo vendedor ID % no existe.', p_new_seller_id;
    END IF;

    -- 8. Validar relación con el proveedor y categorizar vigencia
    SELECT * INTO v_relation
    FROM supplier_sellers
    WHERE supplier_id = v_doc.supplier_id
      AND seller_id = p_new_seller_id
    ORDER BY 
      CASE WHEN (valid_from <= v_doc.issue_date AND (valid_to IS NULL OR valid_to >= v_doc.issue_date)) THEN 0 ELSE 1 END,
      valid_from DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El vendedor "%" nunca ha estado vinculado con el proveedor del comprobante. Para asignarlo, cree primero la relación en el maestro de relaciones.',
            v_new_seller.display_name;
    END IF;

    -- Determinar estado de vigencia de la relación
    IF (v_relation.valid_from <= v_doc.issue_date AND (v_relation.valid_to IS NULL OR v_relation.valid_to >= v_doc.issue_date)) THEN
        v_relation_validity := 'VALID_FOR_DOCUMENT_DATE';
    ELSIF (v_relation.is_active = true AND v_new_seller.is_active = true AND (v_relation.valid_to IS NULL OR v_relation.valid_to >= CURRENT_DATE)) THEN
        v_relation_validity := 'CURRENT_RELATION_OUTSIDE_DOCUMENT_DATE';
    ELSE
        v_relation_validity := 'HISTORICAL_RELATION_OUTSIDE_DOCUMENT_DATE';
    END IF;

    -- 9. Obtener nombres para auditoría y mensaje
    IF v_doc.seller_id IS NOT NULL THEN
        SELECT display_name INTO v_old_seller_name FROM sellers WHERE id = v_doc.seller_id;
    ELSE
        v_old_seller_name := 'Sin asignar';
    END IF;
    v_new_seller_name := v_new_seller.display_name;

    -- 10. Registrar en document_seller_history (Inmutable)
    INSERT INTO document_seller_history (
        document_id,
        old_seller_id,
        new_seller_id,
        change_type,
        relation_validity_status,
        reason,
        changed_by,
        changed_at
    ) VALUES (
        v_doc.id,
        v_doc.seller_id,
        p_new_seller_id,
        v_change_type,
        v_relation_validity,
        trim(p_reason),
        v_user_id,
        clock_timestamp()
    ) RETURNING id INTO v_history_id;

    -- 11. Actualizar documents.seller_id (NO toca account_movements, saldo permanece inalterado)
    UPDATE documents
    SET seller_id = p_new_seller_id,
        updated_at = clock_timestamp()
    WHERE id = v_doc.id;

    RETURN jsonb_build_object(
        'success', true,
        'document_id', v_doc.id,
        'human_reference', v_doc.human_reference,
        'old_seller_id', v_doc.seller_id,
        'old_seller_name', v_old_seller_name,
        'new_seller_id', p_new_seller_id,
        'new_seller_name', v_new_seller_name,
        'change_type', v_change_type,
        'relation_validity_status', v_relation_validity,
        'history_id', v_history_id,
        'message', format('Vendedor de %s actualizado exitosamente: %s → %s (%s).', 
            v_doc.human_reference, v_old_seller_name, v_new_seller_name, v_change_type)
    );
END;
$$;
