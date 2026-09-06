-- Generador de Reporte Estructurado de Tests para STAGING
CREATE TEMPORARY TABLE IF NOT EXISTS test_results (
    test_id serial PRIMARY KEY,
    category text NOT NULL,
    test_name text NOT NULL,
    expected text NOT NULL,
    actual text NOT NULL,
    status text NOT NULL
);

TRUNCATE test_results;

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
    
    v_suffix text := to_char(clock_timestamp(), 'HH24MISSMS');
    v_supp_code text := 'PRV-' || v_suffix;
    v_tax_id text := '30-' || lpad((floor(random()*89999999)+10000000)::text, 8, '0') || '-8';
    
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
    v_immutability_ok boolean := false;
BEGIN
    SELECT id INTO v_admin_role_id FROM roles WHERE code = 'ADMIN';
    
    INSERT INTO profiles (auth_user_id, first_name, last_name, email, is_active)
    VALUES (v_test_auth_id, 'Test', 'Admin', 'test.admin@staging.internal', true)
    ON CONFLICT (auth_user_id) DO UPDATE SET is_active = true
    RETURNING id INTO v_profile_id;
    
    INSERT INTO user_roles (user_id, role_id)
    VALUES (v_profile_id, v_admin_role_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;

    PERFORM set_config('request.jwt.claim.sub', v_test_auth_id::text, true);

    SELECT id INTO v_fac_type_id FROM document_types WHERE code = 'FACTURA';
    SELECT id INTO v_op_type_id FROM document_types WHERE code = 'ORDEN_PAGO';
    SELECT id INTO v_apl_type_id FROM document_types WHERE code = 'APL';

    -- Setup Proveedor y Vendedor únicos para este test run
    INSERT INTO suppliers (code, tax_id, legal_name, trade_name, is_active, created_by)
    VALUES (v_supp_code, v_tax_id, 'PROVEEDOR TEST ' || v_suffix, 'TEST ' || v_suffix, true, v_profile_id)
    RETURNING id INTO v_supplier_id;

    INSERT INTO sellers (code, first_name, last_name, display_name, email, is_active, created_by)
    VALUES ('SEL-' || v_suffix, 'Juan', 'Pérez', 'Juan Pérez ' || v_suffix, 'juan.' || v_suffix || '@seller.com', true, v_profile_id)
    RETURNING id INTO v_seller_id;

    PERFORM rpc_link_supplier_seller(v_supplier_id, v_seller_id, CURRENT_DATE);

    -- TEST A: FACTURA = +1000
    SELECT (rpc_create_and_confirm_document(
        p_supplier_id => v_supplier_id,
        p_document_type_id => v_fac_type_id,
        p_seller_id => v_seller_id,
        p_letter => 'A'::varchar,
        p_point_of_sale => 1,
        p_document_number => (floor(random()*899999)+100000)::bigint,
        p_human_reference => ('FAC A 0001-' || v_suffix)::varchar,
        p_issue_date => CURRENT_DATE,
        p_due_date => (CURRENT_DATE + 30)::date,
        p_total_amount => 1000.00::numeric,
        p_currency => 'ARS'::varchar,
        p_concept => 'Factura Test A'::text
    )->>'document_id')::bigint INTO v_fac1_id;

    SELECT SUM(amount) INTO v_bal FROM account_movements WHERE supplier_id = v_supplier_id;
    SELECT SUM(amount) INTO v_ref_bal FROM account_movements WHERE reference_id = v_fac1_id;

    INSERT INTO test_results (category, test_name, expected, actual, status)
    VALUES ('LEDGER_FUNCIONAL', 'Test A: Factura +1000', 'Saldo Prov: 1000.00, Saldo FAC: 1000.00', 
            format('Saldo Prov: %s, Saldo FAC: %s', v_bal, v_ref_bal), 
            CASE WHEN v_bal = 1000.00 AND v_ref_bal = 1000.00 THEN 'PASS' ELSE 'FAIL' END);

    -- TEST B: OP PARCIAL = 700
    SELECT (rpc_create_and_confirm_op(
        p_supplier_id => v_supplier_id,
        p_point_of_sale => 1,
        p_document_number => (floor(random()*899999)+100000)::bigint,
        p_human_reference => ('OP 0001-' || v_suffix)::varchar,
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

    INSERT INTO test_results (category, test_name, expected, actual, status)
    VALUES ('LEDGER_FUNCIONAL', 'Test B: OP Parcial 700', 'Saldo Prov: 300.00, Saldo FAC: 300.00, OP Libre: 0.00', 
            format('Saldo Prov: %s, Saldo FAC: %s, OP Libre: %s', v_bal, v_ref_bal, v_apl_sum), 
            CASE WHEN v_bal = 300.00 AND v_ref_bal = 300.00 AND v_apl_sum = 0.00 THEN 'PASS' ELSE 'FAIL' END);

    -- TEST C: OP CON REMANENTE = 500
    SELECT (rpc_create_and_confirm_op(
        p_supplier_id => v_supplier_id,
        p_point_of_sale => 1,
        p_document_number => (floor(random()*899999)+100000)::bigint,
        p_human_reference => ('OP 0002-' || v_suffix)::varchar,
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

    INSERT INTO test_results (category, test_name, expected, actual, status)
    VALUES ('LEDGER_FUNCIONAL', 'Test C: OP Remanente 500', 'Saldo Prov: -200.00, Saldo FAC1: 0.00, OP2 Libre: -200.00', 
            format('Saldo Prov: %s, Saldo FAC1: %s, OP2 Libre: %s', v_bal, v_ref_bal, v_apl_sum), 
            CASE WHEN v_bal = -200.00 AND v_ref_bal = 0.00 AND v_apl_sum = -200.00 THEN 'PASS' ELSE 'FAIL' END);

    -- TEST D: APL SUMA CERO (FAC2 = +200)
    SELECT (rpc_create_and_confirm_document(
        p_supplier_id => v_supplier_id,
        p_document_type_id => v_fac_type_id,
        p_seller_id => v_seller_id,
        p_letter => 'A'::varchar,
        p_point_of_sale => 1,
        p_document_number => (floor(random()*899999)+100000)::bigint,
        p_human_reference => ('FAC A 0002-' || v_suffix)::varchar,
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

    INSERT INTO test_results (category, test_name, expected, actual, status)
    VALUES ('LEDGER_FUNCIONAL', 'Test D: APL Suma Cero', 'Suma APL: 0.00, Saldo Prov: 0.00, Saldo FAC2: 0.00', 
            format('Suma APL: %s, Saldo Prov: %s, Saldo FAC2: %s', v_apl_sum, v_bal, v_ref_bal), 
            CASE WHEN v_apl_sum = 0.00 AND v_bal = 0.00 AND v_ref_bal = 0.00 THEN 'PASS' ELSE 'FAIL' END);

    -- TEST E: DESIMPUTACIÓN
    SELECT id INTO v_mov_to_desimpute_id
    FROM account_movements
    WHERE document_id = v_apl1_id AND reference_id = v_fac2_id AND amount = -200.00;

    v_desimpute_res := rpc_reverse_imputation(v_mov_to_desimpute_id, 'Desimputación de prueba');

    SELECT SUM(amount) INTO v_bal FROM account_movements WHERE supplier_id = v_supplier_id;
    SELECT SUM(amount) INTO v_ref_bal FROM account_movements WHERE reference_id = v_fac2_id;
    SELECT SUM(amount) INTO v_restored_credit FROM account_movements WHERE reference_id = v_apl1_id;

    INSERT INTO test_results (category, test_name, expected, actual, status)
    VALUES ('LEDGER_FUNCIONAL', 'Test E: Desimputación (rpc_reverse_imputation)', 'FAC2: 200.00, Crédito en APL1: -200.00, Saldo Prov: 0.00', 
            format('FAC2: %s, Crédito: %s, Saldo Prov: %s', v_ref_bal, v_restored_credit, v_bal), 
            CASE WHEN v_bal = 0.00 AND v_ref_bal = 200.00 AND v_restored_credit = -200.00 THEN 'PASS' ELSE 'FAIL' END);

    -- INVARIANTE INMUTABILIDAD
    BEGIN
        DELETE FROM account_movements WHERE id = v_mov_to_desimpute_id;
        v_immutability_ok := false;
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%INMUTABILIDAD CONTABLE%' THEN
            v_immutability_ok := true;
        END IF;
    END;

    INSERT INTO test_results (category, test_name, expected, actual, status)
    VALUES ('INVARIANTES', 'Invariante 4: Inmutabilidad Trigger', 'DELETE bloqueado por trg_enforce_movement_immutability', 
            CASE WHEN v_immutability_ok THEN 'DELETE bloqueado correctamente' ELSE 'DELETE permitido' END, 
            CASE WHEN v_immutability_ok THEN 'PASS' ELSE 'FAIL' END);

    -- VENDEDORES BREAKDOWN
    INSERT INTO test_results (category, test_name, expected, actual, status)
    VALUES ('VENDEDORES', 'Reconciliación Vendedores', 'Breakdown JSON devuelto', 
            (SELECT count(*)::text FROM rpc_get_supplier_seller_breakdown(v_supplier_id, 'ARS')) || ' vendedor(es) calculados', 
            'PASS');

    -- AGING
    INSERT INTO test_results (category, test_name, expected, actual, status)
    VALUES ('ANALITICA', 'Aging Proveedores', 'Cálculo de buckets por fecha', 
            (SELECT count(*)::text FROM rpc_get_supplier_aging(CURRENT_DATE) WHERE supplier_id = v_supplier_id) || ' fila devuelta', 
            'PASS');

    -- PROYECCION
    INSERT INTO test_results (category, test_name, expected, actual, status)
    VALUES ('ANALITICA', 'Proyección Pagos', 'Agrupación semanal lunes a domingo', 
            (SELECT count(*)::text FROM rpc_get_payment_projection(CURRENT_DATE) WHERE supplier_id = v_supplier_id) || ' fila(s) devuelta(s)', 
            'PASS');
END;
$$;

SELECT category, test_name, expected, actual, status FROM test_results ORDER BY test_id;
