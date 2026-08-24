-- ============================================================================
-- MIGRACIÓN 3: Vistas de Cuenta Corriente, Triggers de Inmutabilidad y RPC
-- Fecha: 2026-08-24
-- ============================================================================

-- ============================================================================
-- 1. VISTAS SQL PARA CÁLCULO DINÁMICO DE SALDOS E IMPUTACIONES
-- ============================================================================

-- Vista de Aplicaciones Activas (excluye aplicaciones neutralizadas por desimputación)
CREATE OR REPLACE VIEW v_active_applications AS
SELECT 
    da.id AS application_id,
    da.source_document_id,
    da.target_document_id,
    da.applied_amount,
    da.application_date,
    da.notes,
    da.created_by,
    da.created_at
FROM document_applications da
LEFT JOIN application_reversals ar ON ar.application_id = da.id
WHERE ar.id IS NULL;

-- Vista de Saldos por Documento (Individual)
CREATE OR REPLACE VIEW v_document_balances AS
WITH apps_received AS (
    SELECT 
        target_document_id,
        COALESCE(SUM(applied_amount), 0.00) AS total_applied_received
    FROM v_active_applications
    GROUP BY target_document_id
),
apps_sent AS (
    SELECT 
        source_document_id,
        COALESCE(SUM(applied_amount), 0.00) AS total_applied_sent
    FROM v_active_applications
    GROUP BY source_document_id
)
SELECT 
    d.id AS document_id,
    d.supplier_id,
    s.trade_name AS supplier_name,
    s.tax_id AS supplier_tax_id,
    d.document_type_id,
    dt.code AS document_type_code,
    dt.name AS document_type_name,
    dt.balance_nature,
    dt.affects_account_balance,
    d.status,
    d.letter,
    d.point_of_sale,
    d.document_number,
    d.human_reference,
    d.external_reference,
    d.issue_date,
    d.due_date,
    d.currency,
    d.exchange_rate,
    d.total_amount,
    COALESCE(rec.total_applied_received, 0.00) AS applied_received,
    COALESCE(sent.total_applied_sent, 0.00) AS applied_sent,
    CASE 
        WHEN dt.balance_nature = 'DEBIT' THEN 
            GREATEST(0.00, d.total_amount - COALESCE(rec.total_applied_received, 0.00))
        ELSE 0.00 
    END AS pending_debt,
    CASE 
        WHEN dt.balance_nature = 'CREDIT' THEN 
            GREATEST(0.00, d.total_amount - COALESCE(sent.total_applied_sent, 0.00))
        ELSE 0.00 
    END AS available_credit,
    CASE 
        WHEN dt.balance_nature = 'DEBIT' THEN 
            (d.total_amount - COALESCE(rec.total_applied_received, 0.00) <= 0.00)
        WHEN dt.balance_nature = 'CREDIT' THEN 
            (d.total_amount - COALESCE(sent.total_applied_sent, 0.00) <= 0.00)
        ELSE true
    END AS is_fully_settled,
    d.created_by,
    d.confirmed_by,
    d.confirmed_at,
    d.created_at
FROM documents d
JOIN suppliers s ON s.id = d.supplier_id
JOIN document_types dt ON dt.id = d.document_type_id
LEFT JOIN apps_received rec ON rec.target_document_id = d.id
LEFT JOIN apps_sent sent ON sent.source_document_id = d.id;

