-- ============================================================================
-- MIGRACIÓN 11: Actualizar vistas v_document_summary y v_document_ledger con seller_id
-- Fecha: 2026-08-27
-- ============================================================================

-- 1. Actualizar v_document_summary para proyectar seller_id, seller_code y seller_display_name
DROP VIEW IF EXISTS v_document_summary CASCADE;

CREATE OR REPLACE VIEW v_document_summary AS
SELECT 
    d.id AS document_id,
    d.supplier_id,
    s.trade_name AS supplier_trade_name,
    s.tax_id AS supplier_tax_id,
    d.seller_id,
    sel.code AS seller_code,
    sel.display_name AS seller_display_name,
    d.document_type_id,
    dt.code AS document_type_code,
    dt.name AS document_type_name,
    dt.balance_nature,
    d.status,
    d.letter,
    d.point_of_sale,
    d.document_number,
    d.human_reference,
    d.issue_date,
    d.due_date,
    d.currency,
    d.total_amount,
    CASE 
        WHEN dt.balance_nature = 'DEBIT' THEN d.total_amount
        WHEN dt.balance_nature = 'CREDIT' THEN -d.total_amount
        ELSE 0.00
    END AS signed_total_amount,
    COALESCE(ref_bal.current_balance, 0.00) AS reference_balance,
    COALESCE(doc_mov.total_emitted, 0.00) AS total_emitted_amount,
    CASE 
        WHEN d.human_reference LIKE 'REV-%' THEN 'REVERSED'
        WHEN dt.code = 'APL' THEN 'APL_TRANSFER'
        WHEN dt.balance_nature = 'DEBIT' AND COALESCE(ref_bal.current_balance, 0.00) = 0.00 THEN 'PAID'
        WHEN dt.balance_nature = 'DEBIT' AND COALESCE(ref_bal.current_balance, 0.00) < d.total_amount THEN 'PARTIAL'
        WHEN dt.balance_nature = 'DEBIT' THEN 'PENDING'
        WHEN dt.balance_nature = 'CREDIT' AND COALESCE(ref_bal.current_balance, 0.00) < 0.00 THEN 'AVAILABLE_CREDIT'
        WHEN dt.balance_nature = 'CREDIT' THEN 'SETTLED_CREDIT'
        ELSE 'NEUTRAL'
    END AS derived_status,
    d.concept,
    d.notes,
    d.created_by,
    p.first_name || ' ' || p.last_name AS created_by_name,
    d.created_at
FROM documents d
JOIN suppliers s ON s.id = d.supplier_id
JOIN document_types dt ON dt.id = d.document_type_id
JOIN profiles p ON p.id = d.created_by
LEFT JOIN sellers sel ON sel.id = d.seller_id
LEFT JOIN (
    SELECT reference_id, SUM(amount) AS current_balance
    FROM account_movements
    GROUP BY reference_id
) ref_bal ON ref_bal.reference_id = d.id
LEFT JOIN (
    SELECT document_id, SUM(amount) AS total_emitted
    FROM account_movements
    GROUP BY document_id
) doc_mov ON doc_mov.document_id = d.id;


-- 2. Actualizar v_document_ledger para proyectar seller de referencia y seller de documento
DROP VIEW IF EXISTS v_document_ledger CASCADE;

CREATE OR REPLACE VIEW v_document_ledger AS
SELECT 
    m.id AS movement_id,
    m.supplier_id,
    s.trade_name AS supplier_trade_name,
    s.tax_id AS supplier_tax_id,
    m.movement_date,
    m.movement_type,
    m.currency,
    m.amount,
    SUM(m.amount) OVER (PARTITION BY m.supplier_id, m.currency ORDER BY m.movement_date, m.id) AS running_balance,
    m.document_id,
    doc.human_reference AS document_human_ref,
    doc_t.code AS document_type_code,
    doc_t.name AS document_type_name,
    doc.seller_id AS document_seller_id,
    m.reference_id,
    ref_doc.human_reference AS reference_human_ref,
    ref_t.code AS reference_type_code,
    ref_t.name AS reference_type_name,
    ref_doc.seller_id AS reference_seller_id,
    ref_sel.code AS reference_seller_code,
    ref_sel.display_name AS reference_seller_name,
    m.notes,
    m.created_by,
    p.first_name || ' ' || p.last_name AS created_by_name,
    m.created_at
