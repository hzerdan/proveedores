-- ==============================================================================
-- Migración 20260909000032: Corregir intake_source en rpc_create_and_confirm_document
-- Corrige violación de restricción chk_documents_intake_source al subir comprobantes
-- ('UPLOAD' no era un valor admitido; se deduce canónicamente 'PDF' o 'IMAGE').
-- ==============================================================================

-- 1. Eliminar firmas previas ambiguas y obsoletas para evitar Colisión de Tipos
DROP FUNCTION IF EXISTS public.rpc_create_and_confirm_document(bigint, smallint, character varying, integer, integer, character varying, date, date, numeric, text, text, text);
DROP FUNCTION IF EXISTS public.rpc_create_and_confirm_document(bigint, smallint, bigint, character varying, integer, bigint, character varying, date, date, numeric, character varying, text, text, text);
DROP FUNCTION IF EXISTS public.rpc_create_and_confirm_document(bigint, smallint, bigint, character varying, integer, bigint, character varying, date, date, numeric, character varying, text, text, text, bigint, bigint, jsonb);
DROP FUNCTION IF EXISTS public.rpc_create_and_confirm_document(bigint, smallint, bigint, character varying, integer, bigint, character varying, date, date, numeric, character varying, text, text, text, bigint, bigint, jsonb, bigint);

