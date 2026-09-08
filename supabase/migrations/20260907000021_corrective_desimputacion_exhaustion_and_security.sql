-- ============================================================================
-- MIGRACIÓN: 20260907000021_corrective_desimputacion_exhaustion_and_security.sql
-- PROYECTO: Sistema de Cuentas Corrientes de Proveedores
-- OBJETIVOS:
--   1. Restaurar el tipo documental 'DESIMPUTACION' (id=11, inactivo)
--   2. Revocar permisos de anon sobre fn_allocate_internal_document_number
--   3. Incorporar columnas explícitas is_exhausted y exhausted_at en series
--   4. Actualizar asignación atómica con marcado de agotamiento en 99999999
--   5. Adaptar RPCs para excluir series agotadas y emitir mensaje canónico
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. RESTAURAR TIPO 'DESIMPUTACION' (id = 11, is_active = false)
-- ----------------------------------------------------------------------------
INSERT INTO public.document_types (
    id, code, name, description, balance_nature, affects_account_balance,
    can_be_source_application, can_be_target_application, requires_due_date,
    is_system_internal, is_active, numbering_mode
) OVERRIDING SYSTEM VALUE VALUES (
    11, 'DESIMPUTACION', 'Documento de Desimputación',
    'Documento de control interno para revertir aplicaciones sin alterar saldo global.',
    'NEUTRAL', false, false, false, false, true, false, 'EXTERNAL'
)
ON CONFLICT (id) DO UPDATE SET
    code = EXCLUDED.code,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    balance_nature = EXCLUDED.balance_nature,
    affects_account_balance = EXCLUDED.affects_account_balance,
    can_be_source_application = EXCLUDED.can_be_source_application,
    can_be_target_application = EXCLUDED.can_be_target_application,
    requires_due_date = EXCLUDED.requires_due_date,
    is_system_internal = EXCLUDED.is_system_internal,
    is_active = false,
    numbering_mode = 'EXTERNAL';

-- ----------------------------------------------------------------------------
-- 2. REVOCAR ACCESO ANÓNIMO AL ASIGNADOR DE NUMERACIÓN
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.fn_allocate_internal_document_number(bigint, varchar, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.fn_allocate_internal_document_number(bigint, varchar, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_allocate_internal_document_number(bigint, varchar, boolean) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. COLUMNAS EXPLÍCITAS is_exhausted Y exhausted_at EN SERIES
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'document_numbering_series' AND column_name = 'is_exhausted'
    ) THEN
        ALTER TABLE public.document_numbering_series 
        ADD COLUMN is_exhausted boolean NOT NULL DEFAULT false;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'document_numbering_series' AND column_name = 'exhausted_at'
    ) THEN
        ALTER TABLE public.document_numbering_series 
        ADD COLUMN exhausted_at timestamptz NULL;
    END IF;
END $$;

-- Actualizar series existentes que hayan alcanzado el tope
UPDATE public.document_numbering_series
SET is_exhausted = true,
    exhausted_at = COALESCE(exhausted_at, clock_timestamp())
WHERE next_number > 99999999 AND is_exhausted = false;

