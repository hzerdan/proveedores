-- ==============================================================================
-- MIGRACIÓN: 20260904000013_enhance_extraction_audit_and_validation.sql
-- PROYECTO: Sistema de Cuentas Corrientes de Proveedores
-- OBJETIVO: Columnas de auditoría separada en document_ai_extractions,
--           función canónica de parseo de fechas y validaciones estrictas
--           server-side para PRINTED, CALCULATED, MANUAL y selected_due_date.
-- ==============================================================================

-- 1. Agregar columnas para auditar separadamente la confirmación en document_ai_extractions
--    sin sobrescribir el created_by original.
ALTER TABLE document_ai_extractions 
  ADD COLUMN IF NOT EXISTS confirmed_by bigint REFERENCES profiles(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

-- 2. Función canónica server-side para parsear fechas YYYY-MM-DD o DD/MM/YYYY con validación de calendario
CREATE OR REPLACE FUNCTION fn_parse_canonical_date(p_str text)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    IF p_str IS NULL OR trim(p_str) = '' THEN
        RETURN NULL;
    END IF;
    p_str := trim(p_str);
    IF p_str ~ '^\d{4}-\d{2}-\d{2}$' THEN
        BEGIN
            RETURN to_date(p_str, 'YYYY-MM-DD');
        EXCEPTION WHEN OTHERS THEN
            RETURN NULL;
        END;
    ELSIF p_str ~ '^\d{2}/\d{2}/\d{4}$' THEN
        BEGIN
            RETURN to_date(p_str, 'DD/MM/YYYY');
        EXCEPTION WHEN OTHERS THEN
            RETURN NULL;
        END;
    END IF;
    RETURN NULL;
END;
$$;

-- 3. Actualización de rpc_create_and_confirm_document con validaciones reforzadas
CREATE OR REPLACE FUNCTION rpc_create_and_confirm_document(
    p_supplier_id bigint,
    p_document_type_id smallint,
    p_seller_id bigint DEFAULT NULL,
    p_letter varchar DEFAULT NULL,
    p_point_of_sale integer DEFAULT NULL,
    p_document_number bigint DEFAULT NULL,
    p_human_reference varchar DEFAULT '',
    p_issue_date date DEFAULT CURRENT_DATE,
    p_due_date date DEFAULT NULL,
    p_total_amount numeric DEFAULT 0,
    p_currency varchar DEFAULT 'ARS',
    p_concept text DEFAULT NULL,
    p_notes text DEFAULT NULL,
    p_override_reason text DEFAULT NULL,
    p_ai_extraction_id bigint DEFAULT NULL,
    p_file_id bigint DEFAULT NULL,
    p_confirmed_payload_diff jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id bigint;
    v_doc_type record;
    v_new_doc_id bigint;
    v_is_seller_valid boolean;
    v_signed_amount numeric(15,2);
    v_matched_doc record;
    v_ext record;
    v_file record;
    v_is_session_owner boolean;
    v_diff jsonb;
    v_due_decision jsonb;
    v_selection_source varchar;
    v_manual_reason text;
    v_sanitized_diff jsonb;
    v_extracted_printed_raw text;
    v_extracted_printed_date date;
    v_client_printed_date date;
    v_effective_printed_date date;
    v_term_days integer;
    v_client_calculated_date date;
    v_expected_calc_date date;
    v_client_selected_date date;
BEGIN
    v_user_id := current_app_user_id();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Acceso no autorizado o perfil inactivo.';
    END IF;

    IF NOT has_permission('documents.create') THEN
        RAISE EXCEPTION 'Permiso denegado: Se requiere "documents.create".';
    END IF;

    SELECT * INTO v_doc_type FROM document_types WHERE id = p_document_type_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tipo de documento ID % no encontrado.', p_document_type_id;
    END IF;

    -- Validar seller_id si fue asignado
    IF p_seller_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM sellers WHERE id = p_seller_id AND is_active = true) THEN
            RAISE EXCEPTION 'El vendedor asignado (ID %) no existe o está inactivo globalmente.', p_seller_id;
        END IF;

        SELECT EXISTS (
            SELECT 1 
            FROM supplier_sellers ss
            WHERE ss.supplier_id = p_supplier_id
              AND ss.seller_id = p_seller_id
              AND ss.is_active = true
              AND ss.valid_from <= p_issue_date
              AND (ss.valid_to IS NULL OR ss.valid_to >= p_issue_date)
        ) INTO v_is_seller_valid;

        IF NOT v_is_seller_valid THEN
            RAISE EXCEPTION 'El vendedor ID % no posee una relación activa vigente con el proveedor ID % para la fecha del comprobante (%).',
                p_seller_id, p_supplier_id, p_issue_date;
        END IF;
    END IF;

    -- Validaciones estrictas de IA y Archivo Documental (si se provee vinculación)
    IF p_ai_extraction_id IS NOT NULL OR p_file_id IS NOT NULL THEN
        IF p_ai_extraction_id IS NULL OR p_file_id IS NULL THEN
            RAISE EXCEPTION 'Para vincular una extracción de IA deben suministrarse conjuntamente p_ai_extraction_id y p_file_id.';
        END IF;

        -- 1. Validar extracción
        SELECT * INTO v_ext 
        FROM document_ai_extractions 
        WHERE id = p_ai_extraction_id 
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Extracción de IA ID % no encontrada.', p_ai_extraction_id;
        END IF;

        IF v_ext.file_id != p_file_id THEN
            RAISE EXCEPTION 'Inconsistencia de vinculación: La extracción ID % pertenece al archivo ID %, no al archivo ID %.',
                p_ai_extraction_id, v_ext.file_id, p_file_id;
        END IF;

        IF v_ext.document_id IS NOT NULL THEN
            RAISE EXCEPTION 'Reutilización rechazada: La extracción de IA ID % ya se encuentra asociada al comprobante ID %.',
                p_ai_extraction_id, v_ext.document_id;
        END IF;

        IF v_ext.status NOT IN ('SUCCESS', 'PARTIAL') THEN
            RAISE EXCEPTION 'Estado no admisible: La extracción ID % tiene estado "%". Solo se admite SUCCESS o PARTIAL.',
                p_ai_extraction_id, v_ext.status;
        END IF;

        -- 2. Validar archivo
        SELECT * INTO v_file 
        FROM document_files 
        WHERE id = p_file_id 
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Archivo documental ID % no encontrado.', p_file_id;
        END IF;

        IF v_file.document_id IS NOT NULL THEN
            RAISE EXCEPTION 'Reutilización rechazada: El archivo ID % ya está vinculado al comprobante ID %.',
                p_file_id, v_file.document_id;
        END IF;

        -- 3. Validar autorización de usuario o sesión
        SELECT EXISTS (
            SELECT 1 FROM document_upload_sessions
            WHERE file_id = p_file_id AND created_by = v_user_id
        ) INTO v_is_session_owner;

        IF (v_file.uploaded_by != v_user_id AND NOT v_is_session_owner AND NOT has_permission('documents.ai_review'))
           OR (v_ext.created_by IS NOT NULL AND v_ext.created_by != v_user_id AND NOT v_is_session_owner AND NOT has_permission('documents.ai_review')) THEN
            RAISE EXCEPTION 'Autorización denegada: El usuario actual no es autor del archivo/extracción ni posee permiso "documents.ai_review".';
        END IF;

        -- 4. Validar y sanear confirmed_payload_diff
        v_diff := COALESCE(p_confirmed_payload_diff, '{}'::jsonb);
        v_due_decision := v_diff->'due_date_decision';
        v_selection_source := COALESCE(v_due_decision->>'selection_source', 'MANUAL');

        IF v_selection_source NOT IN ('PRINTED', 'CALCULATED', 'MANUAL') THEN
            RAISE EXCEPTION 'Origen de selección de vencimiento inválido: "%" (admitidos: PRINTED, CALCULATED, MANUAL).', v_selection_source;
        END IF;

        -- Extraer fechas impresas de la extracción (compatible con Schema v2.0 y v1.0)
        v_extracted_printed_raw := COALESCE(
            v_ext.extracted_raw_payload->'document'->>'printed_due_date',
            v_ext.extracted_raw_payload->'document'->>'due_date'
        );
        v_extracted_printed_date := fn_parse_canonical_date(v_extracted_printed_raw);
        v_client_printed_date := fn_parse_canonical_date(v_due_decision->>'printed_due_date');
        v_effective_printed_date := COALESCE(v_extracted_printed_date, v_client_printed_date);

        -- Determinar plazo y fecha calculada esperada
        v_term_days := NULL;
        IF (v_ext.extracted_raw_payload->'document'->>'payment_term_days') IS NOT NULL THEN
            BEGIN
                v_term_days := (v_ext.extracted_raw_payload->'document'->>'payment_term_days')::integer;
            EXCEPTION WHEN OTHERS THEN
                v_term_days := NULL;
            END;
        END IF;

        v_client_calculated_date := fn_parse_canonical_date(v_due_decision->>'calculated_due_date');
        IF v_term_days IS NOT NULL AND v_term_days >= 0 AND p_issue_date IS NOT NULL THEN
            v_expected_calc_date := p_issue_date + (v_term_days || ' days')::interval;
        ELSE
            v_expected_calc_date := v_client_calculated_date;
        END IF;

        -- Comprobaciones estrictas según selection_source
        IF v_selection_source = 'PRINTED' THEN
            IF v_effective_printed_date IS NULL THEN
                RAISE EXCEPTION 'No es posible seleccionar origen PRINTED: el comprobante no posee fecha de vencimiento impresa extraída.';
            END IF;
            IF p_due_date IS DISTINCT FROM v_effective_printed_date THEN
                RAISE EXCEPTION 'La fecha de vencimiento seleccionada (%) no coincide con la fecha impresa extraída (%).',
                    p_due_date, v_effective_printed_date;
            END IF;
        ELSIF v_selection_source = 'CALCULATED' THEN
            IF v_expected_calc_date IS NULL THEN
                RAISE EXCEPTION 'No es posible seleccionar origen CALCULATED: no se determinó un plazo de pago determinístico.';
            END IF;
            IF p_due_date IS DISTINCT FROM v_expected_calc_date THEN
                RAISE EXCEPTION 'La fecha de vencimiento seleccionada (%) no coincide con la fecha calculada determinísticamente (%).',
                    p_due_date, v_expected_calc_date;
            END IF;
        ELSIF v_selection_source = 'MANUAL' THEN
            v_manual_reason := trim(COALESCE(v_due_decision->>'manual_reason', ''));
            IF v_manual_reason = '' OR length(v_manual_reason) < 3 THEN
                RAISE EXCEPTION 'La selección manual de la fecha de vencimiento exige indicar un motivo explicativo de al menos 3 caracteres.';
            END IF;
        END IF;

        -- Validar que selected_due_date en payload coincida con documents.due_date (p_due_date)
        v_client_selected_date := fn_parse_canonical_date(v_due_decision->>'selected_due_date');
        IF v_client_selected_date IS NOT NULL AND v_client_selected_date IS DISTINCT FROM p_due_date THEN
            RAISE EXCEPTION 'Inconsistencia: selected_due_date (%) no coincide con la fecha de vencimiento del documento (%).',
                v_client_selected_date, p_due_date;
        END IF;

        -- Construir estructura saneada y sellada en backend, ignorando campos reservados enviados por el cliente
        v_sanitized_diff := jsonb_build_object(
            'due_date_decision', jsonb_build_object(
                'selection_source', v_selection_source,
                'selected_due_date', p_due_date,
                'printed_due_date', v_effective_printed_date,
                'calculated_due_date', v_expected_calc_date,
                'payment_condition_text', v_due_decision->>'payment_condition_text',
                'manual_reason', NULLIF(v_manual_reason, '')
            ),
            'field_modifications', COALESCE(v_diff->'field_modifications', '{}'::jsonb),
            'server_confirmed_by', v_user_id,
            'server_confirmed_at', clock_timestamp()
        );
    END IF;

    -- Detección de duplicados
    IF p_letter IS NOT NULL AND p_point_of_sale IS NOT NULL AND p_document_number IS NOT NULL THEN
        SELECT id, human_reference, issue_date, total_amount
        INTO v_matched_doc
        FROM documents
        WHERE supplier_id = p_supplier_id
          AND document_type_id = p_document_type_id
          AND letter = p_letter
          AND point_of_sale = p_point_of_sale
          AND document_number = p_document_number
          AND status = 'CONFIRMED'
        LIMIT 1;

        IF FOUND THEN
            IF p_override_reason IS NULL OR trim(p_override_reason) = '' THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'is_duplicate', true,
                    'matched_document_id', v_matched_doc.id,
                    'matched_human_reference', v_matched_doc.human_reference,
                    'message', format('DUPLICADO DETECTADO: Ya existe el comprobante %s (ID %s).', v_matched_doc.human_reference, v_matched_doc.id)
                );
            ELSE
                IF NOT has_permission('documents.duplicate_override') THEN
                    RAISE EXCEPTION 'Permiso denegado: Se requiere autorización para registrar comprobantes duplicados.';
                END IF;
            END IF;
        END IF;
    END IF;

    -- Insertar Cabecera en documents
    INSERT INTO documents (
        supplier_id, seller_id, document_type_id, status, letter, point_of_sale, document_number,
        human_reference, issue_date, due_date, currency, total_amount, concept, notes,
        created_by, confirmed_by, confirmed_at
    ) VALUES (
        p_supplier_id, p_seller_id, p_document_type_id, 'CONFIRMED', p_letter, p_point_of_sale, p_document_number,
        p_human_reference, p_issue_date, p_due_date, p_currency, p_total_amount, p_concept, p_notes,
        v_user_id, v_user_id, clock_timestamp()
    ) RETURNING id INTO v_new_doc_id;

    -- Si hubo override de duplicado, registrar auditoría
    IF v_matched_doc.id IS NOT NULL AND p_override_reason IS NOT NULL THEN
        INSERT INTO duplicate_override_logs (document_id, matched_document_id, reason, authorized_by)
        VALUES (v_new_doc_id, v_matched_doc.id, trim(p_override_reason), v_user_id);
    END IF;

    -- Crear renglón ORIGIN en account_movements si afecta saldo
    IF v_doc_type.affects_account_balance THEN
        v_signed_amount := CASE WHEN v_doc_type.balance_nature = 'DEBIT' THEN p_total_amount ELSE -p_total_amount END;
        INSERT INTO account_movements (
            supplier_id, document_id, reference_id, line_number, movement_type, movement_date, currency, amount, notes, created_by
        ) VALUES (
            p_supplier_id, v_new_doc_id, v_new_doc_id, 1, 'ORIGIN', p_issue_date, p_currency, v_signed_amount, p_concept, v_user_id
        );
    END IF;

    -- Vincular de forma atómica la extracción y el archivo (auditando confirmed_by sin sobrescribir created_by original)
    IF p_ai_extraction_id IS NOT NULL THEN
        UPDATE document_ai_extractions
        SET document_id = v_new_doc_id,
            confirmed_by = v_user_id,
            confirmed_at = clock_timestamp(),
            confirmed_payload_diff = v_sanitized_diff
        WHERE id = p_ai_extraction_id;

        UPDATE document_files
        SET document_id = v_new_doc_id
        WHERE id = p_file_id;

        UPDATE document_upload_sessions
        SET document_id = v_new_doc_id,
            status = 'COMPLETED',
            completed_at = clock_timestamp()
        WHERE file_id = p_file_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'document_id', v_new_doc_id,
        'human_reference', p_human_reference,
        'seller_id', p_seller_id,
        'status', 'CONFIRMED',
        'ai_extraction_id', p_ai_extraction_id,
        'file_id', p_file_id,
        'confirmed_by', v_user_id,
        'message', 'Documento creado y confirmado exitosamente con vinculación atómica de auditoría.'
    );
END;
$$;
