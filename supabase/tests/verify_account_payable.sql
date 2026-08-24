-- ============================================================================
-- SCRIPT DE VERIFICACIÓN INTEGRAL DE CUENTAS CORRIENTES DE PROVEEDORES
-- Fecha: 2026-08-24
-- ============================================================================

DO $$
DECLARE
    v_admin_profile_id bigint;
    v_operador_profile_id bigint;
    v_supplier_id bigint;
    v_fac_type_id smallint;
    v_op_type_id smallint;
    
    -- Facturas
    v_fac1_id bigint;
    v_fac2_id bigint;
    v_fac_dup_id bigint;
    
    -- Pagos
    v_op1_id bigint;
    
    -- Variables de resultado RPC
    v_app1_id bigint;
    
    -- Variables para verificación de saldos
    v_summary record;
BEGIN
    RAISE NOTICE 'INICIANDO PRUEBAS DE INTEGRIDAD Y FUNCIONALIDAD';

    -- 1. SETUP: Crear o verificar perfiles de prueba
    INSERT INTO profiles (auth_user_id, first_name, last_name, email, is_active)
    VALUES 
        ('11111111-1111-1111-1111-111111111111'::uuid, 'Admin', 'Root', 'admin@empresa.com', true),
        ('22222222-2222-2222-2222-222222222222'::uuid, 'Juan', 'Operador', 'operador@empresa.com', true)
    ON CONFLICT (auth_user_id) DO UPDATE SET is_active = true;

    SELECT id INTO v_admin_profile_id FROM profiles WHERE email = 'admin@empresa.com';
    SELECT id INTO v_operador_profile_id FROM profiles WHERE email = 'operador@empresa.com';

    -- Asignar roles
    INSERT INTO user_roles (user_id, role_id)
    SELECT v_admin_profile_id, r.id FROM roles r WHERE r.code = 'ADMIN'
    ON CONFLICT DO NOTHING;

    INSERT INTO user_roles (user_id, role_id)
    SELECT v_operador_profile_id, r.id FROM roles r WHERE r.code = 'OPERADOR'
    ON CONFLICT DO NOTHING;

    -- 2. SETUP: Crear Proveedor
    INSERT INTO suppliers (code, trade_name, legal_name, tax_id, email, is_active, created_by)
    VALUES ('PRV-002', 'Lacteos del Sur', 'Lacteos del Sur S.A.', '30-88888888-9', 'ventas@lacteos.com', true, v_admin_profile_id)
    ON CONFLICT (tax_id) DO UPDATE SET trade_name = EXCLUDED.trade_name;

    SELECT id INTO v_supplier_id FROM suppliers WHERE tax_id = '30-88888888-9';

    SELECT id INTO v_fac_type_id FROM document_types WHERE code = 'FACTURA';
    SELECT id INTO v_op_type_id FROM document_types WHERE code = 'ORDEN_PAGO';

    -- 3. TEST: Carga de Facturas (Débitos)
    -- Factura 1: $400
    INSERT INTO documents (
        supplier_id, document_type_id, status, letter, point_of_sale, document_number,
        human_reference, issue_date, due_date, currency, total_amount, concept, created_by
    ) VALUES (
        v_supplier_id, v_fac_type_id, 'CONFIRMED', 'A', 1, 2001,
        'FAC A 0001-00002001', CURRENT_DATE - 10, CURRENT_DATE + 20, 'ARS', 400.00, 'Factura A', v_operador_profile_id
    ) RETURNING id INTO v_fac1_id;

    -- Factura 2: $600
    INSERT INTO documents (
        supplier_id, document_type_id, status, letter, point_of_sale, document_number,
        human_reference, issue_date, due_date, currency, total_amount, concept, created_by
    ) VALUES (
        v_supplier_id, v_fac_type_id, 'CONFIRMED', 'A', 1, 2002,
        'FAC A 0001-00002002', CURRENT_DATE - 5, CURRENT_DATE + 25, 'ARS', 600.00, 'Factura B', v_operador_profile_id
    ) RETURNING id INTO v_fac2_id;

    -- 4. TEST: Pago de $1.000 y Aplicaciones M:N
    INSERT INTO documents (
        supplier_id, document_type_id, status, human_reference, issue_date, currency, total_amount, concept, created_by
    ) VALUES (
        v_supplier_id, v_op_type_id, 'CONFIRMED', 'OP 0001-00020001', CURRENT_DATE, 'ARS', 1000.00, 'Pago OP 1000', v_operador_profile_id
    ) RETURNING id INTO v_op1_id;

    -- Aplicar $400 a FAC 1 y $300 a FAC 2 (quedan $300 disponible en OP y $300 pendiente en FAC 2)
    INSERT INTO document_applications (source_document_id, target_document_id, applied_amount, notes, created_by)
    VALUES (v_op1_id, v_fac1_id, 400.00, 'Cancela FAC1', v_operador_profile_id) RETURNING id INTO v_app1_id;

    INSERT INTO document_applications (source_document_id, target_document_id, applied_amount, notes, created_by)
    VALUES (v_op1_id, v_fac2_id, 300.00, 'Aplica $300 a FAC2', v_operador_profile_id);

    -- Comprobar estado intermedio
    SELECT * INTO v_summary FROM v_supplier_account_summary WHERE supplier_id = v_supplier_id AND currency = 'ARS';
    IF v_summary.net_account_balance <> 0.00 OR v_summary.total_pending_debt <> 300.00 OR v_summary.total_available_credit <> 300.00 THEN
        RAISE EXCEPTION 'Fallo en comprobación intermedia: Saldo %, Pendiente %, Disp %', 
            v_summary.net_account_balance, v_summary.total_pending_debt, v_summary.total_available_credit;
    END IF;

    -- 5. TEST: Desimputación de Aplicaciones (Neutralizar aplicación de FAC 1)
    INSERT INTO documents (
        supplier_id, document_type_id, status, human_reference, issue_date, total_amount, concept, notes, created_by, confirmed_by, confirmed_at
    ) VALUES (
        v_supplier_id, (SELECT id FROM document_types WHERE code = 'DESIMPUTACION'), 'CONFIRMED',
        'DESIMP-002-1', CURRENT_DATE, 0.00, 'Desimputacion test', 'Desimputar FAC1',
        v_admin_profile_id, v_admin_profile_id, clock_timestamp()
    ) RETURNING id INTO v_fac_dup_id;

    INSERT INTO application_reversals (reversal_document_id, application_id, reversal_reason, created_by)
    VALUES (v_fac_dup_id, v_app1_id, 'Desimputacion autorizada', v_admin_profile_id);

    -- Comprobar restauración de saldos
    SELECT * INTO v_summary FROM v_supplier_account_summary WHERE supplier_id = v_supplier_id AND currency = 'ARS';
    IF v_summary.net_account_balance <> 0.00 OR v_summary.total_pending_debt <> 700.00 OR v_summary.total_available_credit <> 700.00 THEN
        RAISE EXCEPTION 'Fallo tras desimputación: Saldo %, Pendiente %, Disp %', 
            v_summary.net_account_balance, v_summary.total_pending_debt, v_summary.total_available_credit;
    END IF;

    -- 6. TEST: Reversión Documental Compensatoria (Anulación de FAC 1 por $400)
    INSERT INTO documents (
        supplier_id, document_type_id, status, human_reference, issue_date, currency, total_amount, concept, created_by, confirmed_by, confirmed_at
    ) VALUES (
        v_supplier_id, (SELECT id FROM document_types WHERE code = 'AJUSTE_CREDITO'), 'CONFIRMED',
        'REV-FAC1-002', CURRENT_DATE, 'ARS', 400.00, 'Anulacion de FAC1',
        v_admin_profile_id, v_admin_profile_id, clock_timestamp()
    ) RETURNING id INTO v_fac_dup_id;

    INSERT INTO document_applications (source_document_id, target_document_id, applied_amount, notes, created_by)
    VALUES (v_fac_dup_id, v_fac1_id, 400.00, 'Compensa FAC1', v_admin_profile_id);

    -- Consistencia matemática final:
    SELECT * INTO v_summary FROM v_supplier_account_summary WHERE supplier_id = v_supplier_id AND currency = 'ARS';
    IF v_summary.net_account_balance <> -400.00 OR (v_summary.total_pending_debt - v_summary.total_available_credit) <> -400.00 THEN
        RAISE EXCEPTION 'Fallo tras reversión: Saldo Neto %, Diferencia de Saldos %', 
            v_summary.net_account_balance, (v_summary.total_pending_debt - v_summary.total_available_credit);
    END IF;

    RAISE NOTICE '>>> CONSISTENCIA MATEMÁTICA Y TRAZABILIDAD VERIFICADAS AL 100 POR CIENTO <<<';
END;
$$;