FROM account_movements m
JOIN suppliers s ON s.id = m.supplier_id
JOIN documents doc ON doc.id = m.document_id
JOIN document_types doc_t ON doc_t.id = doc.document_type_id
JOIN documents ref_doc ON ref_doc.id = m.reference_id
JOIN document_types ref_t ON ref_t.id = ref_doc.document_type_id
LEFT JOIN sellers ref_sel ON ref_sel.id = ref_doc.seller_id
JOIN profiles p ON p.id = m.created_by;

-- 3. Inmutabilidad de Movimientos Contables
CREATE OR REPLACE FUNCTION trg_enforce_movement_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'INMUTABILIDAD CONTABLE: Los movimientos de cuenta corriente no pueden ser modificados ni eliminados (Movimiento ID %).', OLD.id;
END;
$$;

DROP TRIGGER IF EXISTS trg_immutability_account_movements ON account_movements;
CREATE TRIGGER trg_immutability_account_movements
BEFORE UPDATE OR DELETE ON account_movements
FOR EACH ROW
EXECUTE FUNCTION trg_enforce_movement_immutability();

-- 4. Reversión Documental Compensatoria (Ledger v3)
CREATE OR REPLACE FUNCTION rpc_reverse_document(p_document_id bigint, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id bigint;
    v_doc record;
    v_doc_type record;
    v_rev_doc_id bigint;
    v_rev_human_ref varchar(100);
    v_rev_amount numeric(15,2);
    v_current_ref_bal numeric(15,2);
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

    SELECT d.*, dt.balance_nature, dt.code as doc_type_code
    INTO v_doc
    FROM documents d
    JOIN document_types dt ON dt.id = d.document_type_id
    WHERE d.id = p_document_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Documento ID % no encontrado.', p_document_id;
    END IF;

    IF v_doc.status <> 'CONFIRMED' THEN
        RAISE EXCEPTION 'Solo pueden revertirse documentos en estado CONFIRMED.';
    END IF;

    IF v_doc.human_reference LIKE 'REV-%' THEN
        RAISE EXCEPTION 'No se puede revertir un comprobante que ya es un ajuste de reversión.';
    END IF;

    -- Validar que el saldo de su referencia no esté comprometido
    SELECT COALESCE(SUM(amount), 0.00) INTO v_current_ref_bal
    FROM account_movements
    WHERE reference_id = p_document_id;

    IF v_doc.balance_nature = 'DEBIT' AND v_current_ref_bal < v_doc.total_amount THEN
        RAISE EXCEPTION 'No se puede revertir la factura % porque tiene pagos/imputaciones aplicadas (Saldo actual: $%, Total: $%). Desimpute primero los pagos.',
            v_doc.human_reference, v_current_ref_bal, v_doc.total_amount;
    END IF;

    v_rev_human_ref := format('REV-%s', v_doc.human_reference);
    v_rev_amount := CASE WHEN v_doc.balance_nature = 'DEBIT' THEN -v_doc.total_amount ELSE v_doc.total_amount END;

    -- Insertar Cabecera de Reversión
    INSERT INTO documents (
        supplier_id, document_type_id, status, human_reference, issue_date,
        currency, exchange_rate, total_amount, concept, notes, intake_source,
        created_by, confirmed_by, confirmed_at
    ) VALUES (
        v_doc.supplier_id, v_doc.document_type_id, 'CONFIRMED', v_rev_human_ref, CURRENT_DATE,
        v_doc.currency, 1.000000, v_doc.total_amount, format('Anulación de %s: %s', v_doc.human_reference, p_reason),
        p_reason, 'MANUAL', v_user_id, v_user_id, now()
    ) RETURNING id INTO v_rev_doc_id;

    -- Insertar Renglón REVERSAL en el Ledger sobre la reference_id del documento a anular
    INSERT INTO account_movements (
        supplier_id, document_id, reference_id, line_number, movement_type,
        movement_date, currency, amount, notes, created_by
    ) VALUES (
        v_doc.supplier_id, v_rev_doc_id, v_doc.id, 1, 'REVERSAL',
        CURRENT_DATE, v_doc.currency, v_rev_amount, format('Reversión compensatoria: %s', p_reason), v_user_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'reversal_document_id', v_rev_doc_id,
        'human_reference', v_rev_human_ref,
        'message', 'Documento revertido exitosamente. El saldo de la referencia quedó en $0.00.'
    );
END;
$$;

-- 5. Desimputación Compensatoria mediante Contra-Asiento APL
CREATE OR REPLACE FUNCTION rpc_reverse_imputation(p_movement_id bigint, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id bigint;
    v_mov record;
    v_apl_type_id smallint;
    v_apl_id bigint;
    v_apl_ref varchar(100);
    v_reverse_amount numeric(15,2);
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

    -- Obtener movimiento original
    SELECT * INTO v_mov FROM account_movements WHERE id = p_movement_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Movimiento ID % no encontrado.', p_movement_id;
    END IF;

    IF v_mov.movement_type NOT IN ('IMPUTATION', 'APL_TRANSFER') OR v_mov.amount >= 0 THEN
        RAISE EXCEPTION 'Solo pueden revertirse renglones de imputación negativa hacia facturas.';
    END IF;

    v_reverse_amount := ABS(v_mov.amount);

    SELECT id INTO v_apl_type_id FROM document_types WHERE code = 'APL';

    v_apl_ref := format('APL-REV %s', lpad(p_movement_id::text, 6, '0'));

    -- Crear Cabecera APL Compensatorio
    INSERT INTO documents (
        supplier_id, document_type_id, status, human_reference, issue_date,
        currency, exchange_rate, total_amount, concept, notes, intake_source,
        created_by, confirmed_by, confirmed_at
    ) VALUES (
        v_mov.supplier_id, v_apl_type_id, 'CONFIRMED', v_apl_ref, CURRENT_DATE,
        v_mov.currency, 1.000000, v_reverse_amount, format('Desimputación de Movimiento #%s: %s', p_movement_id, p_reason),
        p_reason, 'MANUAL', v_user_id, v_user_id, now()
    ) RETURNING id INTO v_apl_id;

    -- Renglón 1: Restaura la deuda en la Factura (+amount)
    INSERT INTO account_movements (
        supplier_id, document_id, reference_id, line_number, movement_type,
        movement_date, currency, amount, notes, created_by
    ) VALUES (
        v_mov.supplier_id, v_apl_id, v_mov.reference_id, 1, 'DESIMPUTATION',
        CURRENT_DATE, v_mov.currency, v_reverse_amount, format('Restaura deuda por desimputación: %s', p_reason), v_user_id
    );

    -- Renglón 2: Restaura el crédito disponible en el comprobante emisor / OP (-amount)
    INSERT INTO account_movements (
        supplier_id, document_id, reference_id, line_number, movement_type,
        movement_date, currency, amount, notes, created_by
    ) VALUES (
        v_mov.supplier_id, v_apl_id, v_mov.document_id, 2, 'DESIMPUTATION',
        CURRENT_DATE, v_mov.currency, -v_reverse_amount, format('Restaura crédito a favor por desimputación: %s', p_reason), v_user_id
    );

    -- Validar invariante de APL suma cero
    IF (SELECT SUM(amount) FROM account_movements WHERE document_id = v_apl_id) <> 0.00 THEN
        RAISE EXCEPTION 'Error de Integridad: El APL de desimputación debe sumar 0.00.';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'apl_id', v_apl_id,
        'human_reference', v_apl_ref,
        'reversed_amount', v_reverse_amount,
        'message', 'Imputación desimputada exitosamente mediante contra-asiento APL.'
    );
END;
$$;