-- Vista de Resumen de Cuenta Corriente del Proveedor
CREATE OR REPLACE VIEW v_supplier_account_summary AS
SELECT 
    s.id AS supplier_id,
    s.code AS supplier_code,
    s.trade_name,
    s.legal_name,
    s.tax_id,
    s.is_active,
    d.currency,
    COALESCE(SUM(CASE WHEN dt.balance_nature = 'DEBIT' AND dt.affects_account_balance = true THEN d.total_amount ELSE 0.00 END), 0.00) AS total_debits,
    COALESCE(SUM(CASE WHEN dt.balance_nature = 'CREDIT' AND dt.affects_account_balance = true THEN d.total_amount ELSE 0.00 END), 0.00) AS total_credits,
    COALESCE(SUM(CASE WHEN dt.balance_nature = 'DEBIT' AND dt.affects_account_balance = true THEN d.total_amount 
                      WHEN dt.balance_nature = 'CREDIT' AND dt.affects_account_balance = true THEN -d.total_amount 
                      ELSE 0.00 END), 0.00) AS net_account_balance,
    COALESCE(SUM(b.pending_debt), 0.00) AS total_pending_debt,
    COALESCE(SUM(b.available_credit), 0.00) AS total_available_credit,
    COALESCE(SUM(CASE WHEN b.pending_debt > 0 AND d.due_date < CURRENT_DATE THEN b.pending_debt ELSE 0.00 END), 0.00) AS overdue_debt,
    COALESCE(SUM(CASE WHEN b.pending_debt > 0 AND (d.due_date >= CURRENT_DATE OR d.due_date IS NULL) THEN b.pending_debt ELSE 0.00 END), 0.00) AS upcoming_debt
FROM suppliers s
LEFT JOIN documents d ON d.supplier_id = s.id AND d.status = 'CONFIRMED'
LEFT JOIN document_types dt ON dt.id = d.document_type_id
LEFT JOIN v_document_balances b ON b.document_id = d.id
GROUP BY s.id, s.code, s.trade_name, s.legal_name, s.tax_id, s.is_active, d.currency;


-- ============================================================================
-- 2. TRIGGER DE INMUTABILIDAD DE CAMPOS ECONÓMICOS
-- ============================================================================

CREATE OR REPLACE FUNCTION trg_enforce_document_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- Si el documento ya estaba CONFIRMADO, se prohíbe alterar campos sensibles
    IF OLD.status = 'CONFIRMED' THEN
        IF NEW.supplier_id <> OLD.supplier_id OR
           NEW.document_type_id <> OLD.document_type_id OR
           NEW.letter IS DISTINCT FROM OLD.letter OR
           NEW.point_of_sale IS DISTINCT FROM OLD.point_of_sale OR
           NEW.document_number IS DISTINCT FROM OLD.document_number OR
           NEW.issue_date <> OLD.issue_date OR
           NEW.currency <> OLD.currency OR
           NEW.exchange_rate <> OLD.exchange_rate OR
           NEW.total_amount <> OLD.total_amount OR
           NEW.status <> OLD.status THEN
            RAISE EXCEPTION 'INMUTABILIDAD: No está permitido modificar datos económicos ni cambiar el estado de un documento CONFIRMADO (ID %). Para corregir, genere un documento compensatorio de reversión.', OLD.id;
        END IF;
    END IF;
    
    NEW.updated_at = clock_timestamp();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_document_immutability ON documents;
CREATE TRIGGER trg_document_immutability
BEFORE UPDATE ON documents
FOR EACH ROW
EXECUTE FUNCTION trg_enforce_document_immutability();


-- ============================================================================
-- 3. STORED PROCEDURES / RPC TRANSACCIONALES
-- ============================================================================

-- Función auxiliar para obtener el ID de perfil actual
CREATE OR REPLACE FUNCTION current_app_user_id() 
RETURNS bigint 
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM profiles WHERE auth_user_id = auth.uid() AND is_active = true LIMIT 1;
$$;

-- Función auxiliar para comprobar permisos del usuario conectado
CREATE OR REPLACE FUNCTION has_permission(required_perm text) 
RETURNS boolean 
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM profiles p
    JOIN user_roles ur ON ur.user_id = p.id
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    JOIN permissions perm ON perm.id = rp.permission_id
    WHERE p.auth_user_id = auth.uid() 
      AND p.is_active = true
      AND perm.code = required_perm
  );
$$;