-- 2. Definición canónica actualizada
CREATE OR REPLACE FUNCTION public.rpc_create_and_confirm_document(
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
    p_confirmed_payload_diff jsonb DEFAULT NULL,
    p_numbering_series_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id bigint;
    v_doc_type record;
    v_new_doc_id bigint;
    v_signed_amount numeric(15,2);
    v_matched_doc record;
    v_series record;
    v_allocated record;
    v_final_letter varchar;
    v_final_pos integer;
    v_final_num bigint;
    v_final_human_ref varchar;
    v_series_id bigint;
    v_active_series_count integer;
    v_exhausted_series record;
    v_sanitized_diff jsonb;
    v_intake_source varchar;
BEGIN
    v_user_id := current_app_user_id();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Acceso no autorizado o perfil inactivo.';
    END IF;

    IF NOT has_permission('documents.create') THEN
        RAISE EXCEPTION 'Permiso denegado: Se requiere "documents.create".';
    END IF;

    SELECT * INTO v_doc_type FROM public.document_types WHERE id = p_document_type_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tipo de documento ID % no encontrado.', p_document_type_id;
    END IF;

    -- Validar seller_id si fue asignado
    IF p_seller_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.sellers WHERE id = p_seller_id AND is_active = true) THEN
            RAISE EXCEPTION 'El vendedor asignado (ID %) no existe o está inactivo globalmente.', p_seller_id;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.supplier_sellers
            WHERE supplier_id = p_supplier_id
              AND seller_id = p_seller_id
              AND is_active = true
              AND p_issue_date >= valid_from
              AND (valid_to IS NULL OR p_issue_date <= valid_to)
        ) THEN
            RAISE EXCEPTION 'El vendedor no tiene relación vigente con el proveedor para la fecha %.', p_issue_date;
        END IF;
    END IF;

    -- GESTIÓN DE NUMERACIÓN SEGÚN MODO VIGENTE DEL TIPO DOCUMENTAL
    IF v_doc_type.numbering_mode = 'INTERNAL_SEQUENCE' THEN
        v_series_id := p_numbering_series_id;
        
        -- Si no se indicó serie, buscar series activas no agotadas
        IF v_series_id IS NULL THEN
            SELECT count(*), min(id) INTO v_active_series_count, v_series_id
            FROM public.document_numbering_series
            WHERE document_type_id = p_document_type_id 
              AND is_active = true 
              AND is_exhausted = false;

            IF v_active_series_count = 0 THEN
                SELECT * INTO v_exhausted_series
                FROM public.document_numbering_series
                WHERE document_type_id = p_document_type_id AND is_exhausted = true
                LIMIT 1;

                IF FOUND THEN
                    RAISE EXCEPTION 'SERIE_AGOTADA: La serie del punto de venta % alcanzó el último número disponible. Seleccione otra serie activa o solicite a un administrador la creación de una nueva serie.', 
                        lpad(v_exhausted_series.point_of_sale::text, 4, '0');
                ELSE
                    RAISE EXCEPTION 'SIN_SERIE_ACTIVA: El tipo "%" requiere autonumeración pero no posee series activas configuradas.', v_doc_type.name;
                END IF;
            ELSIF v_active_series_count > 1 THEN
                RAISE EXCEPTION 'SELECCION_SERIE_OBLIGATORIA: Existen múltiples series activas para "%". Debe seleccionar una serie.', v_doc_type.name;
            END IF;
        ELSE
            -- Validar la serie seleccionada
            SELECT * INTO v_series FROM public.document_numbering_series WHERE id = v_series_id;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'La serie de numeración ID % no existe.', v_series_id;
            END IF;
            IF v_series.document_type_id <> p_document_type_id THEN
                RAISE EXCEPTION 'La serie ID % no pertenece al tipo documental "%".', v_series_id, v_doc_type.name;
            END IF;
            IF v_series.is_exhausted THEN
                RAISE EXCEPTION 'SERIE_AGOTADA: La serie del punto de venta % alcanzó el último número disponible. Seleccione otra serie activa o solicite a un administrador la creación de una nueva serie.', 
                    lpad(v_series.point_of_sale::text, 4, '0');
            END IF;
            IF NOT v_series.is_active THEN
                RAISE EXCEPTION 'La serie seleccionada (ID %) se encuentra inactiva.', v_series_id;
            END IF;
        END IF;

        -- Asignar número atómicamente con bloqueo de fila
        SELECT * INTO v_allocated 
        FROM public.fn_allocate_internal_document_number(v_series_id, v_doc_type.code, false);

        v_final_pos := v_allocated.point_of_sale;
        v_final_num := v_allocated.assigned_number;
        v_final_letter := v_allocated.letter;
        v_final_human_ref := v_allocated.human_reference;
    ELSE
        -- Modo EXTERNAL
        v_series_id := NULL;
        v_final_pos := p_point_of_sale;
        v_final_num := p_document_number;
        v_final_letter := p_letter;
        v_final_human_ref := p_human_reference;

        IF v_final_pos IS NOT NULL AND v_final_num IS NOT NULL THEN
            SELECT id, human_reference, total_amount INTO v_matched_doc
            FROM public.documents
            WHERE supplier_id = p_supplier_id
              AND document_type_id = p_document_type_id
              AND letter IS NOT DISTINCT FROM v_final_letter
              AND point_of_sale = v_final_pos
              AND document_number = v_final_num
            LIMIT 1;

            IF v_matched_doc.id IS NOT NULL THEN
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
                        RAISE EXCEPTION 'Permiso denegado: Se requiere "documents.duplicate_override" para confirmar un duplicado.';
                    END IF;
                END IF;
            END IF;
        END IF;
    END IF;

    -- Importe firmado según balance_nature
    IF v_doc_type.balance_nature = 'DEBIT' THEN
        v_signed_amount := ABS(p_total_amount);
    ELSIF v_doc_type.balance_nature = 'CREDIT' THEN
        v_signed_amount := -ABS(p_total_amount);
    ELSE
        v_signed_amount := 0.00;
    END IF;

    -- Determinar intake_source canónico según archivo vinculado (compatible con chk_documents_intake_source)
    IF p_file_id IS NOT NULL THEN
        SELECT 
            CASE 
                WHEN mime_type = 'application/pdf' OR file_category ILIKE '%PDF%' OR file_name ILIKE '%.pdf' THEN 'PDF'
                WHEN mime_type ILIKE 'image/%' OR file_category ILIKE '%IMAGE%' OR file_name ILIKE '%.jpg' OR file_name ILIKE '%.jpeg' OR file_name ILIKE '%.png' THEN 'IMAGE'
                ELSE 'PDF'
            END INTO v_intake_source
        FROM public.document_files
        WHERE id = p_file_id;

        IF v_intake_source IS NULL THEN
            v_intake_source := 'PDF';
        END IF;
    ELSE
        v_intake_source := 'MANUAL';
    END IF;

    -- Insertar Cabecera Documental
    INSERT INTO public.documents (
        supplier_id, document_type_id, seller_id, status, letter, point_of_sale,
        document_number, numbering_series_id, human_reference, issue_date, due_date,
        currency, total_amount, concept, notes, intake_source, created_by,
        confirmed_by, confirmed_at
    ) VALUES (
        p_supplier_id, p_document_type_id, p_seller_id, 'CONFIRMED', v_final_letter, v_final_pos,
        v_final_num, v_series_id, v_final_human_ref, p_issue_date, p_due_date,
        p_currency, p_total_amount, p_concept, p_notes, 
        v_intake_source,
        v_user_id, v_user_id, clock_timestamp()
    ) RETURNING id INTO v_new_doc_id;

    -- Insertar Movimiento en Ledger
    IF v_doc_type.affects_account_balance THEN
        INSERT INTO public.account_movements (
            supplier_id, document_id, reference_id, line_number, movement_type,
            movement_date, currency, amount, notes, created_by
        ) VALUES (
            p_supplier_id, v_new_doc_id, v_new_doc_id, 1, 'ORIGIN',
            p_issue_date, p_currency, v_signed_amount, p_concept, v_user_id
        );
    END IF;

    -- Vincular archivo si existe
    IF p_file_id IS NOT NULL THEN
        UPDATE public.document_files 
        SET document_id = v_new_doc_id 
        WHERE id = p_file_id AND document_id IS NULL;
    END IF;

    -- Registrar auditoría si hubo override de duplicado
    IF v_matched_doc.id IS NOT NULL AND p_override_reason IS NOT NULL THEN
        INSERT INTO public.duplicate_override_logs (
            document_id, matched_document_id, reason, authorized_by
        ) VALUES (
            v_new_doc_id, v_matched_doc.id, trim(p_override_reason), v_user_id
        );
    END IF;

    -- Vincular extracción de IA si existió
    IF p_ai_extraction_id IS NOT NULL THEN
        v_sanitized_diff := COALESCE(p_confirmed_payload_diff, '{}'::jsonb);
        UPDATE public.document_ai_extractions
        SET document_id = v_new_doc_id,
            status = 'CONFIRMED',
            confirmed_at = clock_timestamp(),
            confirmed_by = v_user_id,
            confirmed_payload_diff = v_sanitized_diff
        WHERE id = p_ai_extraction_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'document_id', v_new_doc_id,
        'human_reference', v_final_human_ref,
        'assigned_number', v_final_num,
        'point_of_sale', v_final_pos,
        'series_id', v_series_id
    );
END;
$$;

-- 3. Permisos
REVOKE ALL ON FUNCTION public.rpc_create_and_confirm_document(bigint, smallint, bigint, varchar, integer, bigint, varchar, date, date, numeric, varchar, text, text, text, bigint, bigint, jsonb, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_create_and_confirm_document(bigint, smallint, bigint, varchar, integer, bigint, varchar, date, date, numeric, varchar, text, text, text, bigint, bigint, jsonb, bigint) TO authenticated, service_role;
