-- ==============================================================================
-- TEST SUITE: Configurable Document Numbering, Storage Protection & Signed URLs
-- PROYECTO: Sistema de Cuentas Corrientes de Proveedores
-- ENTORNO: QA (Seguro mediante bloque transaccional con ROLLBACK)
-- ==============================================================================

BEGIN;

CREATE TEMP TABLE test_results (
    test_id serial PRIMARY KEY,
    test_name text NOT NULL,
    status text NOT NULL, -- PASS / FAIL
    detail text
);

DO $$
DECLARE
    v_admin_id bigint;
    v_supplier_id bigint;
    v_op_type_id smallint;
    v_apl_type_id smallint;
    v_factura_type_id smallint;
    v_op_series_id bigint;
    v_apl_series_id bigint;
    v_test_series_id bigint;
    v_alloc_num integer;
    v_alloc_pos integer;
    v_alloc_ref text;
    v_err_msg text;
    v_err_occurred boolean;
    v_adj_id bigint;
    v_confirmed_doc_id bigint;
    v_test_file_id bigint;
    v_storage_obj_id uuid;
    v_url_res jsonb;
BEGIN
    -- 0. Identificar datos base
    SELECT id INTO v_admin_id FROM profiles WHERE is_active = true ORDER BY id LIMIT 1;
    SELECT id INTO v_supplier_id FROM suppliers WHERE is_active = true ORDER BY id LIMIT 1;
    SELECT id INTO v_op_type_id FROM document_types WHERE code = 'ORDEN_PAGO';
    SELECT id INTO v_apl_type_id FROM document_types WHERE code = 'APL';
    SELECT id INTO v_factura_type_id FROM document_types WHERE code = 'FACTURA';

    -- --------------------------------------------------------------------------
    -- 1. SEED INICIAL: OP y APL en INTERNAL_SEQUENCE y series 0100
    -- --------------------------------------------------------------------------
    IF EXISTS (
        SELECT 1 FROM document_types WHERE id = v_op_type_id AND numbering_mode = 'INTERNAL_SEQUENCE'
    ) AND EXISTS (
        SELECT 1 FROM document_types WHERE id = v_apl_type_id AND numbering_mode = 'INTERNAL_SEQUENCE'
    ) THEN
        INSERT INTO test_results (test_name, status, detail)
        VALUES ('1.1 Seed Mode: OP y APL configurados como INTERNAL_SEQUENCE', 'PASS', 'OK');
    ELSE
        INSERT INTO test_results (test_name, status, detail)
        VALUES ('1.1 Seed Mode: OP y APL configurados como INTERNAL_SEQUENCE', 'FAIL', 'Modos incorrectos');
    END IF;

    SELECT id INTO v_op_series_id FROM document_numbering_series
    WHERE document_type_id = v_op_type_id AND point_of_sale = 100 AND is_active = true;

    SELECT id INTO v_apl_series_id FROM document_numbering_series
    WHERE document_type_id = v_apl_type_id AND point_of_sale = 100 AND is_active = true;

    IF v_op_series_id IS NOT NULL AND v_apl_series_id IS NOT NULL AND v_op_series_id <> v_apl_series_id THEN
        INSERT INTO test_results (test_name, status, detail)
        VALUES ('1.2 Series independientes iniciales POS 0100 para OP y APL', 'PASS',
                format('OP Series ID: %s, APL Series ID: %s', v_op_series_id, v_apl_series_id));
    ELSE
        INSERT INTO test_results (test_name, status, detail)
        VALUES ('1.2 Series independientes iniciales POS 0100 para OP y APL', 'FAIL', 'Series no encontradas o compartidas');
    END IF;

    -- --------------------------------------------------------------------------
    -- 2. ASIGNACIÓN ATÓMICA Y SECUENCIAL DE NÚMEROS (fn_allocate_internal_document_number)
    -- --------------------------------------------------------------------------
    -- Creamos una serie temporal dedicada para pruebas
    INSERT INTO document_numbering_series (
        document_type_id, letter, point_of_sale, next_number, is_active, description, created_by
    ) VALUES (
        v_op_type_id, NULL, 150, 1, true, 'Serie de Prueba Transaccional', v_admin_id
    ) RETURNING id INTO v_test_series_id;

    -- Emisión 1
    SELECT assigned_number, point_of_sale, human_reference
    INTO v_alloc_num, v_alloc_pos, v_alloc_ref
    FROM fn_allocate_internal_document_number(v_test_series_id, 'ORDEN_PAGO', false);

    IF v_alloc_num = 1 AND v_alloc_pos = 150 AND v_alloc_ref = 'OP 0150-00000001' THEN
        INSERT INTO test_results (test_name, status, detail)
        VALUES ('2.1 Primera asignación emite OP 0150-00000001', 'PASS', v_alloc_ref);
    ELSE
        INSERT INTO test_results (test_name, status, detail)
        VALUES ('2.1 Primera asignación emite OP 0150-00000001', 'FAIL', format('Obtenido: %s', v_alloc_ref));
    END IF;

    -- Emisión 2 correlativa
    SELECT assigned_number, point_of_sale, human_reference
    INTO v_alloc_num, v_alloc_pos, v_alloc_ref
    FROM fn_allocate_internal_document_number(v_test_series_id, 'ORDEN_PAGO', false);

    IF v_alloc_num = 2 AND v_alloc_ref = 'OP 0150-00000002' THEN
        INSERT INTO test_results (test_name, status, detail)
        VALUES ('2.2 Segunda asignación emite OP 0150-00000002 correlativo', 'PASS', v_alloc_ref);
    ELSE
        INSERT INTO test_results (test_name, status, detail)
        VALUES ('2.2 Segunda asignación emite OP 0150-00000002 correlativo', 'FAIL', format('Obtenido: %s', v_alloc_ref));
    END IF;

    -- --------------------------------------------------------------------------
    -- 3. VALIDACIÓN DE SERIE Y COMPROBACIÓN CONTRA TIPO
    -- --------------------------------------------------------------------------
    -- Emisión de reversión con la misma serie de APL (usa APL-REV y el mismo correlativo)
    INSERT INTO document_numbering_series (
        document_type_id, letter, point_of_sale, next_number, is_active, description, created_by
    ) VALUES (
        v_apl_type_id, NULL, 120, 10, true, 'Serie APL Prueba', v_admin_id
    ) RETURNING id INTO v_test_series_id;

    -- APL Normal
    SELECT assigned_number, human_reference INTO v_alloc_num, v_alloc_ref
    FROM fn_allocate_internal_document_number(v_test_series_id, 'APL', false);

    -- Desimputación (APL-REV) sobre la misma serie
    SELECT assigned_number, human_reference INTO v_alloc_num, v_alloc_ref
    FROM fn_allocate_internal_document_number(v_test_series_id, 'APL', true);

    IF v_alloc_num = 11 AND v_alloc_ref = 'APL-REV 0120-00000011' THEN
        INSERT INTO test_results (test_name, status, detail)
        VALUES ('3.1 Desimputación (APL-REV) consume correlativo de serie APL unificada', 'PASS', v_alloc_ref);
    ELSE
        INSERT INTO test_results (test_name, status, detail)
        VALUES ('3.1 Desimputación (APL-REV) consume correlativo de serie APL unificada', 'FAIL', format('Obtenido: %s', v_alloc_ref));
    END IF;


    -- --------------------------------------------------------------------------
    -- 4. RECHAZO POR SERIE INACTIVA
    -- --------------------------------------------------------------------------
    UPDATE document_numbering_series SET is_active = false WHERE id = v_test_series_id;
    v_err_occurred := false;
    BEGIN
        PERFORM fn_allocate_internal_document_number(v_test_series_id, 'APL', false);
    EXCEPTION WHEN OTHERS THEN
        v_err_occurred := true;
        v_err_msg := SQLERRM;
    END;

    IF v_err_occurred AND v_err_msg LIKE '%inactiva%' THEN
        INSERT INTO test_results (test_name, status, detail)
        VALUES ('4.1 Rechazo de serie inactiva', 'PASS', v_err_msg);
    ELSE
        INSERT INTO test_results (test_name, status, detail)
        VALUES ('4.1 Rechazo de serie inactiva', 'FAIL', coalesce(v_err_msg, 'No lanzó error'));
    END IF;

    UPDATE document_numbering_series SET is_active = true WHERE id = v_test_series_id;

    -- --------------------------------------------------------------------------
    -- 5. SERIE AGOTADA (LÍMITE 99999999)
    -- --------------------------------------------------------------------------
    -- Ajustamos contador a 99999999 (último válido)
    UPDATE document_numbering_series SET next_number = 99999999 WHERE id = v_test_series_id;
    SELECT assigned_number, human_reference
    INTO v_alloc_num, v_alloc_ref
    FROM fn_allocate_internal_document_number(v_test_series_id, 'APL', false);

    IF v_alloc_num = 99999999 AND v_alloc_ref = 'APL 0120-99999999' THEN
        INSERT INTO test_results (test_name, status, detail)
        VALUES ('5.1 Último número 99999999 emitido correctamente', 'PASS', v_alloc_ref);

    ELSE
        INSERT INTO test_results (test_name, status, detail)
        VALUES ('5.1 Último número 99999999 emitido correctamente', 'FAIL', format('Obtenido: %s', v_alloc_ref));
    END IF;

    -- Siguiente intento debe ser rechazado por serie agotada
    v_err_occurred := false;
    BEGIN
        PERFORM fn_allocate_internal_document_number(v_test_series_id, 'APL', false);
    EXCEPTION WHEN OTHERS THEN
        v_err_occurred := true;
        v_err_msg := SQLERRM;
    END;

    IF v_err_occurred AND v_err_msg LIKE '%SERIE_AGOTADA%' THEN
        INSERT INTO test_results (test_name, status, detail)
        VALUES ('5.2 Rechazo atómico post-99999999 por serie agotada', 'PASS', v_err_msg);
    ELSE
        INSERT INTO test_results (test_name, status, detail)
        VALUES ('5.2 Rechazo atómico post-99999999 por serie agotada', 'FAIL', coalesce(v_err_msg, 'No lanzó error'));
    END IF;

    -- --------------------------------------------------------------------------
    -- 6. AJUSTE DE CONTADOR Y AUDITORÍA APPEND-ONLY (rpc_adjust_numbering_series)
    -- --------------------------------------------------------------------------
    -- Creamos serie 2 para pruebas de ajuste
    INSERT INTO document_numbering_series (
        document_type_id, letter, point_of_sale, next_number, is_active, description, created_by
    ) VALUES (
        v_op_type_id, NULL, 160, 5, true, 'Serie Ajustes', v_admin_id
    ) RETURNING id INTO v_test_series_id;

    -- Avance hacia adelante de 5 a 20 con motivo obligatorio
    -- Simulamos contexto de usuario autenticado
    PERFORM set_config('request.jwt.claim.sub', (SELECT auth_user_id::text FROM profiles WHERE id = v_admin_id), true);


    DECLARE
        v_adj_res jsonb;
    BEGIN
        v_adj_res := rpc_adjust_numbering_series(
            v_test_series_id,
            20,
            'Regularización contable auditada por migración de talonario'
        );

        IF (SELECT next_number FROM document_numbering_series WHERE id = v_test_series_id) = 20
           AND EXISTS (
               SELECT 1 FROM document_numbering_series_adjustments
               WHERE series_id = v_test_series_id AND previous_number = 5 AND new_number = 20
           ) THEN
            INSERT INTO test_results (test_name, status, detail)
            VALUES ('6.1 Avance auditado del contador hacia adelante (5 -> 20)', 'PASS', format('Nuevo próximo: %s', v_adj_res->>'next_number'));
        ELSE
            INSERT INTO test_results (test_name, status, detail)
            VALUES ('6.1 Avance auditado del contador hacia adelante (5 -> 20)', 'FAIL', 'No se aplicó o no auditó');
        END IF;
    END;

    -- Intento de retroceso (20 -> 10) debe rechazarse estrictamente
    v_err_occurred := false;
    BEGIN
        PERFORM rpc_adjust_numbering_series(v_test_series_id, 10, 'Intento de retroceso');
    EXCEPTION WHEN OTHERS THEN
        v_err_occurred := true;
        v_err_msg := SQLERRM;
    END;

    IF v_err_occurred AND (v_err_msg LIKE '%avanzar el contador%' OR v_err_msg LIKE '%mayor al próximo número actual%') THEN
        INSERT INTO test_results (test_name, status, detail)
        VALUES ('6.2 Rechazo estricto de retroceso de contador (20 -> 10)', 'PASS', v_err_msg);
    ELSE
        INSERT INTO test_results (test_name, status, detail)
        VALUES ('6.2 Rechazo estricto de retroceso de contador (20 -> 10)', 'FAIL', coalesce(v_err_msg, 'No rechazó retroceso'));
    END IF;

    -- Inmutabilidad de auditoría de ajustes (Append-Only)
    v_err_occurred := false;
    BEGIN
        UPDATE document_numbering_series_adjustments SET reason = 'Modificado' WHERE series_id = v_test_series_id;
    EXCEPTION WHEN OTHERS THEN
        v_err_occurred := true;
        v_err_msg := SQLERRM;
    END;

    IF v_err_occurred AND (v_err_msg LIKE '%INMUTABILIDAD%' OR v_err_msg LIKE '%append-only%') THEN
        INSERT INTO test_results (test_name, status, detail)
        VALUES ('6.3 Auditoría de ajustes es estrictamente append-only (Trigger UPDATE bloqueado)', 'PASS', v_err_msg);
    ELSE
        INSERT INTO test_results (test_name, status, detail)
        VALUES ('6.3 Auditoría de ajustes es estrictamente append-only', 'FAIL', coalesce(v_err_msg, 'Permitió modificación'));
    END IF;


    -- --------------------------------------------------------------------------

    -- 7. CIERRE DE ARCHIVOS Y PROTECCIÓN TRAS CONFIRMACIÓN DOCUMENTAL
    -- --------------------------------------------------------------------------
    -- Creamos un comprobante en estado CONFIRMED
    INSERT INTO documents (
        supplier_id, document_type_id, status, numbering_series_id,
        point_of_sale, document_number, human_reference,
        issue_date, total_amount, currency, created_by
    ) VALUES (
        v_supplier_id, v_factura_type_id, 'CONFIRMED', NULL,
        '0001', '00009991', 'FC 0001-00009991',
        '2026-09-01', 1000, 'ARS', v_admin_id
    ) RETURNING id INTO v_confirmed_doc_id;

    -- Intento de agregar un archivo posterior a la confirmación -> Debe rechazarse
    v_err_occurred := false;
    BEGIN
        INSERT INTO document_files (
            storage_bucket, storage_path, file_name, file_size_bytes, mime_type,
            uploaded_by, document_id, file_category
        ) VALUES (
            'supplier-documents', 'test/unauthorized_post_confirm.pdf', 'post.pdf',
            1024, 'application/pdf', v_admin_id, v_confirmed_doc_id, 'ORIGINAL'
        );
    EXCEPTION WHEN OTHERS THEN
        v_err_occurred := true;
        v_err_msg := SQLERRM;
    END;

    IF v_err_occurred AND v_err_msg LIKE '%CONJUNTO_CERRADO%' THEN
        INSERT INTO test_results (test_name, status, detail)
        VALUES ('7.1 Protección de archivos: Prohibido adjuntar archivos a documento CONFIRMED', 'PASS', v_err_msg);
    ELSE
        INSERT INTO test_results (test_name, status, detail)
        VALUES ('7.1 Protección de archivos: Prohibido adjuntar archivos a documento CONFIRMED', 'FAIL', coalesce(v_err_msg, 'Permitió adjuntar archivo'));
    END IF;

    -- --------------------------------------------------------------------------
    -- 8. GENERACIÓN SEGURA DE URLS FIRMADAS (rpc_get_document_file_url)
    -- --------------------------------------------------------------------------
    -- Creamos archivo para un documento borrador
    INSERT INTO document_files (
        storage_bucket, storage_path, file_name, file_size_bytes, mime_type,
        uploaded_by, file_category
    ) VALUES (
        'supplier-documents', 'test/test_signed_url.pdf', 'test.pdf',
        2048, 'application/pdf', v_admin_id, 'ORIGINAL'
    ) RETURNING id INTO v_test_file_id;

    -- Obtenemos autorización de acceso con RPC segura
    v_url_res := rpc_get_document_file_url(v_test_file_id, NULL, 300);

    IF (v_url_res->>'success')::boolean = true AND (v_url_res->>'expires_in_seconds')::int = 300 THEN
        INSERT INTO test_results (test_name, status, detail)
        VALUES ('8.1 Autorización segura de acceso al archivo con TTL 300s', 'PASS',
                format('Expires in: %s s, path: %s', v_url_res->>'expires_in_seconds', v_url_res->>'storage_path'));
    ELSE
        INSERT INTO test_results (test_name, status, detail)
        VALUES ('8.1 Autorización segura de acceso al archivo con TTL 300s', 'FAIL', format('Respuesta: %s', v_url_res));
    END IF;

    -- Validación de función de seguridad Storage RLS fn_can_access_storage_object
    IF fn_can_access_storage_object('test/test_signed_url.pdf') = true THEN
        INSERT INTO test_results (test_name, status, detail)
        VALUES ('8.2 Storage RLS permite lectura a usuario autorizado con documents.view', 'PASS', 'OK');
    ELSE
        INSERT INTO test_results (test_name, status, detail)
        VALUES ('8.2 Storage RLS permite lectura a usuario autorizado con documents.view', 'FAIL', 'Bloqueó usuario con permiso');
    END IF;

    -- Simular intento de acceso sin coincidencia / no autorizado
    IF fn_can_access_storage_object('unauthorized/secret_document.pdf') = false THEN
        INSERT INTO test_results (test_name, status, detail)
        VALUES ('8.3 Storage RLS bloquea acceso a object_path desconocido o no vinculado', 'PASS', 'Bloqueado');
    ELSE
        INSERT INTO test_results (test_name, status, detail)
        VALUES ('8.3 Storage RLS bloquea acceso a object_path desconocido o no vinculado', 'FAIL', 'Permitió acceso no autorizado');
    END IF;


    -- --------------------------------------------------------------------------
    -- 9. DESIMPUTACIÓN RESTAURADA INACTIVA Y USO CONTINUO DE TIPO APL
    -- --------------------------------------------------------------------------
    IF EXISTS (SELECT 1 FROM document_types WHERE id = 11 AND code = 'DESIMPUTACION' AND is_active = false) THEN
        INSERT INTO test_results (test_name, status, detail)
        VALUES ('9.1 Restauración exacta de tipo DESIMPUTACION (id 11 inactivo)', 'PASS', 'id 11 inactivo preservado');
    ELSE
        INSERT INTO test_results (test_name, status, detail)
        VALUES ('9.1 Restauración exacta de tipo DESIMPUTACION (id 11 inactivo)', 'FAIL', 'No se encontró id 11 inactivo');
    END IF;

    -- Verificar que tipo APL sigue activo y configurado con serie
    IF EXISTS (SELECT 1 FROM document_types WHERE id = v_apl_type_id AND code = 'APL' AND is_active = true) THEN
        INSERT INTO test_results (test_name, status, detail)
        VALUES ('9.2 Tipo APL activo para desimputaciones con serie compartida', 'PASS', format('APL id %s activo', v_apl_type_id));
    ELSE
        INSERT INTO test_results (test_name, status, detail)
        VALUES ('9.2 Tipo APL activo para desimputaciones con serie compartida', 'FAIL', 'APL inactivo');
    END IF;

END $$;

SELECT test_id, test_name, status, detail FROM test_results ORDER BY test_id;

ROLLBACK;