-- A. RPC: Confirmación de Documento (con detección y excepción de duplicados)
CREATE OR REPLACE FUNCTION rpc_confirm_document(
    p_document_id bigint,
    p_override_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id bigint;
    v_doc record;
    v_matched_doc record;
BEGIN
    v_user_id := current_app_user_id();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Acceso no autorizado o perfil inactivo.';
    END IF;

    IF NOT has_permission('documents.confirm') THEN
        RAISE EXCEPTION 'Permiso denegado: Se requiere "documents.confirm".';
    END IF;

    -- Bloqueo de fila para confirmación atómica
    SELECT * INTO v_doc FROM documents WHERE id = p_document_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Documento ID % no encontrado.', p_document_id;
    END IF;

    IF v_doc.status = 'CONFIRMED' THEN
        RETURN jsonb_build_object('success', true, 'message', 'El documento ya se encontraba confirmado.', 'document_id', v_doc.id);
    END IF;

    -- Detección de comprobante duplicado si tiene identificación fiscal formal
    IF v_doc.letter IS NOT NULL AND v_doc.point_of_sale IS NOT NULL AND v_doc.document_number IS NOT NULL THEN
        SELECT id, human_reference, issue_date, total_amount, created_at
        INTO v_matched_doc
        FROM documents
        WHERE supplier_id = v_doc.supplier_id
          AND document_type_id = v_doc.document_type_id
          AND letter = v_doc.letter
          AND point_of_sale = v_doc.point_of_sale
          AND document_number = v_doc.document_number
          AND status = 'CONFIRMED'
          AND id <> v_doc.id
        LIMIT 1;

        IF FOUND THEN
            -- Se detectó un duplicado confirmado
            IF p_override_reason IS NULL OR trim(p_override_reason) = '' THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'is_duplicate', true,
                    'matched_document_id', v_matched_doc.id,
                    'matched_human_reference', v_matched_doc.human_reference,
                    'matched_issue_date', v_matched_doc.issue_date,
                    'matched_total_amount', v_matched_doc.total_amount,
                    'message', format('DUPLICADO DETECTADO: Ya existe el comprobante %s (ID %s) registrado para este proveedor. Para forzar la confirmación se requiere motivo de excepción.', v_matched_doc.human_reference, v_matched_doc.id)
                );
            ELSE
                -- Validar permiso para autorizar excepción
                IF NOT has_permission('documents.duplicate_override') THEN
                    RAISE EXCEPTION 'Permiso denegado: No tiene autorización para confirmar comprobantes duplicados ("documents.duplicate_override").';
                END IF;

                -- Registrar en log de auditoría
                INSERT INTO duplicate_override_logs (document_id, matched_document_id, reason, authorized_by)
                VALUES (v_doc.id, v_matched_doc.id, trim(p_override_reason), v_user_id);
            END IF;
        END IF;
    END IF;

    -- Confirmación del documento
    UPDATE documents
    SET status = 'CONFIRMED',
        confirmed_by = v_user_id,
        confirmed_at = clock_timestamp()
    WHERE id = v_doc.id;

    RETURN jsonb_build_object(
        'success', true,
        'document_id', v_doc.id,
        'human_reference', v_doc.human_reference,
        'status', 'CONFIRMED',
        'message', 'Documento confirmado exitosamente e impactado en cuenta corriente.'
    );
END;
$$;