-- ----------------------------------------------------------------------------
-- 4. ACTUALIZACIÓN ATÓMICA DE fn_allocate_internal_document_number
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_allocate_internal_document_number(
    p_series_id bigint,
    p_doc_type_code varchar,
    p_is_reversal boolean DEFAULT false
)
RETURNS TABLE (
    assigned_number bigint,
    point_of_sale integer,
    letter varchar,
    human_reference varchar
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_series record;
    v_num bigint;
    v_ref varchar(100);
BEGIN
    SELECT * INTO v_series
    FROM public.document_numbering_series
    WHERE id = p_series_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La serie de numeración ID % no existe.', p_series_id;
    END IF;

    IF v_series.is_exhausted OR v_series.next_number > 99999999 THEN
        IF NOT v_series.is_exhausted THEN
            UPDATE public.document_numbering_series
            SET is_exhausted = true,
                exhausted_at = clock_timestamp(),
                updated_at = clock_timestamp()
            WHERE id = v_series.id;
        END IF;

        RAISE EXCEPTION 'SERIE_AGOTADA: La serie del punto de venta % alcanzó el último número disponible. Seleccione otra serie activa o solicite a un administrador la creación de una nueva serie.', 
            lpad(v_series.point_of_sale::text, 4, '0');
    END IF;

    IF NOT v_series.is_active THEN
        RAISE EXCEPTION 'La serie de numeración % (% - POS %) se encuentra inactiva.', 
            v_series.id, p_doc_type_code, v_series.point_of_sale;
    END IF;

    v_num := v_series.next_number;

    -- Si este es el último comprobante válido (99999999):
    -- Se emite normalmente en esta transacción, pero la serie queda marcada atómicamente como agotada
    IF v_num = 99999999 THEN
        UPDATE public.document_numbering_series
        SET next_number = 100000000,
            is_exhausted = true,
            exhausted_at = clock_timestamp(),
            updated_at = clock_timestamp()
        WHERE id = v_series.id;
    ELSE
        UPDATE public.document_numbering_series
        SET next_number = v_series.next_number + 1,
            updated_at = clock_timestamp()
        WHERE id = v_series.id;
    END IF;

    -- Construir human_reference definitivo
    IF p_is_reversal THEN
        v_ref := format('APL-REV %s-%s', lpad(v_series.point_of_sale::text, 4, '0'), lpad(v_num::text, 8, '0'));
    ELSIF p_doc_type_code = 'ORDEN_PAGO' THEN
        v_ref := format('OP %s-%s', lpad(v_series.point_of_sale::text, 4, '0'), lpad(v_num::text, 8, '0'));
    ELSIF p_doc_type_code = 'APL' THEN
        v_ref := format('APL %s-%s', lpad(v_series.point_of_sale::text, 4, '0'), lpad(v_num::text, 8, '0'));
    ELSIF v_series.letter IS NOT NULL AND trim(v_series.letter) <> '' THEN
        v_ref := format('%s %s %s-%s', p_doc_type_code, v_series.letter, lpad(v_series.point_of_sale::text, 4, '0'), lpad(v_num::text, 8, '0'));
    ELSE
        v_ref := format('%s %s-%s', p_doc_type_code, lpad(v_series.point_of_sale::text, 4, '0'), lpad(v_num::text, 8, '0'));
    END IF;

    RETURN QUERY SELECT v_num, v_series.point_of_sale, v_series.letter, v_ref;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. ACTUALIZAR RPCs DE CONFIRMACIÓN CON VALIDACIÓN DE AGOTAMIENTO
-- ----------------------------------------------------------------------------

-- A. rpc_create_and_confirm_document
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
        CASE WHEN p_file_id IS NOT NULL THEN 'UPLOAD' ELSE 'MANUAL' END,
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

-- B. rpc_create_and_confirm_op
CREATE OR REPLACE FUNCTION public.rpc_create_and_confirm_op(
    p_supplier_id bigint,
    p_document_type_id smallint,
    p_point_of_sale integer DEFAULT NULL,
    p_document_number integer DEFAULT NULL,
    p_human_reference character varying DEFAULT ''::character varying,
    p_issue_date date DEFAULT CURRENT_DATE,
    p_total_amount numeric DEFAULT 0,
    p_currency character varying DEFAULT 'ARS'::character varying,
    p_concept text DEFAULT NULL::text,
    p_applications jsonb DEFAULT '[]'::jsonb,
    p_override_reason text DEFAULT NULL::text,
    p_numbering_series_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_user_id bigint;
    v_doc_type record;
    v_op_doc_id bigint;
    v_line_number integer := 1;
    v_total_applied numeric(15,2) := 0;
    v_remainder numeric(15,2);
    v_item jsonb;
    v_ref_id bigint;
    v_app_amount numeric(15,2);
    v_ref_doc record;
    v_current_debt numeric(15,2);
    v_matched_doc record;
    v_series record;
    v_allocated record;
    v_final_pos integer;
    v_final_num bigint;
    v_final_human_ref varchar;
    v_series_id bigint;
    v_active_series_count integer;
    v_exhausted_series record;
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

    IF v_doc_type.code <> 'ORDEN_PAGO' THEN
        RAISE EXCEPTION 'Este procedimiento es exclusivo para Órdenes de Pago.';
    END IF;

    IF p_total_amount <= 0 THEN
        RAISE EXCEPTION 'El importe total de la Orden de Pago debe ser mayor a 0.';
    END IF;

    -- GESTIÓN DE NUMERACIÓN
    IF v_doc_type.numbering_mode = 'INTERNAL_SEQUENCE' THEN
        v_series_id := p_numbering_series_id;
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
                    RAISE EXCEPTION 'SIN_SERIE_ACTIVA: No existen series activas configuradas para Órdenes de Pago.';
                END IF;
            ELSIF v_active_series_count > 1 THEN
                RAISE EXCEPTION 'SELECCION_SERIE_OBLIGATORIA: Existen múltiples series activas para Orden de Pago. Debe seleccionar una.';
            END IF;
        ELSE
            SELECT * INTO v_series FROM public.document_numbering_series WHERE id = v_series_id;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'La serie de numeración ID % no existe.', v_series_id;
            END IF;
            IF v_series.document_type_id <> p_document_type_id THEN
                RAISE EXCEPTION 'La serie ID % no pertenece a Orden de Pago.', v_series_id;
            END IF;
            IF v_series.is_exhausted THEN
                RAISE EXCEPTION 'SERIE_AGOTADA: La serie del punto de venta % alcanzó el último número disponible. Seleccione otra serie activa o solicite a un administrador la creación de una nueva serie.', 
                    lpad(v_series.point_of_sale::text, 4, '0');
            END IF;
            IF NOT v_series.is_active THEN
                RAISE EXCEPTION 'La serie seleccionada (ID %) se encuentra inactiva.', v_series_id;
            END IF;
        END IF;

        SELECT * INTO v_allocated 
        FROM public.fn_allocate_internal_document_number(v_series_id, 'ORDEN_PAGO', false);

        v_final_pos := v_allocated.point_of_sale;
        v_final_num := v_allocated.assigned_number;
        v_final_human_ref := v_allocated.human_reference;
    ELSE
        v_series_id := NULL;
        v_final_pos := p_point_of_sale;
        v_final_num := p_document_number;
        v_final_human_ref := p_human_reference;

        IF v_final_pos IS NOT NULL AND v_final_num IS NOT NULL THEN
            SELECT id, human_reference INTO v_matched_doc
            FROM public.documents
            WHERE supplier_id = p_supplier_id
              AND document_type_id = p_document_type_id
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
                        'message', format('DUPLICADO DETECTADO: Ya existe la Orden de Pago %s (ID %s).', v_matched_doc.human_reference, v_matched_doc.id)
                    );
                ELSE
                    IF NOT has_permission('documents.duplicate_override') THEN
                        RAISE EXCEPTION 'Permiso denegado: Se requiere "documents.duplicate_override".';
                    END IF;
                END IF;
            END IF;
        END IF;
    END IF;

    -- Crear Cabecera de OP
    INSERT INTO public.documents (
        supplier_id, document_type_id, seller_id, status, point_of_sale,
        document_number, numbering_series_id, human_reference, issue_date, currency, 
        total_amount, concept, notes, intake_source, created_by, confirmed_by, confirmed_at
    ) VALUES (
        p_supplier_id, p_document_type_id, NULL, 'CONFIRMED', v_final_pos,
        v_final_num, v_series_id, v_final_human_ref, p_issue_date, p_currency,
        p_total_amount, p_concept, p_concept, 'MANUAL', v_user_id, v_user_id, clock_timestamp()
    ) RETURNING id INTO v_op_doc_id;

    -- Procesar imputaciones directas
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_applications)
    LOOP
        v_ref_id := (v_item->>'target_document_id')::bigint;
        v_app_amount := (v_item->>'amount')::numeric;

        IF v_app_amount > 0 THEN
            SELECT * INTO v_ref_doc FROM public.documents WHERE id = v_ref_id FOR UPDATE;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Documento de destino ID % no existe.', v_ref_id;
            END IF;

            SELECT COALESCE(SUM(amount), 0) INTO v_current_debt
            FROM public.account_movements
            WHERE reference_id = v_ref_id AND currency = p_currency;

            IF v_app_amount > v_current_debt THEN
                RAISE EXCEPTION 'El importe a aplicar (%s) excede la deuda actual (%s) de %s.', 
                    v_app_amount, v_current_debt, v_ref_doc.human_reference;
            END IF;

            INSERT INTO public.account_movements (
                supplier_id, document_id, reference_id, line_number, movement_type,
                movement_date, currency, amount, notes, created_by
            ) VALUES (
                p_supplier_id, v_op_doc_id, v_ref_id, v_line_number, 'IMPUTATION',
                p_issue_date, p_currency, -v_app_amount, format('Imputación OP %s a %s', v_final_human_ref, v_ref_doc.human_reference), v_user_id
            );

            v_line_number := v_line_number + 1;
            v_total_applied := v_total_applied + v_app_amount;
        END IF;
    END LOOP;

    IF v_total_applied > p_total_amount THEN
        RAISE EXCEPTION 'El total aplicado (%s) no puede superar el total de la OP (%s).', v_total_applied, p_total_amount;
    END IF;

    -- Remanente no aplicado (Crédito Libre)
    v_remainder := p_total_amount - v_total_applied;
    IF v_remainder > 0 THEN
        INSERT INTO public.account_movements (
            supplier_id, document_id, reference_id, line_number, movement_type,
            movement_date, currency, amount, notes, created_by
        ) VALUES (
            p_supplier_id, v_op_doc_id, v_op_doc_id, v_line_number, 'REMAINDER',
            p_issue_date, p_currency, -v_remainder, format('Saldo libre disponible de OP %s', v_final_human_ref), v_user_id
        );
    END IF;

    -- Registrar auditoría si hubo override
    IF v_matched_doc.id IS NOT NULL AND p_override_reason IS NOT NULL THEN
        INSERT INTO public.duplicate_override_logs (
            document_id, matched_document_id, reason, authorized_by
        ) VALUES (
            v_op_doc_id, v_matched_doc.id, trim(p_override_reason), v_user_id
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'document_id', v_op_doc_id,
        'human_reference', v_final_human_ref,
        'assigned_number', v_final_num,
        'point_of_sale', v_final_pos,
        'series_id', v_series_id
    );
