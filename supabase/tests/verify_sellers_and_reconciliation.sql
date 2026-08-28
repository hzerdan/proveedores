-- ============================================================================
-- SCRIPT DE VERIFICACIÓN INTEGRAL: VENDEDORES, ATRIBUCIÓN Y RECONCILIACIÓN
-- Fecha: 2026-08-27
-- ============================================================================

DO $$
DECLARE
    v_admin_id bigint;
    v_operador_id bigint;
    
    -- Vendedores
    v_seller_juan_id bigint;
    v_seller_pedro_id bigint;
    v_seller_maria_id bigint;
    
    -- Proveedores
    v_supp_a_id bigint;
    v_supp_b_id bigint;
    v_supp_c_id bigint;
    
    -- Relaciones
    v_rel_a_juan_id bigint;
    v_rel_b_juan_id bigint;
    v_rel_c_juan_id bigint;
    v_rel_a_pedro_id bigint;
    
    -- Document Types
    v_dt_fac smallint;
    v_dt_op smallint;
    v_dt_nc smallint;
    v_dt_apl smallint;
    
    -- Documentos
    v_fac1_id bigint;
    v_fac2_id bigint;
    v_fac_no_seller_id bigint;
    v_op_free_id bigint;
    v_op_imputed_id bigint;
    v_apl_doc_id bigint;
    
    -- Variables para Comprobación Matemática
    v_rec record;
    v_total_sellers_balance numeric(15,2);
    v_unassigned_debt numeric(15,2);
    v_free_credits numeric(15,2);
    v_net_calculated numeric(15,2);
    v_valid_sellers_count int;