-- B. RPC: Aplicación Transaccional M:N (1 Origen a N Destinos)
CREATE OR REPLACE FUNCTION rpc_apply_documents(
    p_source_document_id bigint,
    p_applications jsonb -- Formato: [{"target_document_id": 77777, "applied_amount": 500.00, "notes": "..."}, ...]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id bigint;
    v_source record;
    v_target record;
    v_app jsonb;
    v_target_id bigint;
    v_amount numeric(15,2);
    v_notes text;
    v_total_to_apply numeric(15,2) := 0.00;
    v_source_available numeric(15,2);
    v_target_pending numeric(15,2);
    v_created_apps jsonb := '[]'::jsonb;
    v_new_app_id bigint;
BEGIN
    v_user_id := current_app_user_id();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Acceso no autorizado o perfil inactivo.';
    END IF;

    IF NOT has_permission('applications.create') THEN
        RAISE EXCEPTION 'Permiso denegado: Se requiere "applications.create".';
    END IF;

    -- Bloqueo de documento origen
    SELECT d.*, dt.can_be_source_application, dt.balance_nature, dt.code AS doc_type_code
    INTO v_source
    FROM documents d
    JOIN document_types dt ON dt.id = d.document_type_id
    WHERE d.id = p_source_document_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Documento origen ID % no encontrado.', p_source_document_id;
    END IF;

    IF v_source.status <> 'CONFIRMED' THEN
        RAISE EXCEPTION 'El documento origen ID % no está confirmado.', p_source_document_id;
    END IF;

    IF NOT v_source.can_be_source_application THEN
        RAISE EXCEPTION 'El tipo de documento % no está habilitado para originar aplicaciones.', v_source.doc_type_code;
    END IF;

    -- Obtener saldo disponible del origen
    SELECT available_credit INTO v_source_available
    FROM v_document_balances
    WHERE document_id = p_source_document_id;

    -- Validar total acumulado del payload
    FOR v_app IN SELECT * FROM jsonb_array_elements(p_applications)
    LOOP
        v_amount := (v_app->>'applied_amount')::numeric;
        IF v_amount <= 0 THEN
            RAISE EXCEPTION 'El importe a aplicar debe ser estrictamente mayor a 0.';
        END IF;
        v_total_to_apply := v_total_to_apply + v_amount;
    END LOOP;

    IF v_total_to_apply > v_source_available THEN
        RAISE EXCEPTION 'Saldo insuficiente en comprobante origen (ID %): Disponible $% vs Solicitado $%.', 
            p_source_document_id, v_source_available, v_total_to_apply;
    END IF;

    -- Procesar cada aplicación
    FOR v_app IN SELECT * FROM jsonb_array_elements(p_applications)
    LOOP
        v_target_id := (v_app->>'target_document_id')::bigint;
        v_amount := (v_app->>'applied_amount')::numeric;
        v_notes := v_app->>'notes';

        IF v_target_id = p_source_document_id THEN
            RAISE EXCEPTION 'No está permitida la autoaplicación (Doc ID %).', v_target_id;
        END IF;

        -- Bloqueo de documento destino
        SELECT d.*, dt.can_be_target_application, dt.code AS doc_type_code
        INTO v_target
        FROM documents d
        JOIN document_types dt ON dt.id = d.document_type_id
        WHERE d.id = v_target_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Documento destino ID % no encontrado.', v_target_id;
        END IF;

        IF v_target.status <> 'CONFIRMED' THEN
            RAISE EXCEPTION 'El documento destino ID % no está confirmado.', v_target_id;
        END IF;

        IF v_target.supplier_id <> v_source.supplier_id THEN
            RAISE EXCEPTION 'Inconsistencia: El documento destino ID % pertenece a otro proveedor.', v_target_id;
        END IF;

        IF v_target.currency <> v_source.currency THEN
            RAISE EXCEPTION 'Moneda incompatible: Origen % vs Destino %.', v_source.currency, v_target.currency;
        END IF;

        IF NOT v_target.can_be_target_application THEN
            RAISE EXCEPTION 'El tipo de documento % no está habilitado para recibir aplicaciones.', v_target.doc_type_code;
        END IF;

        -- Validar saldo pendiente del destino
        SELECT pending_debt INTO v_target_pending
        FROM v_document_balances
        WHERE document_id = v_target_id;

        IF v_amount > v_target_pending THEN
            RAISE EXCEPTION 'Importe excede deuda pendiente en destino (ID %): Pendiente $% vs Solicitado $%.',
                v_target_id, v_target_pending, v_amount;
        END IF;

        -- Inserción de la aplicación (Hecho histórico inmutable)
        INSERT INTO document_applications (
            source_document_id, target_document_id, applied_amount, notes, created_by
        ) VALUES (
            p_source_document_id, v_target_id, v_amount, v_notes, v_user_id
        ) RETURNING id INTO v_new_app_id;

        v_created_apps := v_created_apps || jsonb_build_object(
            'application_id', v_new_app_id,
            'source_document_id', p_source_document_id,
            'target_document_id', v_target_id,
            'applied_amount', v_amount
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'source_document_id', p_source_document_id,
        'total_applied', v_total_to_apply,
        'applications', v_created_apps,
        'message', 'Aplicaciones registradas exitosamente.'
    );
END;
$$;


-- C. RPC: Reversión / Desimputación de Aplicaciones
CREATE OR REPLACE FUNCTION rpc_desimpute_applications(
    p_application_ids bigint[],
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id bigint;
    v_app_id bigint;
    v_app record;
    v_rev_doc_id bigint;
    v_rev_type_id smallint;
    v_supplier_id bigint;
    v_human_ref text;
    v_neutralized_count integer := 0;
BEGIN
    v_user_id := current_app_user_id();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Acceso no autorizado o perfil inactivo.';
    END IF;

    IF NOT has_permission('applications.desimpute') THEN
        RAISE EXCEPTION 'Permiso denegado: Se requiere "applications.desimpute".';
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'El motivo de desimputación es obligatorio.';
    END IF;

    IF array_length(p_application_ids, 1) IS NULL OR array_length(p_application_ids, 1) = 0 THEN
        RAISE EXCEPTION 'Debe proporcionar al menos un ID de aplicación a desimputar.';
    END IF;

    -- Obtener tipo DESIMPUTACION
    SELECT id INTO v_rev_type_id FROM document_types WHERE code = 'DESIMPUTACION' LIMIT 1;
    IF v_rev_type_id IS NULL THEN
        RAISE EXCEPTION 'Tipo de documento DESIMPUTACION no configurado.';
    END IF;

    -- Obtener proveedor a partir de la primera aplicación
    SELECT d.supplier_id INTO v_supplier_id
    FROM document_applications da
    JOIN documents d ON d.id = da.source_document_id
    WHERE da.id = p_application_ids[1];

    IF v_supplier_id IS NULL THEN
        RAISE EXCEPTION 'Aplicación ID % no encontrada.', p_application_ids[1];
    END IF;

    -- Generar referencia humana para el documento de desimputación
    v_human_ref := format('DESIMP-%s', to_char(clock_timestamp(), 'YYYYMMDD-HH24MISS'));

    -- 1. Crear documento especial de Desimputación (efecto económico neto 0)
    INSERT INTO documents (
        supplier_id, document_type_id, status, human_reference, 
        issue_date, total_amount, concept, notes, created_by, confirmed_by, confirmed_at
    ) VALUES (
        v_supplier_id, v_rev_type_id, 'CONFIRMED', v_human_ref,
        CURRENT_DATE, 0.00, 'Reversión / Desimputación de Aplicaciones', p_reason,
        v_user_id, v_user_id, clock_timestamp()
    ) RETURNING id INTO v_rev_doc_id;

    -- 2. Neutralizar cada aplicación de forma completa
    FOREACH v_app_id IN ARRAY p_application_ids
    LOOP
        -- Bloqueo de fila de aplicación
        SELECT * INTO v_app FROM document_applications WHERE id = v_app_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Aplicación ID % no existe.', v_app_id;
        END IF;

        -- Verificar que no haya sido ya desimputada
        IF EXISTS (SELECT 1 FROM application_reversals WHERE application_id = v_app_id) THEN
            RAISE EXCEPTION 'La aplicación ID % ya se encuentra neutralizada previamente.', v_app_id;
        END IF;

        -- Insertar en tabla de desimputaciones
        INSERT INTO application_reversals (
            reversal_document_id, application_id, reversal_reason, created_by
        ) VALUES (
            v_rev_doc_id, v_app_id, trim(p_reason), v_user_id
        );

        v_neutralized_count := v_neutralized_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'reversal_document_id', v_rev_doc_id,
        'human_reference', v_human_ref,
        'neutralized_applications_count', v_neutralized_count,
        'message', format('Se han neutralizado exitosamente %s aplicaciones. Saldos restaurados.', v_neutralized_count)
    );
END;
$$;


-- D. RPC: Reversión Documental Mediante Compensación
CREATE OR REPLACE FUNCTION rpc_reverse_document(
    p_document_id bigint,
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id bigint;
    v_orig record;
    v_comp_type_code varchar(30);
    v_comp_type_id smallint;
    v_comp_doc_id bigint;
    v_comp_human_ref text;
    v_app_id bigint;
BEGIN
    v_user_id := current_app_user_id();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Acceso no autorizado o perfil inactivo.';
    END IF;

    IF NOT has_permission('documents.reverse') THEN
        RAISE EXCEPTION 'Permiso denegado: Se requiere "documents.reverse".';
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'El motivo de reversión es obligatorio.';
    END IF;

    -- Bloqueo del documento original
    SELECT d.*, dt.balance_nature, dt.code AS orig_type_code
    INTO v_orig
    FROM documents d
    JOIN document_types dt ON dt.id = d.document_type_id
    WHERE d.id = p_document_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Documento ID % no encontrado.', p_document_id;
    END IF;

    IF v_orig.status <> 'CONFIRMED' THEN
        RAISE EXCEPTION 'Solo pueden revertirse documentos CONFIRMADOS (Doc ID %).', p_document_id;
    END IF;

    -- Determinar tipo compensatorio de naturaleza contraria
    IF v_orig.balance_nature = 'DEBIT' THEN
        v_comp_type_code := 'AJUSTE_CREDITO';
    ELSIF v_orig.balance_nature = 'CREDIT' THEN
        v_comp_type_code := 'AJUSTE_DEBITO';
    ELSE
        RAISE EXCEPTION 'Los documentos neutros no requieren documento compensatorio de saldo.';
    END IF;

    SELECT id INTO v_comp_type_id FROM document_types WHERE code = v_comp_type_code LIMIT 1;

    -- Referencia humana del ajuste
    v_comp_human_ref := format('REV-%s-%s', v_orig.id, to_char(clock_timestamp(), 'HH24MISS'));

    -- 1. Crear documento compensatorio
    INSERT INTO documents (
        supplier_id, document_type_id, status, human_reference, external_reference,
        issue_date, currency, exchange_rate, total_amount, concept, notes,
        created_by, confirmed_by, confirmed_at
    ) VALUES (
        v_orig.supplier_id, v_comp_type_id, 'CONFIRMED', v_comp_human_ref, format('Compensa Doc ID %s', v_orig.id),
        CURRENT_DATE, v_orig.currency, v_orig.exchange_rate, v_orig.total_amount, 
        format('Reversión compensatoria de %s (ID %s)', v_orig.human_reference, v_orig.id),
        trim(p_reason), v_user_id, v_user_id, clock_timestamp()
    ) RETURNING id INTO v_comp_doc_id;

    -- 2. Vincular mediante aplicación compensatoria directa
    IF v_orig.balance_nature = 'DEBIT' THEN
        -- El ajuste crédito (origen) extingue el débito original (destino)
        INSERT INTO document_applications (
            source_document_id, target_document_id, applied_amount, notes, created_by
        ) VALUES (
            v_comp_doc_id, v_orig.id, v_orig.total_amount, format('Compensación automática por reversión: %s', p_reason), v_user_id
        ) RETURNING id INTO v_app_id;
    ELSE
        -- El débito original es compensado por el nuevo ajuste débito
        INSERT INTO document_applications (
            source_document_id, target_document_id, applied_amount, notes, created_by
        ) VALUES (
            v_orig.id, v_comp_doc_id, v_orig.total_amount, format('Compensación automática por reversión: %s', p_reason), v_user_id
        ) RETURNING id INTO v_app_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'original_document_id', v_orig.id,
        'reversal_document_id', v_comp_doc_id,
        'reversal_human_reference', v_comp_human_ref,
        'application_id', v_app_id,
        'compensated_amount', v_orig.total_amount,
        'message', format('Documento ID %s compensado exitosamente mediante %s.', v_orig.id, v_comp_human_ref)
    );
END;
$$;