END;
$function$;

-- C. rpc_apply_existing_balance
CREATE OR REPLACE FUNCTION public.rpc_apply_existing_balance(
    p_source_document_id bigint,
    p_target_applications jsonb,
    p_notes text DEFAULT NULL,
    p_numbering_series_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_user_id bigint;
    v_source record;
    v_apl_type record;
    v_apl_doc_id bigint;
    v_line_no integer := 1;
    v_app jsonb;
    v_target_id bigint;
    v_amount numeric(15,2);
    v_total_to_apply numeric(15,2) := 0;
    v_series_id bigint;
    v_series record;
    v_allocated record;
    v_final_pos integer := NULL;
    v_final_num bigint := NULL;
    v_human_ref varchar(100);
    v_active_series_count integer;
    v_exhausted_series record;
BEGIN
    v_user_id := current_app_user_id();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Acceso no autorizado o perfil inactivo.';
    END IF;

    IF NOT has_permission('applications.create') THEN
        RAISE EXCEPTION 'Permiso denegado: Se requiere "applications.create".';
    END IF;

    -- Obtener y bloquear documento origen
    SELECT * INTO v_source FROM public.documents WHERE id = p_source_document_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Documento origen ID % no encontrado.', p_source_document_id;
    END IF;

    SELECT * INTO v_apl_type FROM public.document_types WHERE code = 'APL' LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tipo de documento APL no encontrado.';
    END IF;

    -- Numeración de APL
    IF v_apl_type.numbering_mode = 'INTERNAL_SEQUENCE' THEN
        v_series_id := p_numbering_series_id;
        IF v_series_id IS NULL THEN
            SELECT count(*), min(id) INTO v_active_series_count, v_series_id
            FROM public.document_numbering_series
            WHERE document_type_id = v_apl_type.id 
              AND is_active = true 
              AND is_exhausted = false;

            IF v_active_series_count = 0 THEN
                SELECT * INTO v_exhausted_series
                FROM public.document_numbering_series
                WHERE document_type_id = v_apl_type.id AND is_exhausted = true
                LIMIT 1;

                IF FOUND THEN
                    RAISE EXCEPTION 'SERIE_AGOTADA: La serie del punto de venta % alcanzó el último número disponible. Seleccione otra serie activa o solicite a un administrador la creación de una nueva serie.', 
                        lpad(v_exhausted_series.point_of_sale::text, 4, '0');
                ELSE
                    RAISE EXCEPTION 'SIN_SERIE_ACTIVA: No existen series activas configuradas para documentos APL.';
                END IF;
            ELSIF v_active_series_count > 1 THEN
                RAISE EXCEPTION 'SELECCION_SERIE_OBLIGATORIA: Existen múltiples series activas para APL. Debe seleccionar una.';
            END IF;
        ELSE
            SELECT * INTO v_series FROM public.document_numbering_series WHERE id = v_series_id;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'La serie seleccionada (ID %) no existe.', v_series_id;
            END IF;
            IF v_series.document_type_id <> v_apl_type.id THEN
                RAISE EXCEPTION 'La serie seleccionada no pertenece al tipo APL.';
            END IF;
            IF v_series.is_exhausted THEN
                RAISE EXCEPTION 'SERIE_AGOTADA: La serie del punto de venta % alcanzó el último número disponible. Seleccione otra serie activa o solicite a un administrador la creación de una nueva serie.', 
                    lpad(v_series.point_of_sale::text, 4, '0');
            END IF;
            IF NOT v_series.is_active THEN
                RAISE EXCEPTION 'La serie seleccionada (ID %) se encuentra inactiva.', v_series_id;
            END IF;
        END IF;

        SELECT * INTO v_allocated 
        FROM public.fn_allocate_internal_document_number(v_series_id, 'APL', false);

        v_final_pos := v_allocated.point_of_sale;
        v_final_num := v_allocated.assigned_number;
        v_human_ref := v_allocated.human_reference;
    ELSE
        v_series_id := NULL;
        v_human_ref := format('APL-%s-%s', v_source.id, to_char(clock_timestamp(), 'HH24MISS'));
    END IF;

    -- Calcular total a aplicar
    FOR v_app IN SELECT * FROM jsonb_array_elements(p_target_applications)
    LOOP
        v_amount := (v_app->>'applied_amount')::numeric;
        IF v_amount > 0 THEN
            v_total_to_apply := v_total_to_apply + v_amount;
        END IF;
    END LOOP;

    IF v_total_to_apply <= 0 THEN
        RAISE EXCEPTION 'Debe aplicar al menos un importe mayor a 0.';
    END IF;

    -- 1. Crear documento APL
    INSERT INTO public.documents (
        supplier_id, seller_id, document_type_id, status, point_of_sale, document_number,
        numbering_series_id, human_reference, issue_date, currency, total_amount, 
        concept, notes, intake_source, created_by, confirmed_by, confirmed_at
    ) VALUES (
        v_source.supplier_id, NULL, v_apl_type.id, 'CONFIRMED', v_final_pos, v_final_num,
        v_series_id, v_human_ref, CURRENT_DATE, v_source.currency, 0.00, 
        format('Aplicación de saldo de %s', v_source.human_reference), p_notes,
        'MANUAL', v_user_id, v_user_id, clock_timestamp()
    ) RETURNING id INTO v_apl_doc_id;

    -- 2. Renglón 1: +total_to_apply a la referencia origen
    INSERT INTO public.account_movements (
        supplier_id, document_id, reference_id, line_number, movement_type, movement_date, currency, amount, notes, created_by
    ) VALUES (
        v_source.supplier_id, v_apl_doc_id, v_source.id, v_line_no, 'APL_TRANSFER', CURRENT_DATE, v_source.currency, v_total_to_apply, format('Consume crédito de %s', v_source.human_reference), v_user_id
    );
    v_line_no := v_line_no + 1;

    -- 3. Renglones N: -monto a cada referencia destino
    FOR v_app IN SELECT * FROM jsonb_array_elements(p_target_applications)
    LOOP
        v_target_id := (v_app->>'target_document_id')::bigint;
        v_amount := (v_app->>'applied_amount')::numeric;

        IF v_amount > 0 THEN
            INSERT INTO public.account_movements (
                supplier_id, document_id, reference_id, line_number, movement_type, movement_date, currency, amount, notes, created_by
            ) VALUES (
                v_source.supplier_id, v_apl_doc_id, v_target_id, v_line_no, 'APL_TRANSFER', CURRENT_DATE, v_source.currency, -v_amount, format('Aplica crédito de %s', v_source.human_reference), v_user_id
            );
            v_line_no := v_line_no + 1;
        END IF;
    END LOOP;

    -- Validar suma cero del documento APL
    IF (SELECT SUM(amount) FROM public.account_movements WHERE document_id = v_apl_doc_id) <> 0.00 THEN
        RAISE EXCEPTION 'Error de Integridad: La suma neta de los movimientos del APL debe ser exactamente 0.00.';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'document_id', v_apl_doc_id,
        'human_reference', v_human_ref,
        'numbering_series_id', v_series_id,
        'total_applied', v_total_to_apply,
        'message', 'Aplicación APL registrada exitosamente con suma cero.'
    );
