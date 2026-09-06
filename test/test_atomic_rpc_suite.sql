-- ==============================================================================
-- TEST SUITE: Atomic AI Extraction Confirmation, Authorization & Due Date Decision
-- PROYECTO: Sistema de Cuentas Corrientes de Proveedores
-- ==============================================================================

BEGIN;

CREATE TEMP TABLE IF NOT EXISTS test_results (
    id int,
    test_name text,
    status text,
    detail text
);
TRUNCATE test_results;

DO $$
DECLARE
    v_admin_id bigint;
    v_supplier_id bigint;
    v_doc_type_id smallint;
    v_file_id_1 bigint;
    v_file_id_2 bigint;
    v_ext_id_1 bigint;
    v_ext_id_2 bigint;
    v_ext_id_v1 bigint;
    v_session_id_1 uuid;
    v_res jsonb;
    v_err_msg text;
    v_doc_count_before integer;
    v_mov_count_before integer;
    v_doc_count_after integer;
    v_mov_count_after integer;
    v_created_doc_id bigint;
    v_check_ext record;
    v_check_file record;
    v_check_session record;
    v_check_mov record;
    v_test_run_prefix text := 'TEST-AUDIT-' || floor(extract(epoch from clock_timestamp()));
BEGIN
    -- 0. Identificar datos base
    v_admin_id := current_app_user_id();
    IF v_admin_id IS NULL THEN
        SELECT id INTO v_admin_id FROM profiles WHERE is_active = true ORDER BY id LIMIT 1;
    END IF;

    SELECT id INTO v_supplier_id FROM suppliers WHERE is_active = true LIMIT 1;
    SELECT id INTO v_doc_type_id FROM document_types WHERE code = 'FACTURA' LIMIT 1;

    -- Crear File 1 y Upload Session 1
    INSERT INTO document_files (
        storage_bucket, storage_path, file_name, file_size_bytes, mime_type, uploaded_by
    ) VALUES (
        'supplier-documents', 'test/' || v_test_run_prefix || '_1.pdf', 'factura_1.pdf', 1024, 'application/pdf', v_admin_id
    ) RETURNING id INTO v_file_id_1;

    INSERT INTO document_upload_sessions (
        token_hash, file_id, status, created_by, expires_at
    ) VALUES (
        md5(gen_random_uuid()::text), v_file_id_1, 'PENDING', v_admin_id, clock_timestamp() + interval '1 hour'
    ) RETURNING id INTO v_session_id_1;

    -- Crear File 2 (para prueba de discrepancia de file_id)
    INSERT INTO document_files (
        storage_bucket, storage_path, file_name, file_size_bytes, mime_type, uploaded_by
    ) VALUES (
        'supplier-documents', 'test/' || v_test_run_prefix || '_2.pdf', 'factura_2.pdf', 2048, 'application/pdf', v_admin_id
    ) RETURNING id INTO v_file_id_2;

    -- Crear Extracción 1 (Schema v2.0 con printed_due_date = 2026-09-15 y plazo 30 días -> calc 2026-09-23)
    -- Asignamos created_by = 3 específicamente para verificar que NO sea sobrescrito al confirmar
    INSERT INTO document_ai_extractions (
        file_id, model_name, model_provider, extracted_raw_payload, confidence_score, extraction_duration_ms, status, created_by
    ) VALUES (
        v_file_id_1,
        'gpt-4o-mini',
        'OPENAI',
        jsonb_build_object(
            'schema_version', '2.0',
            'supplier', jsonb_build_object('tax_id', '30-71192994-7', 'legal_name', 'TEST S.A.'),
            'document', jsonb_build_object(
                'type_code', 'FACTURA',
                'letter', 'A',
                'point_of_sale', '00008',
                'document_number', '00030893',
                'issue_date', '2026-08-24',
                'printed_due_date', '2026-09-15',
                'payment_condition_text', '30 días f.f.',
                'payment_term_days', 30,
                'payment_term_basis', 'ISSUE_DATE',
                'currency', 'ARS',
                'total_amount', 1500.00
            )
        ),
        0.98,
        1200,
        'SUCCESS',
        3
    ) RETURNING id INTO v_ext_id_1;

    -- --------------------------------------------------------------------------
    -- PRUEBA 1: Inconsistencia de vinculación (file_id_2 vs ext_id_1)
    -- --------------------------------------------------------------------------
    BEGIN
        PERFORM rpc_create_and_confirm_document(
            p_supplier_id := v_supplier_id,
            p_document_type_id := v_doc_type_id,
            p_letter := 'A',
            p_point_of_sale := 8,
            p_document_number := 90001,
            p_human_reference := v_test_run_prefix || '-MISMATCH',
            p_issue_date := '2026-08-24',
            p_due_date := '2026-09-15',
            p_total_amount := 1500.00,
            p_ai_extraction_id := v_ext_id_1,
            p_file_id := v_file_id_2 -- Mismatch!
        );
        RAISE EXCEPTION 'FALLÓ PRUEBA 1: Debió rechazar la discrepancia entre extraction.file_id y p_file_id.';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%Inconsistencia de vinculación%' THEN
            INSERT INTO test_results VALUES (1, 'Rechazo de IDs ajenos / vinculación cruzada', 'PASS', SQLERRM);
        ELSE
            RAISE EXCEPTION 'FALLÓ PRUEBA 1 con error inesperado: %', SQLERRM;
        END IF;
    END;

    -- --------------------------------------------------------------------------
    -- PRUEBA 2: Estado no admisible (FAILED)
    -- --------------------------------------------------------------------------
    UPDATE document_ai_extractions SET status = 'FAILED' WHERE id = v_ext_id_1;
    BEGIN
        PERFORM rpc_create_and_confirm_document(
            p_supplier_id := v_supplier_id,
            p_document_type_id := v_doc_type_id,
            p_letter := 'A',
            p_point_of_sale := 8,
            p_document_number := 90002,
            p_human_reference := v_test_run_prefix || '-FAILED',
            p_issue_date := '2026-08-24',
            p_due_date := '2026-09-15',
            p_total_amount := 1500.00,
            p_ai_extraction_id := v_ext_id_1,
            p_file_id := v_file_id_1
        );
        RAISE EXCEPTION 'FALLÓ PRUEBA 2: Debió rechazar la extracción con estado FAILED.';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%Estado no admisible%' THEN
            INSERT INTO test_results VALUES (2, 'Rechazo de extracción con estado inadmisible (FAILED)', 'PASS', SQLERRM);
        ELSE
            RAISE EXCEPTION 'FALLÓ PRUEBA 2 con error inesperado: %', SQLERRM;
        END IF;
    END;
    UPDATE document_ai_extractions SET status = 'SUCCESS' WHERE id = v_ext_id_1;

    -- --------------------------------------------------------------------------
    -- PRUEBA 3: Validación estricta PRINTED (fecha suministrada difiere de impresa)
    -- --------------------------------------------------------------------------
    BEGIN
        PERFORM rpc_create_and_confirm_document(
            p_supplier_id := v_supplier_id,
            p_document_type_id := v_doc_type_id,
            p_letter := 'A',
            p_point_of_sale := 8,
            p_document_number := 90003,
            p_human_reference := v_test_run_prefix || '-DIFF-PRINTED',
            p_issue_date := '2026-08-24',
            p_due_date := '2026-09-20', -- Difiere de la impresa (2026-09-15)!
            p_total_amount := 1500.00,
            p_ai_extraction_id := v_ext_id_1,
            p_file_id := v_file_id_1,
            p_confirmed_payload_diff := jsonb_build_object(
                'due_date_decision', jsonb_build_object(
                    'selection_source', 'PRINTED',
                    'printed_due_date', '2026-09-15'
                )
            )
        );
        RAISE EXCEPTION 'FALLÓ PRUEBA 3: Debió rechazar fecha que difiere de la impresa cuando el origen es PRINTED.';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%no coincide con la fecha impresa extraída%' THEN
            INSERT INTO test_results VALUES (3, 'Validación estricta de origen PRINTED (rechazo de discrepancia)', 'PASS', SQLERRM);
        ELSE
            RAISE EXCEPTION 'FALLÓ PRUEBA 3 con error inesperado: %', SQLERRM;
        END IF;
    END;

    -- --------------------------------------------------------------------------
    -- PRUEBA 4: Validación estricta CALCULATED (fecha suministrada difiere de calculada)
    -- --------------------------------------------------------------------------
    BEGIN
        PERFORM rpc_create_and_confirm_document(
            p_supplier_id := v_supplier_id,
            p_document_type_id := v_doc_type_id,
            p_letter := 'A',
            p_point_of_sale := 8,
            p_document_number := 90004,
            p_human_reference := v_test_run_prefix || '-DIFF-CALC',
            p_issue_date := '2026-08-24',
            p_due_date := '2026-09-30', -- Difiere de 24/08 + 30d = 23/09!
            p_total_amount := 1500.00,
            p_ai_extraction_id := v_ext_id_1,
            p_file_id := v_file_id_1,
            p_confirmed_payload_diff := jsonb_build_object(
                'due_date_decision', jsonb_build_object(
                    'selection_source', 'CALCULATED',
                    'calculated_due_date', '2026-09-23'
                )
            )
        );
        RAISE EXCEPTION 'FALLÓ PRUEBA 4: Debió rechazar fecha que difiere de la calculada cuando el origen es CALCULATED.';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%no coincide con la fecha calculada determinísticamente%' THEN
            INSERT INTO test_results VALUES (4, 'Validación estricta de origen CALCULATED (rechazo de discrepancia)', 'PASS', SQLERRM);
        ELSE
            RAISE EXCEPTION 'FALLÓ PRUEBA 4 con error inesperado: %', SQLERRM;
        END IF;
    END;

    -- --------------------------------------------------------------------------
    -- PRUEBA 5: Validación estricta MANUAL (exige motivo >= 3 caracteres)
    -- --------------------------------------------------------------------------
    BEGIN
        PERFORM rpc_create_and_confirm_document(
            p_supplier_id := v_supplier_id,
            p_document_type_id := v_doc_type_id,
            p_letter := 'A',
            p_point_of_sale := 8,
            p_document_number := 90005,
            p_human_reference := v_test_run_prefix || '-NO-REASON',
            p_issue_date := '2026-08-24',
            p_due_date := '2026-10-01',
            p_total_amount := 1500.00,
            p_ai_extraction_id := v_ext_id_1,
            p_file_id := v_file_id_1,
            p_confirmed_payload_diff := jsonb_build_object(
                'due_date_decision', jsonb_build_object(
                    'selection_source', 'MANUAL',
                    'manual_reason', 'ok' -- Menor a 3 caracteres!
                )
            )
        );
        RAISE EXCEPTION 'FALLÓ PRUEBA 5: Debió rechazar motivo menor a 3 caracteres.';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%exige indicar un motivo explicativo de al menos 3 caracteres%' THEN
            INSERT INTO test_results VALUES (5, 'Validación estricta de origen MANUAL (exigencia de motivo >= 3 caracteres)', 'PASS', SQLERRM);
        ELSE
            RAISE EXCEPTION 'FALLÓ PRUEBA 5 con error inesperado: %', SQLERRM;
        END IF;
    END;

    -- --------------------------------------------------------------------------
    -- PRUEBA 6: Verificación de Rollback Completo
    -- --------------------------------------------------------------------------
    SELECT count(*) INTO v_doc_count_before FROM documents;
    SELECT count(*) INTO v_mov_count_before FROM account_movements;

    BEGIN
        PERFORM rpc_create_and_confirm_document(
            p_supplier_id := v_supplier_id,
            p_document_type_id := v_doc_type_id,
            p_letter := 'A',
            p_point_of_sale := 8,
            p_document_number := 90006,
            p_human_reference := v_test_run_prefix || '-ROLLBACK-TEST',
            p_issue_date := '2026-08-24',
            p_due_date := '2026-10-01',
            p_total_amount := 1500.00,
            p_ai_extraction_id := v_ext_id_1,
            p_file_id := v_file_id_1,
            p_confirmed_payload_diff := jsonb_build_object(
                'due_date_decision', jsonb_build_object(
                    'selection_source', 'PRINTED' -- Forzar error de validación
                )
            )
        );
    EXCEPTION WHEN OTHERS THEN
        -- Esperamos error
    END;

    SELECT count(*) INTO v_doc_count_after FROM documents;
    SELECT count(*) INTO v_mov_count_after FROM account_movements;

    IF v_doc_count_before != v_doc_count_after OR v_mov_count_before != v_mov_count_after THEN
        RAISE EXCEPTION 'FALLÓ PRUEBA 6: Falló el rollback. Se insertaron registros espurios en documents o account_movements.';
    END IF;
    INSERT INTO test_results VALUES (6, 'Prueba de Rollback Completo', 'PASS', format('documents=%s, movements=%s intactos', v_doc_count_after, v_mov_count_after));

    -- --------------------------------------------------------------------------
    -- PRUEBA 7: Ejecución Atómica Exitosa, Preservación de created_by y Auditoría
    -- --------------------------------------------------------------------------
    v_res := rpc_create_and_confirm_document(
        p_supplier_id := v_supplier_id,
        p_document_type_id := v_doc_type_id,
        p_letter := 'A',
        p_point_of_sale := 8,
        p_document_number := 90007,
        p_human_reference := v_test_run_prefix || '-SUCCESS',
        p_issue_date := '2026-08-24',
        p_due_date := '2026-09-15', -- Coincide exactamente con la impresa
        p_total_amount := 1500.00,
        p_ai_extraction_id := v_ext_id_1,
        p_file_id := v_file_id_1,
        p_confirmed_payload_diff := jsonb_build_object(
            'due_date_decision', jsonb_build_object(
                'selection_source', 'PRINTED',
                'selected_due_date', '2026-09-15',
                'printed_due_date', '2026-09-15'
            ),
            'client_spoofed_user', 9999 -- Campo reservado que debe ser ignorado/reemplazado
        )
    );

    IF (v_res->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'FALLÓ PRUEBA 7: Falló la ejecución exitosa de la RPC: %', v_res;
    END IF;

    v_created_doc_id := (v_res->>'document_id')::bigint;

    -- Verificar vinculación y auditoría en document_ai_extractions
    SELECT * INTO v_check_ext FROM document_ai_extractions WHERE id = v_ext_id_1;
    IF v_check_ext.document_id != v_created_doc_id THEN
        RAISE EXCEPTION 'FALLÓ PRUEBA 7: extraction.document_id (%) != created_doc_id (%).', v_check_ext.document_id, v_created_doc_id;
    END IF;

    IF v_check_ext.created_by != 3 THEN
        RAISE EXCEPTION 'FALLÓ PRUEBA 7: created_by fue sobrescrito! Valor actual: %, esperado: 3.', v_check_ext.created_by;
    END IF;

    IF v_check_ext.confirmed_by IS NULL OR v_check_ext.confirmed_by != v_admin_id THEN
        RAISE EXCEPTION 'FALLÓ PRUEBA 7: confirmed_by (%) no coincide con el usuario confirmante (%).', v_check_ext.confirmed_by, v_admin_id;
    END IF;

    IF v_check_ext.confirmed_at IS NULL THEN
        RAISE EXCEPTION 'FALLÓ PRUEBA 7: confirmed_at no fue registrado.';
    END IF;

    IF (v_check_ext.confirmed_payload_diff->>'server_confirmed_by')::bigint != v_admin_id THEN
        RAISE EXCEPTION 'FALLÓ PRUEBA 7: server_confirmed_by en payload diff no fue sellado en backend.';
    END IF;

    -- Verificar vinculación de file y session
    SELECT * INTO v_check_file FROM document_files WHERE id = v_file_id_1;
    IF v_check_file.document_id != v_created_doc_id THEN
        RAISE EXCEPTION 'FALLÓ PRUEBA 7: file.document_id no fue vinculado al comprobante.';
    END IF;

    SELECT * INTO v_check_session FROM document_upload_sessions WHERE id = v_session_id_1;
    IF v_check_session.document_id != v_created_doc_id OR v_check_session.status != 'COMPLETED' THEN
        RAISE EXCEPTION 'FALLÓ PRUEBA 7: upload_session no fue completada ni vinculada.';
    END IF;

    -- Verificar creación de renglón ORIGIN en account_movements
    SELECT * INTO v_check_mov FROM account_movements WHERE document_id = v_created_doc_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'FALLÓ PRUEBA 7: No se generó el renglón ORIGIN en account_movements.';
    END IF;

    IF v_check_mov.amount != 1500.00 THEN
        RAISE EXCEPTION 'FALLÓ PRUEBA 7: El importe del movimiento (%) difiere del comprobante (1500.00).', v_check_mov.amount;
    END IF;

    INSERT INTO test_results VALUES (7, 'Confirmación atómica: created_by=3 preservado, confirmed_by y diff auditados, renglón ORIGIN creado', 'PASS', format('doc_id=%s, confirmed_by=%s', v_created_doc_id, v_check_ext.confirmed_by));

    -- --------------------------------------------------------------------------
    -- PRUEBA 8: Rechazo de Reutilización (extracción o archivo ya vinculados)
    -- --------------------------------------------------------------------------
    BEGIN
        PERFORM rpc_create_and_confirm_document(
            p_supplier_id := v_supplier_id,
            p_document_type_id := v_doc_type_id,
            p_letter := 'A',
            p_point_of_sale := 8,
            p_document_number := 90008,
            p_human_reference := v_test_run_prefix || '-REUSE-EXT',
            p_issue_date := '2026-08-24',
            p_due_date := '2026-09-15',
            p_total_amount := 1500.00,
            p_ai_extraction_id := v_ext_id_1, -- Ya vinculado!
            p_file_id := v_file_id_1
        );
        RAISE EXCEPTION 'FALLÓ PRUEBA 8: Debió rechazar la reutilización de la extracción.';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%Reutilización rechazada%' THEN
            INSERT INTO test_results VALUES (8, 'Rechazo de reutilización de extracción y archivo ya vinculados', 'PASS', SQLERRM);
        ELSE
            RAISE EXCEPTION 'FALLÓ PRUEBA 8 con error inesperado: %', SQLERRM;
        END IF;
    END;

    -- --------------------------------------------------------------------------
    -- PRUEBA 9: Convivencia con Payload Histórico Schema v1.0
    -- --------------------------------------------------------------------------
    INSERT INTO document_ai_extractions (
        file_id, model_name, model_provider, extracted_raw_payload, confidence_score, extraction_duration_ms, status, created_by
    ) VALUES (
        v_file_id_2,
        'gpt-4o-mini',
        'OPENAI',
        jsonb_build_object(
            'supplier', jsonb_build_object('tax_id', '30-71192994-7', 'legal_name', 'HISTORICO V1 S.A.'),
            'document', jsonb_build_object(
                'type_code', 'FACTURA',
                'letter', 'A',
                'point_of_sale', 1,
                'document_number', 12345,
                'issue_date', '2026-08-24',
                'due_date', '2026-09-23', -- En v1 la fecha venía como due_date
                'currency', 'ARS',
                'total_amount', 3200.00
            )
        ),
        0.95,
        1500,
        'SUCCESS',
        v_admin_id
    ) RETURNING id INTO v_ext_id_v1;

    v_res := rpc_create_and_confirm_document(
        p_supplier_id := v_supplier_id,
        p_document_type_id := v_doc_type_id,
        p_letter := 'A',
        p_point_of_sale := 1,
        p_document_number := 12345,
        p_human_reference := v_test_run_prefix || '-HISTORIC-V1',
        p_issue_date := '2026-08-24',
        p_due_date := '2026-09-23',
        p_total_amount := 3200.00,
        p_ai_extraction_id := v_ext_id_v1,
        p_file_id := v_file_id_2,
        p_confirmed_payload_diff := jsonb_build_object(
            'due_date_decision', jsonb_build_object(
                'selection_source', 'PRINTED',
                'selected_due_date', '2026-09-23'
            )
        )
    );

    IF (v_res->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'FALLÓ PRUEBA 9: Error al confirmar comprobante con payload histórico v1: %', v_res;
    END IF;

    INSERT INTO test_results VALUES (9, 'Convivencia y confirmación exitosa con payload histórico v1.0', 'PASS', format('doc_id=%s confirmado con due_date histórico', v_res->>'document_id'));

END;
$$;

SELECT id, test_name, status, detail FROM test_results ORDER BY id;

ROLLBACK;
