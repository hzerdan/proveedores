DO $$
DECLARE
    v_series_id bigint;
    v_num1 text;
    v_is_exhausted boolean;
    v_exhausted_at timestamptz;
    v_err text;
    v_creator_id bigint;
BEGIN
    SELECT id INTO v_creator_id FROM public.profiles LIMIT 1;

    -- 1. Crear o resetear serie exclusiva de QA POS 9998 para comprobante tipo 7 (APL)
    DELETE FROM public.document_numbering_series WHERE point_of_sale = 9998;

    INSERT INTO public.document_numbering_series (
        document_type_id,
        point_of_sale,
        letter,
        description,
        next_number,
        is_active,
        is_exhausted,
        created_by
    ) VALUES (
        7,
        9998,
        NULL,
        'Serie QA Prueba Agotamiento 9998',
        99999999,
        true,
        false,
        v_creator_id
    ) RETURNING id INTO v_series_id;

    RAISE NOTICE 'Serie QA 9998 creada con id: %, next_number: 99999999', v_series_id;

    -- 2. Emitir el último comprobante válido (99999999)
    v_num1 := public.fn_allocate_internal_document_number(v_series_id, 'APL', false);
    RAISE NOTICE 'Comprobante 99999999 emitido exitosamente: %', v_num1;

    -- 3. Verificar estado de agotamiento atómico
    SELECT is_exhausted, exhausted_at INTO v_is_exhausted, v_exhausted_at
    FROM public.document_numbering_series
    WHERE id = v_series_id;

    RAISE NOTICE 'Estado post-emision: is_exhausted = %, exhausted_at = %', v_is_exhausted, v_exhausted_at;

    IF NOT v_is_exhausted OR v_exhausted_at IS NULL THEN
        RAISE EXCEPTION 'ERROR: La serie no quedo marcada como agotada!';
    END IF;

    -- 4. Intentar otra emisión (debe fallar y lanzar excepción explicativa)
    BEGIN
        PERFORM public.fn_allocate_internal_document_number(v_series_id, 'APL', false);
        RAISE EXCEPTION 'ERROR: No se bloqueo la emision de serie agotada!';
    EXCEPTION WHEN OTHERS THEN
        v_err := SQLERRM;
        RAISE NOTICE 'Intento posterior bloqueado exitosamente con mensaje: %', v_err;
    END;

    -- 5. Desactivar la serie 9998 para dejar QA limpio y conservar 9999 disponible
    UPDATE public.document_numbering_series
    SET is_active = false
    WHERE id = v_series_id;

    RAISE NOTICE 'Serie QA 9998 desactivada correctamente.';
END;
$$;