END;
$function$;

-- D. rpc_reverse_imputation
CREATE OR REPLACE FUNCTION public.rpc_reverse_imputation(
    p_movement_id bigint, 
    p_reason text,
    p_numbering_series_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id bigint;
    v_mov record;
    v_apl_type record;
    v_apl_id bigint;
    v_apl_ref varchar(100);
    v_reverse_amount numeric(15,2);
    v_series_id bigint;
    v_series record;
    v_allocated record;
    v_final_pos integer := NULL;
    v_final_num bigint := NULL;
    v_active_series_count integer;
    v_exhausted_series record;
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

    SELECT * INTO v_mov FROM public.account_movements WHERE id = p_movement_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Movimiento ID % no encontrado.', p_movement_id;
    END IF;

    IF v_mov.movement_type NOT IN ('IMPUTATION', 'APL_TRANSFER') OR v_mov.amount >= 0 THEN
        RAISE EXCEPTION 'Solo pueden revertirse renglones de imputación negativa hacia facturas.';
    END IF;

    v_reverse_amount := ABS(v_mov.amount);

    -- Las desimputaciones continúan siendo documentos del tipo APL
    SELECT * INTO v_apl_type FROM public.document_types WHERE code = 'APL';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tipo de documento APL no encontrado.';
    END IF;

    -- Desimputación usa la misma serie correlativa activa de APL
    IF v_apl_type.numbering_mode = 'INTERNAL_SEQUENCE' THEN
        v_series_id := p_numbering_series_id;
        IF v_series_id IS NULL THEN
            SELECT count(*), min(id) INTO v_active_series_count, v_series_id
            FROM public.document_numbering_series
            WHERE document_type_id = v_apl_type.id 
              AND is_active = true 
              AND is_exhausted = false;

            IF v_active_series_count = 0 THEN
                SELECT * INTO v_exhausted_series
                FROM public.document_numbering_series
                WHERE document_type_id = v_apl_type.id AND is_exhausted = true
                LIMIT 1;

                IF FOUND THEN
                    RAISE EXCEPTION 'SERIE_AGOTADA: La serie del punto de venta % alcanzó el último número disponible. Seleccione otra serie activa o solicite a un administrador la creación de una nueva serie.', 
                        lpad(v_exhausted_series.point_of_sale::text, 4, '0');
                ELSE
                    RAISE EXCEPTION 'SIN_SERIE_ACTIVA: No existen series activas configuradas para APL/Desimputaciones.';
                END IF;
            ELSIF v_active_series_count > 1 THEN
                RAISE EXCEPTION 'SELECCION_SERIE_OBLIGATORIA: Existen múltiples series activas para APL. Debe seleccionar una para la desimputación.';
            END IF;
        ELSE
            SELECT * INTO v_series FROM public.document_numbering_series WHERE id = v_series_id;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'La serie seleccionada (ID %) no existe.', v_series_id;
            END IF;
            IF v_series.document_type_id <> v_apl_type.id THEN
                RAISE EXCEPTION 'La serie seleccionada no pertenece al tipo APL.';
            END IF;
            IF v_series.is_exhausted THEN
                RAISE EXCEPTION 'SERIE_AGOTADA: La serie del punto de venta % alcanzó el último número disponible. Seleccione otra serie activa o solicite a un administrador la creación de una nueva serie.', 
                    lpad(v_series.point_of_sale::text, 4, '0');
            END IF;
            IF NOT v_series.is_active THEN
                RAISE EXCEPTION 'La serie seleccionada (ID %) se encuentra inactiva.', v_series_id;
            END IF;
        END IF;

        -- Consumir serie APL con bandera is_reversal = true para prefijo APL-REV
        SELECT * INTO v_allocated 
        FROM public.fn_allocate_internal_document_number(v_series_id, 'APL', true);

        v_final_pos := v_allocated.point_of_sale;
        v_final_num := v_allocated.assigned_number;
        v_apl_ref := v_allocated.human_reference;
    ELSE
        v_series_id := NULL;
        v_apl_ref := format('APL-REV %s', lpad(p_movement_id::text, 6, '0'));
    END IF;

    -- Crear Cabecera APL Compensatorio
    INSERT INTO public.documents (
        supplier_id, document_type_id, status, point_of_sale, document_number,
        numbering_series_id, human_reference, issue_date, currency, exchange_rate, total_amount, 
        concept, notes, intake_source, created_by, confirmed_by, confirmed_at
    ) VALUES (
        v_mov.supplier_id, v_apl_type.id, 'CONFIRMED', v_final_pos, v_final_num,
        v_series_id, v_apl_ref, CURRENT_DATE, 'ARS', 1.000000, v_reverse_amount, 
        format('Desimputación de Movimiento #%s: %s', p_movement_id, p_reason),
        p_reason, 'MANUAL', v_user_id, v_user_id, clock_timestamp()
    ) RETURNING id INTO v_apl_id;

    -- Renglón 1: Restaura la deuda en la Factura (+amount)
    INSERT INTO public.account_movements (
        supplier_id, document_id, reference_id, line_number, movement_type,
        movement_date, currency, amount, notes, created_by
    ) VALUES (
        v_mov.supplier_id, v_apl_id, v_mov.reference_id, 1, 'DESIMPUTATION',
        CURRENT_DATE, 'ARS', v_reverse_amount, format('Restaura deuda por desimputación: %s', p_reason), v_user_id
    );

    -- Renglón 2: Restaura el crédito disponible en el comprobante emisor / OP (-amount)
    INSERT INTO public.account_movements (
        supplier_id, document_id, reference_id, line_number, movement_type,
        movement_date, currency, amount, notes, created_by
    ) VALUES (
        v_mov.supplier_id, v_apl_id, v_mov.document_id, 2, 'DESIMPUTATION',
        CURRENT_DATE, 'ARS', -v_reverse_amount, format('Restaura crédito a favor por desimputación: %s', p_reason), v_user_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'reversal_document_id', v_apl_id,
        'human_reference', v_apl_ref,
        'assigned_number', v_final_num,
        'point_of_sale', v_final_pos,
        'series_id', v_series_id,
        'reversed_amount', v_reverse_amount
    );
END;
$$;
