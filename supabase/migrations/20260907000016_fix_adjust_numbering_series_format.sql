-- ============================================================================
-- MIGRACIÓN: 20260907000016_fix_adjust_numbering_series_format.sql
-- PROYECTO: Sistema de Cuentas Corrientes de Proveedores
-- OBJETIVO: Corregir especificadores de formato en mensaje de rpc_adjust_numbering_series
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_adjust_numbering_series(
    p_series_id bigint,
    p_new_number bigint,
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id bigint;
    v_series record;
    v_max_emitted bigint;
BEGIN
    v_user_id := current_app_user_id();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Acceso no autorizado: Debe estar autenticado.';
    END IF;

    IF NOT has_permission('system.manage') THEN
        RAISE EXCEPTION 'Acceso denegado: Se requiere el permiso system.manage para ajustar series de numeración.';
    END IF;


    IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
        RAISE EXCEPTION 'El motivo del ajuste es obligatorio y debe contener al menos 5 caracteres.';
    END IF;

    IF p_new_number > 99999999 THEN
        RAISE EXCEPTION 'El próximo número no puede exceder el límite máximo de 99999999.';
    END IF;

    -- Bloqueo FOR UPDATE de la fila de la serie
    SELECT * INTO v_series
    FROM public.document_numbering_series
    WHERE id = p_series_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La serie de numeración ID % no existe.', p_series_id;
    END IF;

    IF p_new_number <= v_series.next_number THEN
        RAISE EXCEPTION 'Sólo se permite avanzar el contador (valor actual: %, valor solicitado: %).', 
            v_series.next_number, p_new_number;
    END IF;

    -- Verificar que no colisione con documentos ya emitidos
    SELECT COALESCE(MAX(document_number), 0) INTO v_max_emitted
    FROM public.documents
    WHERE numbering_series_id = p_series_id;

    IF p_new_number <= v_max_emitted THEN
        RAISE EXCEPTION 'Colisión detectada: Ya se emitieron documentos con numeración hasta % en esta serie.', v_max_emitted;
    END IF;

    -- Actualizar contador
    UPDATE public.document_numbering_series
    SET next_number = p_new_number,
        updated_at = clock_timestamp()
    WHERE id = p_series_id;

    -- Registrar auditoría append-only
    INSERT INTO public.document_numbering_series_adjustments (
        series_id, previous_number, new_number, reason, adjusted_by
    ) VALUES (
        p_series_id, v_series.next_number, p_new_number, trim(p_reason), v_user_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'series_id', p_series_id,
        'previous_number', v_series.next_number,
        'new_number', p_new_number,
        'message', format('Contador de la serie ID %s avanzado exitosamente de %s a %s.', p_series_id, v_series.next_number, p_new_number)
    );
END;
$$;
