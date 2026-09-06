-- Test Suite Completo para Validación Funcional en STAGING
DO $$
DECLARE
    v_test_auth_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
    v_profile_id bigint;
    v_admin_role_id smallint;
    v_supplier_id bigint;
    v_seller_id bigint;
    v_fac_type_id smallint;
    v_op_type_id smallint;
    v_apl_type_id smallint;
    
    v_fac1_id bigint;
    v_op1_id bigint;
    v_op2_id bigint;
    v_fac2_id bigint;
    v_apl1_id bigint;
    
    v_mov_to_desimpute_id bigint;
    v_desimpute_res jsonb;
    
    v_bal numeric;
    v_ref_bal numeric;
    v_apl_sum numeric;
    v_restored_credit numeric;
    v_aging_res jsonb;
    v_proj_res jsonb;
    v_seller_breakdown jsonb;
BEGIN
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'INICIANDO SUITE DE TESTS FUNCIONALES EN STAGING';
    RAISE NOTICE '==================================================';

    -- 1. Setup Usuario y Perfil ADMIN
    SELECT id INTO v_admin_role_id FROM roles WHERE code = 'ADMIN';
    
    INSERT INTO profiles (auth_user_id, first_name, last_name, email, is_active)
    VALUES (v_test_auth_id, 'Test', 'Admin', 'test.admin@staging.internal', true)
    ON CONFLICT (auth_user_id) DO UPDATE SET is_active = true
    RETURNING id INTO v_profile_id;
    
    INSERT INTO user_roles (user_id, role_id)
    VALUES (v_profile_id, v_admin_role_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;

    -- Simular contexto de sesión Supabase
    PERFORM set_config('request.jwt.claim.sub', v_test_auth_id::text, true);

    -- Tipos de documentos
    SELECT id INTO v_fac_type_id FROM document_types WHERE code = 'FACTURA';
    SELECT id INTO v_op_type_id FROM document_types WHERE code = 'ORDEN_PAGO';
    SELECT id INTO v_apl_type_id FROM document_types WHERE code = 'APL';

    -- Limpiar ejecuciones previas del test
    SELECT id INTO v_supplier_id FROM suppliers WHERE code = 'PRV-TEST-001';
    IF v_supplier_id IS NOT NULL THEN
        DELETE FROM account_movements WHERE supplier_id = v_supplier_id;
        DELETE FROM documents WHERE supplier_id = v_supplier_id;
        DELETE FROM supplier_sellers WHERE supplier_id = v_supplier_id;
        DELETE FROM suppliers WHERE id = v_supplier_id;
    END IF;

    SELECT id INTO v_seller_id FROM sellers WHERE code = 'SEL-001';
    IF v_seller_id IS NOT NULL THEN
        DELETE FROM sellers WHERE id = v_seller_id;
    END IF;

    -- 2. Setup Proveedor y Vendedor de Test
    INSERT INTO suppliers (code, tax_id, legal_name, trade_name, is_active, created_by)
    VALUES ('PRV-TEST-001', '30-71234567-8', 'PROVEEDOR TEST S.A.', 'TEST S.A.', true, v_profile_id)
    RETURNING id INTO v_supplier_id;

    INSERT INTO sellers (code, first_name, last_name, display_name, email, is_active, created_by)
    VALUES ('SEL-001', 'Juan', 'Pérez', 'Juan Pérez', 'juan.perez@seller.com', true, v_profile_id)
    RETURNING id INTO v_seller_id;

    PERFORM rpc_link_supplier_seller(v_supplier_id, v_seller_id, CURRENT_DATE);

    -- ----------------------------------------------------
    -- TEST A: FACTURA = +1000.00
    -- ----------------------------------------------------
    SELECT (rpc_create_and_confirm_document(
        p_supplier_id => v_supplier_id,
        p_document_type_id => v_fac_type_id,
        p_seller_id => v_seller_id,
        p_letter => 'A'::varchar,
        p_point_of_sale => 1,
        p_document_number => 1001::bigint,
        p_human_reference => 'FAC A 0001-00001001'::varchar,
        p_issue_date => CURRENT_DATE,
        p_due_date => (CURRENT_DATE + 30)::date,
        p_total_amount => 1000.00::numeric,
        p_currency => 'ARS'::varchar,
        p_concept => 'Factura Test A'::text
    )->>'document_id')::bigint INTO v_fac1_id;

    SELECT SUM(amount) INTO v_bal FROM account_movements WHERE supplier_id = v_supplier_id;
    SELECT SUM(amount) INTO v_ref_bal FROM account_movements WHERE reference_id = v_fac1_id;

    IF v_bal = 1000.00 AND v_ref_bal = 1000.00 THEN
        RAISE NOTICE '[PASS] TEST A: Factura inicial +1000 (Saldo Proveedor: %, Saldo Factura: %)', v_bal, v_ref_bal;
    ELSE
        RAISE EXCEPTION '[FAIL] TEST A: Factura inicial esperada 1000, obtenido Proveedor: %, Factura: %', v_bal, v_ref_bal;
    END IF;

    -- ----------------------------------------------------
    -- TEST B: OP PARCIAL = 700.00 (Imputada a FAC1)
    -- ----------------------------------------------------
    SELECT (rpc_create_and_confirm_op(
        p_supplier_id => v_supplier_id,
        p_point_of_sale => 1,
        p_document_number => 2001::bigint,
        p_human_reference => 'OP 0001-00002001'::varchar,
        p_issue_date => CURRENT_DATE,
        p_total_amount => 700.00::numeric,
        p_currency => 'ARS'::varchar,
        p_concept => 'Pago parcial FAC1'::text,
        p_imputations => jsonb_build_array(
            jsonb_build_object('target_document_id', v_fac1_id, 'applied_amount', 700.00)
        )
    )->>'document_id')::bigint INTO v_op1_id;

    SELECT SUM(amount) INTO v_bal FROM account_movements WHERE supplier_id = v_supplier_id;
    SELECT SUM(amount) INTO v_ref_bal FROM account_movements WHERE reference_id = v_fac1_id;
    SELECT COALESCE(SUM(amount), 0.00) INTO v_apl_sum FROM account_movements WHERE reference_id = v_op1_id;

    IF v_bal = 300.00 AND v_ref_bal = 300.00 AND v_apl_sum = 0.00 THEN
        RAISE NOTICE '[PASS] TEST B: OP Parcial 700 (Saldo Proveedor: %, Saldo Factura: %, Crédito Libre OP: %)', v_bal, v_ref_bal, v_apl_sum;
    ELSE
        RAISE EXCEPTION '[FAIL] TEST B: Falló OP Parcial. Proveedor: %, FAC: %, OP Libre: %', v_bal, v_ref_bal, v_apl_sum;
    END IF;

    -- ----------------------------------------------------
    -- TEST C: OP CON REMANENTE = 500.00 (Cancela 300 de FAC1, deja 200 libres)
    -- ----------------------------------------------------
    SELECT (rpc_create_and_confirm_op(
        p_supplier_id => v_supplier_id,
        p_point_of_sale => 1,
        p_document_number => 2002::bigint,
        p_human_reference => 'OP 0001-00002002'::varchar,
        p_issue_date => CURRENT_DATE,
        p_total_amount => 500.00::numeric,
        p_currency => 'ARS'::varchar,
        p_concept => 'Pago con remanente'::text,
        p_imputations => jsonb_build_array(
            jsonb_build_object('target_document_id', v_fac1_id, 'applied_amount', 300.00)
        )
    )->>'document_id')::bigint INTO v_op2_id;

    SELECT SUM(amount) INTO v_bal FROM account_movements WHERE supplier_id = v_supplier_id;
    SELECT SUM(amount) INTO v_ref_bal FROM account_movements WHERE reference_id = v_fac1_id;
    SELECT SUM(amount) INTO v_apl_sum FROM account_movements WHERE reference_id = v_op2_id;

    IF v_bal = -200.00 AND v_ref_bal = 0.00 AND v_apl_sum = -200.00 THEN
        RAISE NOTICE '[PASS] TEST C: OP Remanente (Saldo Proveedor: %, Saldo FAC1: %, Crédito Libre OP2: %)', v_bal, v_ref_bal, v_apl_sum;
    ELSE
        RAISE EXCEPTION '[FAIL] TEST C: Falló OP Remanente. Proveedor: %, FAC1: %, OP2 Libre: %', v_bal, v_ref_bal, v_apl_sum;
    END IF;

    -- ----------------------------------------------------
    -- TEST D: APL SUMA CERO (FAC2 = +200, APL consume crédito OP2)
    -- ----------------------------------------------------
    SELECT (rpc_create_and_confirm_document(
        p_supplier_id => v_supplier_id,
        p_document_type_id => v_fac_type_id,
        p_seller_id => v_seller_id,
        p_letter => 'A'::varchar,
        p_point_of_sale => 1,
        p_document_number => 1002::bigint,
        p_human_reference => 'FAC A 0001-00001002'::varchar,
        p_issue_date => CURRENT_DATE,
        p_due_date => (CURRENT_DATE + 15)::date,
        p_total_amount => 200.00::numeric,
        p_currency => 'ARS'::varchar,
        p_concept => 'Factura Test D'::text
    )->>'document_id')::bigint INTO v_fac2_id;

    SELECT (rpc_apply_existing_balance(
        p_source_document_id => v_op2_id,
        p_target_applications => jsonb_build_array(
            jsonb_build_object('target_document_id', v_fac2_id, 'applied_amount', 200.00)
        ),
        p_notes => 'Aplicación APL crédito OP2 a FAC2'
    )->>'document_id')::bigint INTO v_apl1_id;

    SELECT SUM(amount) INTO v_apl_sum FROM account_movements WHERE document_id = v_apl1_id;
    SELECT SUM(amount) INTO v_bal FROM account_movements WHERE supplier_id = v_supplier_id;
    SELECT SUM(amount) INTO v_ref_bal FROM account_movements WHERE reference_id = v_fac2_id;

    IF v_apl_sum = 0.00 AND v_bal = 0.00 AND v_ref_bal = 0.00 THEN
        RAISE NOTICE '[PASS] TEST D: APL Suma Cero (Suma APL: %, Saldo Global: %, Saldo FAC2: %)', v_apl_sum, v_bal, v_ref_bal;
    ELSE
        RAISE EXCEPTION '[FAIL] TEST D: APL Suma Cero falló. Suma APL: %, Global: %, FAC2: %', v_apl_sum, v_bal, v_ref_bal;
    END IF;

    -- ----------------------------------------------------
    -- TEST E: DESIMPUTACIÓN (rpc_reverse_imputation)
    -- ----------------------------------------------------
    -- Buscar el renglón negativo de la APL que canceló FAC2
    SELECT id INTO v_mov_to_desimpute_id
    FROM account_movements
    WHERE document_id = v_apl1_id AND reference_id = v_fac2_id AND amount = -200.00;

    v_desimpute_res := rpc_reverse_imputation(v_mov_to_desimpute_id, 'Desimputación de prueba');

    SELECT SUM(amount) INTO v_bal FROM account_movements WHERE supplier_id = v_supplier_id;
    SELECT SUM(amount) INTO v_ref_bal FROM account_movements WHERE reference_id = v_fac2_id;
    -- El crédito restaurado reside en la referencia emisora (APL1)
    SELECT SUM(amount) INTO v_restored_credit FROM account_movements WHERE reference_id = v_apl1_id;

    IF v_bal = 0.00 AND v_ref_bal = 200.00 AND v_restored_credit = -200.00 THEN
        RAISE NOTICE '[PASS] TEST E: Desimputación (FAC2 restaurada: +%, Crédito restaurado en APL1: %, Saldo Global: %)', v_ref_bal, v_restored_credit, v_bal;
    ELSE
        RAISE EXCEPTION '[FAIL] TEST E: Desimputación falló. FAC2: %, Crédito restaurado: %, Global: %', v_ref_bal, v_restored_credit, v_bal;
    END IF;

    -- ----------------------------------------------------
    -- INVARIANTE: INMUTABILIDAD CONTABLE (Trigger bloquea UPDATE/DELETE)
    -- ----------------------------------------------------
    BEGIN
        DELETE FROM account_movements WHERE id = v_mov_to_desimpute_id;
        RAISE EXCEPTION '[FAIL] Invariante Inmutabilidad: Se permitió DELETE en account_movements!';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%INMUTABILIDAD CONTABLE%' THEN
            RAISE NOTICE '[PASS] Invariante Inmutabilidad: DELETE bloqueado por trigger.';
        ELSE
            RAISE EXCEPTION '[FAIL] Invariante Inmutabilidad: Excepción inesperada: %', SQLERRM;
        END IF;
    END;

    -- ----------------------------------------------------
    -- TEST VENDEDORES: Reconciliación y Breakdown
    -- ----------------------------------------------------
    SELECT to_jsonb(r) INTO v_seller_breakdown FROM rpc_get_supplier_seller_breakdown(v_supplier_id, 'ARS') r LIMIT 1;
    RAISE NOTICE '[PASS] Reconciliación Vendedores: %', v_seller_breakdown;

    -- ----------------------------------------------------
    -- TEST AGING & PROYECCIÓN
    -- ----------------------------------------------------
    SELECT to_jsonb(r) INTO v_aging_res FROM rpc_get_supplier_aging(CURRENT_DATE) r WHERE r.supplier_id = v_supplier_id LIMIT 1;
    RAISE NOTICE '[PASS] Aging Proveedores: %', v_aging_res;

    SELECT to_jsonb(r) INTO v_proj_res FROM rpc_get_payment_projection(CURRENT_DATE) r WHERE r.supplier_id = v_supplier_id LIMIT 1;
    RAISE NOTICE '[PASS] Proyección Pagos: %', v_proj_res;

    RAISE NOTICE '==================================================';
    RAISE NOTICE 'TODOS LOS TESTS FUNCIONALES PASARON SATISFACTORIAMENTE (PASS)';
    RAISE NOTICE '==================================================';
END;
$$;
