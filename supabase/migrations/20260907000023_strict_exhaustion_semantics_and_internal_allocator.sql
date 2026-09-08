-- ============================================================================
-- MIGRACIÓN: 20260907000023_strict_exhaustion_semantics_and_internal_allocator.sql
-- PROYECTO: Sistema de Cuentas Corrientes de Proveedores
-- OBJETIVOS:
--   1. Semántica estricta de serie agotada:
--      - Serie disponible: is_exhausted = false, exhausted_at = NULL, next_number BETWEEN 1 AND 99999999
--      - Serie agotada: is_exhausted = true, exhausted_at IS NOT NULL, next_number = NULL
--   2. Constraint de coherencia chk_series_exhaustion_coherence
--   3. fn_allocate_internal_document_number establece next_number = NULL al emitir 99999999
--   4. Revocación de EXECUTE sobre fn_allocate_internal_document_number a anon, authenticated y PUBLIC
--   5. Bloqueo de rpc_adjust_numbering_series sobre series agotadas
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ACTUALIZAR ESQUEMA Y CONSTRAINTS EN document_numbering_series
-- ----------------------------------------------------------------------------

-- Permitir NULL en next_number para series agotadas
ALTER TABLE public.document_numbering_series 
ALTER COLUMN next_number DROP NOT NULL;

-- Eliminar constraint legado que forzaba next_number <= 100000000 y NOT NULL
ALTER TABLE public.document_numbering_series 
DROP CONSTRAINT IF EXISTS document_numbering_series_next_number_check;

ALTER TABLE public.document_numbering_series 
DROP CONSTRAINT IF EXISTS chk_series_exhaustion_coherence;

-- Actualizar series que hayan sido marcadas previamente como agotadas para que tengan next_number = NULL
UPDATE public.document_numbering_series
SET next_number = NULL,
    is_exhausted = true,
    exhausted_at = COALESCE(exhausted_at, clock_timestamp())
WHERE is_exhausted = true OR next_number > 99999999;

-- Crear constraint estricto de coherencia funcional
ALTER TABLE public.document_numbering_series
ADD CONSTRAINT chk_series_exhaustion_coherence CHECK (
    (
        is_exhausted = false
        AND exhausted_at IS NULL
        AND next_number IS NOT NULL
        AND next_number BETWEEN 1 AND 99999999
    )
    OR
    (
        is_exhausted = true
        AND exhausted_at IS NOT NULL
        AND next_number IS NULL
    )
);

-- ----------------------------------------------------------------------------
-- 2. ACTUALIZACIÓN ATÓMICA DE fn_allocate_internal_document_number
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
    -- Bloqueo pesimista FOR UPDATE para garantizar serialización estricta sin colisiones
    SELECT * INTO v_series
    FROM public.document_numbering_series
    WHERE id = p_series_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La serie de numeración ID % no existe.', p_series_id;
    END IF;

    -- Validar si la serie está agotada (is_exhausted = true o next_number IS NULL)
    IF v_series.is_exhausted OR v_series.next_number IS NULL THEN
        RAISE EXCEPTION 'SERIE_AGOTADA: La serie del punto de venta % alcanzó el último número disponible. Seleccione otra serie activa o solicite a un administrador la creación de una nueva serie.', 
            lpad(v_series.point_of_sale::text, 4, '0');
    END IF;

    IF NOT v_series.is_active THEN
        RAISE EXCEPTION 'La serie de numeración % (% - POS %) se encuentra inactiva.', 
            v_series.id, p_doc_type_code, v_series.point_of_sale;
    END IF;

    v_num := v_series.next_number;

    -- Si este es el último comprobante válido (99999999):
    -- Se asigna el 99999999 para el documento actual, y atómicamente en esta misma transacción:
    -- next_number pasa a NULL, is_exhausted pasa a true, y exhausted_at se establece.
    IF v_num = 99999999 THEN
        UPDATE public.document_numbering_series
        SET next_number = NULL,
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

    -- Construir human_reference preservando exactamente 4 dígitos para punto de venta y 8 para número
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
-- 3. PERMISOS ESTRICTOS: ASIGNADOR COMO FUNCIÓN INTERNA PRIVADA
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.fn_allocate_internal_document_number(bigint, varchar, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_allocate_internal_document_number(bigint, varchar, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.fn_allocate_internal_document_number(bigint, varchar, boolean) FROM authenticated;

-- Únicamente el motor de ejecución interno y service_role pueden ejecutarla
GRANT EXECUTE ON FUNCTION public.fn_allocate_internal_document_number(bigint, varchar, boolean) TO postgres, service_role;

-- ----------------------------------------------------------------------------
-- 4. VALIDACIÓN DE AGOTAMIENTO EN rpc_adjust_numbering_series
-- ----------------------------------------------------------------------------
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

    IF v_series.is_exhausted OR v_series.next_number IS NULL THEN
        RAISE EXCEPTION 'La serie se encuentra agotada y no admite ajustes de contador. Cree una nueva serie activa.';
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

    -- Registrar auditoría inmutable
    INSERT INTO public.document_numbering_series_adjustments (
        series_id,
        old_next_number,
        new_next_number,
        reason,
        adjusted_by
    ) VALUES (
        p_series_id,
        v_series.next_number,
        p_new_number,
        trim(p_reason),
        v_user_id
    );

    -- Actualizar serie
    UPDATE public.document_numbering_series
    SET next_number = p_new_number,
        updated_at = clock_timestamp()
    WHERE id = p_series_id;

    RETURN jsonb_build_object(
        'success', true,
        'series_id', p_series_id,
        'old_next_number', v_series.next_number,
        'new_next_number', p_new_number,
        'adjusted_at', clock_timestamp()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_adjust_numbering_series(bigint, bigint, text) TO authenticated, service_role;