BEGIN
    RAISE NOTICE '>>> INICIANDO TEST SUITE DE VENDEDORES Y RECONCILIACIÓN MATEMÁTICA <<<';

    -- 1. SETUP DE PERFILES
    SELECT id INTO v_admin_id FROM profiles WHERE email = 'admin@empresa.com' LIMIT 1;
    IF v_admin_id IS NULL THEN
        INSERT INTO profiles (auth_user_id, first_name, last_name, email, is_active)
        VALUES ('11111111-1111-1111-1111-111111111111'::uuid, 'Admin', 'Root', 'admin@empresa.com', true)
        RETURNING id INTO v_admin_id;
    END IF;

    SELECT id INTO v_operador_id FROM profiles WHERE email = 'operador@empresa.com' LIMIT 1;
    IF v_operador_id IS NULL THEN
        INSERT INTO profiles (auth_user_id, first_name, last_name, email, is_active)
        VALUES ('22222222-2222-2222-2222-222222222222'::uuid, 'Juan', 'Operador', 'operador@empresa.com', true)
        RETURNING id INTO v_operador_id;
    END IF;

    -- Obtener tipos de documento
    SELECT id INTO v_dt_fac FROM document_types WHERE code = 'FACTURA';
    SELECT id INTO v_dt_op FROM document_types WHERE code = 'ORDEN_PAGO';
    SELECT id INTO v_dt_nc FROM document_types WHERE code = 'NOTA_CREDITO';
    SELECT id INTO v_dt_apl FROM document_types WHERE code = 'APL';
    IF v_dt_apl IS NULL THEN
        INSERT INTO document_types (code, name, description, balance_nature, affects_account_balance, is_system_internal)
        VALUES ('APL', 'Documento de Aplicación', 'Transferencia de saldos entre referencias', 'NEUTRAL', false, true)
        RETURNING id INTO v_dt_apl;
    END IF;

    -- 2. SETUP DE VENDEDORES (sellers)
    INSERT INTO sellers (code, first_name, last_name, display_name, phone, email, is_active, created_by)
    VALUES ('VEND-001', 'Juan', 'Perez', 'Juan Perez', '1144445555', 'juan@ventas.com', true, v_admin_id)
    ON CONFLICT (code) DO UPDATE SET display_name = EXCLUDED.display_name
    RETURNING id INTO v_seller_juan_id;

    INSERT INTO sellers (code, first_name, last_name, display_name, phone, email, is_active, created_by)
    VALUES ('VEND-002', 'Pedro', 'Gomez', 'Pedro Gomez', '1155556666', 'pedro@ventas.com', true, v_admin_id)
    ON CONFLICT (code) DO UPDATE SET display_name = EXCLUDED.display_name
    RETURNING id INTO v_seller_pedro_id;

    INSERT INTO sellers (code, first_name, last_name, display_name, phone, email, is_active, created_by)
    VALUES ('VEND-003', 'Maria', 'Lopez', 'Maria Lopez', '1166667777', 'maria@ventas.com', true, v_admin_id)
    ON CONFLICT (code) DO UPDATE SET display_name = EXCLUDED.display_name
    RETURNING id INTO v_seller_maria_id;

    -- 3. SETUP DE PROVEEDORES (suppliers)
    INSERT INTO suppliers (code, trade_name, legal_name, tax_id, is_active, created_by)
    VALUES ('PRV-101', 'Proveedor Alfa ARS', 'Alfa Distribuidora S.A.', '30-71111111-1', true, v_admin_id)
    ON CONFLICT (tax_id) DO UPDATE SET trade_name = EXCLUDED.trade_name
    RETURNING id INTO v_supp_a_id;

    INSERT INTO suppliers (code, trade_name, legal_name, tax_id, is_active, created_by)
    VALUES ('PRV-102', 'Proveedor Beta Multi', 'Beta Insumos S.R.L.', '30-72222222-2', true, v_admin_id)
    ON CONFLICT (tax_id) DO UPDATE SET trade_name = EXCLUDED.trade_name
    RETURNING id INTO v_supp_b_id;

    INSERT INTO suppliers (code, trade_name, legal_name, tax_id, is_active, created_by)
    VALUES ('PRV-103', 'Proveedor Gamma USD', 'Gamma Global Corp.', '30-73333333-3', true, v_admin_id)
    ON CONFLICT (tax_id) DO UPDATE SET trade_name = EXCLUDED.trade_name
    RETURNING id INTO v_supp_c_id;

    -- 4. CASO 1: Vendedor Juan relacionado con 3 proveedores (M:N)
    INSERT INTO supplier_sellers (supplier_id, seller_id, valid_from, is_active, created_by)
    VALUES (v_supp_a_id, v_seller_juan_id, CURRENT_DATE - 30, true, v_admin_id)
    ON CONFLICT DO NOTHING RETURNING id INTO v_rel_a_juan_id;

    INSERT INTO supplier_sellers (supplier_id, seller_id, valid_from, is_active, created_by)
    VALUES (v_supp_b_id, v_seller_juan_id, CURRENT_DATE - 30, true, v_admin_id)
    ON CONFLICT DO NOTHING RETURNING id INTO v_rel_b_juan_id;

    INSERT INTO supplier_sellers (supplier_id, seller_id, valid_from, is_active, created_by)
    VALUES (v_supp_c_id, v_seller_juan_id, CURRENT_DATE - 30, true, v_admin_id)
    ON CONFLICT DO NOTHING RETURNING id INTO v_rel_c_juan_id;

    -- CASO 2 y 3: Proveedor A tiene dos vendedores (Juan y Pedro)
    INSERT INTO supplier_sellers (supplier_id, seller_id, valid_from, is_active, created_by)
    VALUES (v_supp_a_id, v_seller_pedro_id, CURRENT_DATE - 20, true, v_admin_id)
    ON CONFLICT DO NOTHING RETURNING id INTO v_rel_a_pedro_id;

    -- CASO 4: Facturas de Proveedor A asignadas a vendedores diferentes
    -- FAC 1 -> Juan -> $1.000 ARS
    INSERT INTO documents (
        supplier_id, seller_id, document_type_id, status, letter, point_of_sale, document_number,
        human_reference, issue_date, due_date, currency, total_amount, concept, created_by
    ) VALUES (
        v_supp_a_id, v_seller_juan_id, v_dt_fac, 'CONFIRMED', 'A', 1, 1001,
        'FAC A 0001-00001001', CURRENT_DATE - 15, CURRENT_DATE + 15, 'ARS', 1000.00, 'Factura Juan', v_admin_id
    ) RETURNING id INTO v_fac1_id;

    -- Renglón Ledger FAC 1
    INSERT INTO account_movements (supplier_id, document_id, reference_id, line_number, movement_type, movement_date, currency, amount, created_by)
    VALUES (v_supp_a_id, v_fac1_id, v_fac1_id, 1, 'ORIGIN', CURRENT_DATE - 15, 'ARS', 1000.00, v_admin_id);

    -- FAC 2 -> Pedro -> $500 ARS
    INSERT INTO documents (
        supplier_id, seller_id, document_type_id, status, letter, point_of_sale, document_number,
        human_reference, issue_date, due_date, currency, total_amount, concept, created_by
    ) VALUES (
        v_supp_a_id, v_seller_pedro_id, v_dt_fac, 'CONFIRMED', 'A', 1, 1002,
        'FAC A 0001-00001002', CURRENT_DATE - 10, CURRENT_DATE + 20, 'ARS', 500.00, 'Factura Pedro', v_admin_id
    ) RETURNING id INTO v_fac2_id;

    -- Renglón Ledger FAC 2
    INSERT INTO account_movements (supplier_id, document_id, reference_id, line_number, movement_type, movement_date, currency, amount, created_by)
    VALUES (v_supp_a_id, v_fac2_id, v_fac2_id, 1, 'ORIGIN', CURRENT_DATE - 10, 'ARS', 500.00, v_admin_id);

    -- CASO 10: Proveedor A con deuda sin vendedor (seller_id = NULL) -> $200 ARS
    INSERT INTO documents (
        supplier_id, seller_id, document_type_id, status, letter, point_of_sale, document_number,
        human_reference, issue_date, due_date, currency, total_amount, concept, created_by
    ) VALUES (
        v_supp_a_id, NULL, v_dt_fac, 'CONFIRMED', 'A', 1, 1003,
        'FAC A 0001-00001003', CURRENT_DATE - 5, CURRENT_DATE + 25, 'ARS', 200.00, 'Factura Sin Vendedor', v_admin_id
    ) RETURNING id INTO v_fac_no_seller_id;

    INSERT INTO account_movements (supplier_id, document_id, reference_id, line_number, movement_type, movement_date, currency, amount, created_by)
    VALUES (v_supp_a_id, v_fac_no_seller_id, v_fac_no_seller_id, 1, 'ORIGIN', CURRENT_DATE - 5, 'ARS', 200.00, v_admin_id);

    -- CASO 6: OP con saldo libre sin vendedor (seller_id = NULL) -> -$600 ARS
    INSERT INTO documents (
        supplier_id, seller_id, document_type_id, status, human_reference,
        issue_date, currency, total_amount, concept, created_by
    ) VALUES (
        v_supp_a_id, NULL, v_dt_op, 'CONFIRMED', 'OP 0001-00005001',
        CURRENT_DATE - 2, 'ARS', 600.00, 'OP Anticipo Libre', v_admin_id
    ) RETURNING id INTO v_op_free_id;

    INSERT INTO account_movements (supplier_id, document_id, reference_id, line_number, movement_type, movement_date, currency, amount, created_by)
    VALUES (v_supp_a_id, v_op_free_id, v_op_free_id, 1, 'ORIGIN', CURRENT_DATE - 2, 'ARS', -600.00, v_admin_id);

    -- ========================================================================
    -- TEST DE RECONCILIACIÓN MATEMÁTICA (Proveedor A - ARS)
    -- ========================================================================
    -- Esperado:
    -- Juan = +1000
    -- Pedro = +500
    -- Deuda sin vendedor = +200
    -- Crédito libre = -600
    -- Saldo Proveedor = +1000 + 500 + 200 - 600 = +1100
    -- ========================================================================
    SELECT 
        COALESCE(SUM(CASE WHEN item_category = 'SELLER' THEN net_balance ELSE 0 END), 0.00),
        COALESCE(SUM(CASE WHEN item_category = 'UNASSIGNED_DEBT' THEN net_balance ELSE 0 END), 0.00),
        COALESCE(SUM(CASE WHEN item_category = 'FREE_CREDIT' THEN net_balance ELSE 0 END), 0.00),
        COALESCE(SUM(net_balance), 0.00)
    INTO v_total_sellers_balance, v_unassigned_debt, v_free_credits, v_net_calculated
    FROM rpc_get_supplier_seller_breakdown(v_supp_a_id, 'ARS');

    IF v_total_sellers_balance <> 1500.00 OR v_unassigned_debt <> 200.00 OR v_free_credits <> -600.00 OR v_net_calculated <> 1100.00 THEN
        RAISE EXCEPTION 'Fallo en Reconciliación Matemática Proveedor A: Vendedores %, Deuda Sin Vendedor %, Cred Libre %, Neto %',
            v_total_sellers_balance, v_unassigned_debt, v_free_credits, v_net_calculated;
    END IF;
    RAISE NOTICE '>>> TEST RECONCILIACIÓN MATEMÁTICA PASÓ: 1500 (Vendedores) + 200 (Deuda sin Vendedor) - 600 (Crédito Libre) = 1100.00 <<<';

    -- CASO 7 & 8: APL que transfiere saldo de OP libre a facturas de Juan y Pedro
    -- APL cancela $400 de FAC 1 (Juan) y $200 de FAC 2 (Pedro), consumiendo $600 de la OP Libre
    INSERT INTO documents (
        supplier_id, seller_id, document_type_id, status, human_reference,
        issue_date, currency, total_amount, concept, created_by
    ) VALUES (
        v_supp_a_id, NULL, v_dt_apl, 'CONFIRMED', 'APL 0001-00009001',
        CURRENT_DATE, 'ARS', 0.00, 'APL Transferencia', v_admin_id
    ) RETURNING id INTO v_apl_doc_id;

    -- Renglones APL:
    -- 1. +600 a REF OP (consume el crédito libre)
    INSERT INTO account_movements (supplier_id, document_id, reference_id, line_number, movement_type, movement_date, currency, amount, created_by)
    VALUES (v_supp_a_id, v_apl_doc_id, v_op_free_id, 1, 'APL_TRANSFER', CURRENT_DATE, 'ARS', 600.00, v_admin_id);

    -- 2. -400 a REF FAC 1 (Juan)
    INSERT INTO account_movements (supplier_id, document_id, reference_id, line_number, movement_type, movement_date, currency, amount, created_by)
    VALUES (v_supp_a_id, v_apl_doc_id, v_fac1_id, 2, 'APL_TRANSFER', CURRENT_DATE, 'ARS', -400.00, v_admin_id);

    -- 3. -200 a REF FAC 2 (Pedro)
    INSERT INTO account_movements (supplier_id, document_id, reference_id, line_number, movement_type, movement_date, currency, amount, created_by)
    VALUES (v_supp_a_id, v_apl_doc_id, v_fac2_id, 3, 'APL_TRANSFER', CURRENT_DATE, 'ARS', -200.00, v_admin_id);

    -- Verificar nuevos saldos tras APL:
    -- OP Libre = -600 + 600 = $0 (Consumida 100%)
    -- FAC 1 (Juan) = +1000 - 400 = +$600
    -- FAC 2 (Pedro) = +500 - 200 = +$300
    -- Deuda sin vendedor = +$200
    -- Saldo Proveedor = 600 + 300 + 200 = +$1.100 (Inmutable)
    SELECT 
        COALESCE(SUM(CASE WHEN item_category = 'SELLER' THEN net_balance ELSE 0 END), 0.00),
        COALESCE(SUM(CASE WHEN item_category = 'UNASSIGNED_DEBT' THEN net_balance ELSE 0 END), 0.00),
        COALESCE(SUM(CASE WHEN item_category = 'FREE_CREDIT' THEN net_balance ELSE 0 END), 0.00),
        COALESCE(SUM(net_balance), 0.00)
    INTO v_total_sellers_balance, v_unassigned_debt, v_free_credits, v_net_calculated
    FROM rpc_get_supplier_seller_breakdown(v_supp_a_id, 'ARS');

    IF v_total_sellers_balance <> 900.00 OR v_unassigned_debt <> 200.00 OR v_free_credits <> 0.00 OR v_net_calculated <> 1100.00 THEN
        RAISE EXCEPTION 'Fallo tras APL: Vendedores % (Esp 900), Deuda Sin Vend % (Esp 200), Cred Libre % (Esp 0), Neto % (Esp 1100)',
            v_total_sellers_balance, v_unassigned_debt, v_free_credits, v_net_calculated;
    END IF;
    RAISE NOTICE '>>> TEST APL MULTI-VENDEDOR PASÓ: Juan $600 + Pedro $300 + Sin Vendedor $200 = $1100.00 <<<';

    -- CASO 9: Finalización de relación comercial y comprobantes históricos
    -- Finalizar la relación de Pedro con Proveedor A a partir de ayer
    PERFORM rpc_end_supplier_seller_relationship(v_rel_a_pedro_id, CURRENT_DATE - 1);

    -- Comprobar que Pedro ya no está vigente hoy
    SELECT COUNT(*) INTO v_valid_sellers_count 
    FROM fn_get_valid_sellers_for_supplier(v_supp_a_id, CURRENT_DATE);
    
    IF v_valid_sellers_count <> 1 THEN -- Solo Juan debe quedar vigente hoy
        RAISE EXCEPTION 'Fallo al finalizar relación: Vendedores vigentes esperados 1, encontrados %', v_valid_sellers_count;
    END IF;

    -- Comprobar que Pedro SÍ es válido si consultamos con fecha histórica (hace 10 días)
    SELECT COUNT(*) INTO v_valid_sellers_count 
    FROM fn_get_valid_sellers_for_supplier(v_supp_a_id, CURRENT_DATE - 10);

    IF v_valid_sellers_count <> 2 THEN -- Juan y Pedro ambos válidos en fecha pasada
        RAISE EXCEPTION 'Fallo en vigencia histórica: Vendedores vigentes esperados 2, encontrados %', v_valid_sellers_count;
    END IF;

    -- Comprobar que los documentos históricos de Pedro conservaron su seller_id intacto
    SELECT seller_id INTO v_rec FROM documents WHERE id = v_fac2_id;
    IF v_rec.seller_id <> v_seller_pedro_id THEN
        RAISE EXCEPTION 'Inconsistencia histórica: El comprobante modificó su seller_id tras finalizar la relación.';
    END IF;
    RAISE NOTICE '>>> TEST FINALIZACIÓN DE RELACIÓN Y REGLAS DE VIGENCIA HISTÓRICA PASARON AL 100%% <<<';

    -- CASO 11 & 12: Multimoneda y Aging por Vendedor
    -- Asignar factura en USD a Juan en Proveedor C
    INSERT INTO documents (
        supplier_id, seller_id, document_type_id, status, letter, point_of_sale, document_number,
        human_reference, issue_date, due_date, currency, total_amount, concept, created_by
    ) VALUES (
        v_supp_c_id, v_seller_juan_id, v_dt_fac, 'CONFIRMED', 'A', 1, 3001,
        'FAC USD 0001-00003001', CURRENT_DATE - 35, CURRENT_DATE - 5, 'USD', 2000.00, 'Factura USD Juan', v_admin_id
    ) RETURNING id INTO v_fac1_id;

    INSERT INTO account_movements (supplier_id, document_id, reference_id, line_number, movement_type, movement_date, currency, amount, created_by)
    VALUES (v_supp_c_id, v_fac1_id, v_fac1_id, 1, 'ORIGIN', CURRENT_DATE - 35, 'USD', 2000.00, v_admin_id);

    -- Comprobar Aging por Vendedor para Juan
    SELECT * INTO v_rec FROM rpc_get_seller_aging(CURRENT_DATE) WHERE seller_id = v_seller_juan_id AND currency = 'USD';
    IF v_rec.overdue_1_30 <> 2000.00 OR v_rec.currency <> 'USD' THEN
        RAISE EXCEPTION 'Fallo en Aging por Vendedor USD: Overdue 1-30 %, Moneda %', v_rec.overdue_1_30, v_rec.currency;
    END IF;
    RAISE NOTICE '>>> TEST AGING POR VENDEDOR MULTIMONEDA PASÓ EXITOSAMENTE <<<';

    RAISE NOTICE '========================================================================';
    RAISE NOTICE '>>> TODOS LOS TESTS DE INTEGRIDAD, NEGOCIO Y RECONCILIACIÓN PASARON <<<';
    RAISE NOTICE '========================================================================';
END;
$$;
