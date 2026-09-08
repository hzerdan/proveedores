-- ==============================================================================
-- Migration: 20260907000024_fix_unassigned_record_in_rpc_create_and_confirm_op.sql
-- Description: Fix unassigned record variable v_matched_doc when numbering_mode
--              is INTERNAL_SEQUENCE in rpc_create_and_confirm_op.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.rpc_create_and_confirm_op(
    p_supplier_id bigint,
    p_document_type_id smallint,
    p_point_of_sale integer DEFAULT NULL::integer,
    p_document_number integer DEFAULT NULL::integer,
    p_human_reference character varying DEFAULT ''::character varying,
    p_issue_date date DEFAULT CURRENT_DATE,
    p_total_amount numeric DEFAULT 0,
    p_currency character varying DEFAULT 'ARS'::character varying,
    p_concept text DEFAULT NULL::text,
    p_applications jsonb DEFAULT '[]'::jsonb,
    p_override_reason text DEFAULT NULL::text,
    p_numbering_series_id bigint DEFAULT NULL::bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
    v_matched_doc_id bigint := NULL;
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
                v_matched_doc_id := v_matched_doc.id;
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
    IF v_matched_doc_id IS NOT NULL AND p_override_reason IS NOT NULL THEN
        INSERT INTO public.duplicate_override_logs (
            document_id, matched_document_id, reason, authorized_by
        ) VALUES (
            v_op_doc_id, v_matched_doc_id, trim(p_override_reason), v_user_id
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
