-- ============================================================================
-- MIGRACIÓN: 20260907000015_configurable_numbering_due_discount_and_secure_files.sql
-- PROYECTO: Sistema de Cuentas Corrientes de Proveedores
-- OBJETIVOS:
--   1. Origen configurable de numeración documental (EXTERNAL vs INTERNAL_SEQUENCE)
--   2. Series de numeración, punto de venta 4 dígitos, correlativo 8 dígitos, tope 99999999
--   3. Seed inicial: OP y APL (serie 0100), compartida para APL y APL-REV
--   4. Ajustes auditados append-only del contador
--   5. Beneficio condicionado al pago puntual en proveedores (strict_due_date_discount)
--   6. Acceso seguro a comprobantes, protección inmutable y cierre tras confirmación
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXTENSIÓN DE document_types (MODO DE NUMERACIÓN)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'document_types' AND column_name = 'numbering_mode'
    ) THEN
        ALTER TABLE public.document_types 
        ADD COLUMN numbering_mode varchar(20) NOT NULL DEFAULT 'EXTERNAL';

        ALTER TABLE public.document_types
        ADD CONSTRAINT chk_document_types_numbering_mode 
        CHECK (numbering_mode IN ('EXTERNAL', 'INTERNAL_SEQUENCE'));
    END IF;
END $$;

-- Configuración inicial: OP y APL en INTERNAL_SEQUENCE, resto en EXTERNAL
UPDATE public.document_types 
SET numbering_mode = 'INTERNAL_SEQUENCE' 
WHERE code IN ('ORDEN_PAGO', 'APL');

-- ----------------------------------------------------------------------------
-- 2. TABLA document_numbering_series (SERIES DE NUMERACIÓN)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_numbering_series (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    document_type_id smallint NOT NULL REFERENCES public.document_types(id) ON DELETE RESTRICT,
    letter varchar(1) NULL,
    point_of_sale integer NOT NULL CHECK (point_of_sale >= 1 AND point_of_sale <= 9999),
    next_number bigint NOT NULL CHECK (next_number >= 1 AND next_number <= 100000000),
    is_active boolean NOT NULL DEFAULT true,
    description text NULL,
    created_by bigint NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_doc_numbering_series UNIQUE NULLS NOT DISTINCT (document_type_id, letter, point_of_sale)
);

CREATE INDEX IF NOT EXISTS idx_doc_numbering_series_lookup 
ON public.document_numbering_series(document_type_id, is_active);

-- SEED INICIAL DE SERIES (OP: 0100-00000001, APL: 0100-00000001)
DO $$
DECLARE
    v_admin_id bigint;
    v_op_type_id smallint;
    v_apl_type_id smallint;
BEGIN
    SELECT id INTO v_admin_id FROM public.profiles WHERE is_active = true ORDER BY id ASC LIMIT 1;
    SELECT id INTO v_op_type_id FROM public.document_types WHERE code = 'ORDEN_PAGO';
    SELECT id INTO v_apl_type_id FROM public.document_types WHERE code = 'APL';

    IF v_op_type_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.document_numbering_series WHERE document_type_id = v_op_type_id AND point_of_sale = 100
    ) THEN
        INSERT INTO public.document_numbering_series (
            document_type_id, letter, point_of_sale, next_number, is_active, description, created_by
        ) VALUES (
            v_op_type_id, NULL, 100, 1, true, 'Serie Inicial de Órdenes de Pago', v_admin_id
        );
    END IF;

    IF v_apl_type_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.document_numbering_series WHERE document_type_id = v_apl_type_id AND point_of_sale = 100
    ) THEN
        INSERT INTO public.document_numbering_series (
            document_type_id, letter, point_of_sale, next_number, is_active, description, created_by
        ) VALUES (
            v_apl_type_id, NULL, 100, 1, true, 'Serie Inicial de Aplicaciones de Saldo y Desimputaciones', v_admin_id
        );
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. TABLA document_numbering_series_adjustments (AUDITORÍA DE AJUSTES)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_numbering_series_adjustments (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    series_id bigint NOT NULL REFERENCES public.document_numbering_series(id) ON DELETE RESTRICT,
    previous_number bigint NOT NULL,
    new_number bigint NOT NULL CHECK (new_number > previous_number AND new_number <= 99999999),
    reason text NOT NULL CHECK (length(trim(reason)) >= 5),
    adjusted_by bigint NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Trigger de inmutabilidad append-only para ajustes
CREATE OR REPLACE FUNCTION public.fn_prevent_modification_adjustments()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'INMUTABILIDAD: Los registros de ajuste de contador son de solo lectura y no admiten UPDATE ni DELETE.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_modification_adjustments ON public.document_numbering_series_adjustments;
CREATE TRIGGER trg_prevent_modification_adjustments
BEFORE UPDATE OR DELETE ON public.document_numbering_series_adjustments
FOR EACH ROW
EXECUTE FUNCTION public.fn_prevent_modification_adjustments();

-- ----------------------------------------------------------------------------
-- 4. MODIFICACIÓN DE documents (SERIE Y PROTECCIÓN)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'documents' AND column_name = 'numbering_series_id'
    ) THEN
        ALTER TABLE public.documents 
        ADD COLUMN numbering_series_id bigint NULL REFERENCES public.document_numbering_series(id) ON DELETE RESTRICT;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_internal_series_number 
ON public.documents(numbering_series_id, document_number) 
WHERE (numbering_series_id IS NOT NULL);

-- Actualizar trigger de inmutabilidad en cabeceras para proteger numbering_series_id
CREATE OR REPLACE FUNCTION public.trg_enforce_document_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status = 'CONFIRMED' THEN
        IF NEW.supplier_id <> OLD.supplier_id OR
           NEW.document_type_id <> OLD.document_type_id OR
           NEW.letter IS DISTINCT FROM OLD.letter OR
           NEW.point_of_sale IS DISTINCT FROM OLD.point_of_sale OR
           NEW.document_number IS DISTINCT FROM OLD.document_number OR
           NEW.issue_date <> OLD.issue_date OR
           NEW.currency <> OLD.currency OR
           NEW.exchange_rate <> OLD.exchange_rate OR
           NEW.total_amount <> OLD.total_amount OR
           NEW.status <> OLD.status OR
           NEW.numbering_series_id IS DISTINCT FROM OLD.numbering_series_id THEN
            RAISE EXCEPTION 'INMUTABILIDAD: No está permitido modificar datos económicos, serie ni cambiar el estado de un documento CONFIRMADO (ID %).', OLD.id;
        END IF;
    END IF;
    
    NEW.updated_at = clock_timestamp();
    RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. FUNCIÓN ATÓMICA DE ASIGNACIÓN fn_allocate_internal_document_number
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

    IF NOT v_series.is_active THEN
        RAISE EXCEPTION 'La serie de numeración % (% - POS %) se encuentra inactiva.', 
            v_series.id, p_doc_type_code, v_series.point_of_sale;
    END IF;

    IF v_series.next_number > 99999999 THEN
        RAISE EXCEPTION 'SERIE_AGOTADA: La serie de numeración % ha alcanzado el número máximo (99999999). Debe configurar o activar una nueva serie.', p_series_id;
    END IF;

    v_num := v_series.next_number;

    -- Incrementar contador atómicamente
    UPDATE public.document_numbering_series
    SET next_number = v_series.next_number + 1,
        updated_at = clock_timestamp()
    WHERE id = v_series.id;

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
-- 6. RPC rpc_adjust_numbering_series (AJUSTE AUDITADO DEL CONTADOR)
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
        RAISE EXCEPTION 'Permiso denegado: Se requiere "system.manage" para ajustar series de numeración.';
    END IF;

    IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
        RAISE EXCEPTION 'El motivo de ajuste es obligatorio y debe tener al menos 5 caracteres.';
    END IF;

    IF p_new_number > 99999999 THEN
        RAISE EXCEPTION 'El nuevo número no puede superar el límite de 8 dígitos (99999999).';
    END IF;

    SELECT * INTO v_series
    FROM public.document_numbering_series
    WHERE id = p_series_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Serie de numeración ID % no encontrada.', p_series_id;
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

-- ----------------------------------------------------------------------------
-- 7. ACTUALIZACIÓN DE rpc_create_and_confirm_document
-- ----------------------------------------------------------------------------
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
        
        -- Si no se indicó serie, verificar cuántas series activas existen
        IF v_series_id IS NULL THEN
            SELECT count(*), min(id) INTO v_active_series_count, v_series_id
            FROM public.document_numbering_series
            WHERE document_type_id = p_document_type_id AND is_active = true;

            IF v_active_series_count = 0 THEN
                RAISE EXCEPTION 'SIN_SERIE_ACTIVA: El tipo "%" requiere autonumeración pero no posee series activas configuradas.', v_doc_type.name;
            ELSIF v_active_series_count > 1 THEN
                RAISE EXCEPTION 'SELECCION_SERIE_OBLIGATORIA: Existen múltiples series activas para "%". Debe seleccionar una serie.', v_doc_type.name;
            END IF;
        ELSE
            -- Validar que la serie pertenezca al tipo y esté activa
            SELECT * INTO v_series FROM public.document_numbering_series WHERE id = v_series_id;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'La serie de numeración ID % no existe.', v_series_id;
            END IF;
            IF v_series.document_type_id <> p_document_type_id THEN
                RAISE EXCEPTION 'La serie ID % no pertenece al tipo documental "%".', v_series_id, v_doc_type.name;
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
        -- Modo EXTERNAL: Conservar reglas y detección de duplicados
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
                        RAISE EXCEPTION 'Permiso denegado: Se requiere autorización para registrar comprobantes duplicados.';
                    END IF;
                END IF;
            END IF;
        END IF;
    END IF;

    -- Insertar Cabecera en documents
    INSERT INTO public.documents (
        supplier_id, seller_id, document_type_id, status, letter, point_of_sale, document_number,
        numbering_series_id, human_reference, issue_date, due_date, currency, total_amount, 
        concept, notes, intake_source, created_by, confirmed_by, confirmed_at
    ) VALUES (
        p_supplier_id, p_seller_id, p_document_type_id, 'CONFIRMED', v_final_letter, v_final_pos, v_final_num,
        v_series_id, v_final_human_ref, p_issue_date, p_due_date, p_currency, p_total_amount, 
        p_concept, p_notes, 'MANUAL', v_user_id, v_user_id, clock_timestamp()
    ) RETURNING id INTO v_new_doc_id;

    -- Registrar auditoría si fue excepción de duplicado externo
    IF v_matched_doc.id IS NOT NULL AND p_override_reason IS NOT NULL THEN
        INSERT INTO public.duplicate_override_logs (document_id, matched_document_id, reason, authorized_by)
        VALUES (v_new_doc_id, v_matched_doc.id, trim(p_override_reason), v_user_id);
    END IF;

    -- Renglón ORIGIN en account_movements si afecta saldo
    IF v_doc_type.affects_account_balance THEN
        v_signed_amount := CASE WHEN v_doc_type.balance_nature = 'DEBIT' THEN p_total_amount ELSE -p_total_amount END;
        INSERT INTO public.account_movements (
            supplier_id, document_id, reference_id, line_number, movement_type, movement_date, currency, amount, notes, created_by
        ) VALUES (
            p_supplier_id, v_new_doc_id, v_new_doc_id, 1, 'ORIGIN', p_issue_date, p_currency, v_signed_amount, p_concept, v_user_id
        );
    END IF;

    -- Vincular extracción de IA y archivo si existen
    IF p_ai_extraction_id IS NOT NULL THEN
        v_sanitized_diff := COALESCE(p_confirmed_payload_diff, '{}'::jsonb);
        UPDATE public.document_ai_extractions
        SET document_id = v_new_doc_id,
            confirmed_by = v_user_id,
            confirmed_at = clock_timestamp(),
            confirmed_payload_diff = v_sanitized_diff
        WHERE id = p_ai_extraction_id;
    END IF;

    IF p_file_id IS NOT NULL THEN
        UPDATE public.document_files
        SET document_id = v_new_doc_id
        WHERE id = p_file_id;

        UPDATE public.document_upload_sessions
        SET document_id = v_new_doc_id,
            status = 'COMPLETED',
            completed_at = clock_timestamp()
        WHERE file_id = p_file_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'document_id', v_new_doc_id,
        'human_reference', v_final_human_ref,
        'seller_id', p_seller_id,
        'status', 'CONFIRMED',
        'numbering_series_id', v_series_id,
        'point_of_sale', v_final_pos,
        'document_number', v_final_num,
        'message', 'Documento creado y confirmado exitosamente.'
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. ACTUALIZACIÓN DE rpc_create_and_confirm_op
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_create_and_confirm_op(
    p_supplier_id bigint,
    p_document_type_id smallint,
    p_point_of_sale integer,
    p_document_number integer,
    p_human_reference character varying,
    p_issue_date date,
    p_total_amount numeric,
    p_concept text DEFAULT NULL::text,
    p_notes text DEFAULT NULL::text,
    p_imputations jsonb DEFAULT '[]'::jsonb,
    p_override_reason text DEFAULT NULL::text,
    p_numbering_series_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id bigint;
    v_doc_id bigint;
    v_doc_type record;
    v_imp jsonb;
    v_target_id bigint;
    v_amount numeric(15,2);
    v_total_imputed numeric(15,2) := 0.00;
    v_remainder numeric(15,2);
    v_target_debt numeric(15,2);
    v_line smallint := 1;
    v_target_doc record;
    v_series_id bigint;
    v_series record;
    v_allocated record;
    v_final_pos integer;
    v_final_num bigint;
    v_final_human_ref varchar;
    v_active_series_count integer;
BEGIN
    v_user_id := current_app_user_id();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Acceso no autorizado o perfil inactivo.';
    END IF;

    IF NOT has_permission('documents.create') THEN
        RAISE EXCEPTION 'Permiso denegado: Se requiere \"documents.create\".';
    END IF;

    IF p_total_amount <= 0 THEN
        RAISE EXCEPTION 'El importe de la Orden de Pago debe ser estrictamente mayor a 0.';
    END IF;

    SELECT * INTO v_doc_type FROM public.document_types WHERE id = p_document_type_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tipo de comprobante ID % no encontrado.', p_document_type_id;
    END IF;

    -- GESTIÓN DE NUMERACIÓN
    IF v_doc_type.numbering_mode = 'INTERNAL_SEQUENCE' THEN
        v_series_id := p_numbering_series_id;
        IF v_series_id IS NULL THEN
            SELECT count(*), min(id) INTO v_active_series_count, v_series_id
            FROM public.document_numbering_series
            WHERE document_type_id = p_document_type_id AND is_active = true;

            IF v_active_series_count = 0 THEN
                RAISE EXCEPTION 'SIN_SERIE_ACTIVA: No existen series activas configuradas para Órdenes de Pago.';
            ELSIF v_active_series_count > 1 THEN
                RAISE EXCEPTION 'SELECCION_SERIE_OBLIGATORIA: Existen múltiples series activas para Orden de Pago. Debe seleccionar una.';
            END IF;
        ELSE
            SELECT * INTO v_series FROM public.document_numbering_series WHERE id = v_series_id;
            IF NOT FOUND OR NOT v_series.is_active OR v_series.document_type_id <> p_document_type_id THEN
                RAISE EXCEPTION 'La serie seleccionada (ID %) no es válida para Orden de Pago.', v_series_id;
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
    END IF;

    -- Validar total acumulado de imputaciones
    FOR v_imp IN SELECT * FROM jsonb_array_elements(p_imputations)
    LOOP
        v_amount := (v_imp->>'applied_amount')::numeric;
        IF v_amount <= 0 THEN
            RAISE EXCEPTION 'Cada importe a imputar debe ser mayor a 0.';
        END IF;
        v_total_imputed := v_total_imputed + v_amount;
    END LOOP;

    IF v_total_imputed > p_total_amount THEN
        RAISE EXCEPTION 'El total a imputar ($%) supera el importe de la Orden de Pago ($%).', v_total_imputed, p_total_amount;
    END IF;

    -- Insertar Cabecera de la Orden de Pago
    INSERT INTO public.documents (
        supplier_id, document_type_id, status, point_of_sale, document_number,
        numbering_series_id, human_reference, issue_date, currency, exchange_rate, total_amount,
        concept, notes, intake_source, created_by, confirmed_by, confirmed_at
    ) VALUES (
        p_supplier_id, p_document_type_id, 'CONFIRMED', v_final_pos, v_final_num,
        v_series_id, v_final_human_ref, p_issue_date, 'ARS', 1.000000, p_total_amount,
        p_concept, p_notes, 'MANUAL', v_user_id, v_user_id, clock_timestamp()
    ) RETURNING id INTO v_doc_id;

    -- Procesar cada renglón de imputación a facturas
    FOR v_imp IN SELECT * FROM jsonb_array_elements(p_imputations)
    LOOP
        v_target_id := (v_imp->>'target_document_id')::bigint;
        v_amount := (v_imp->>'applied_amount')::numeric;

        SELECT * INTO v_target_doc FROM public.documents WHERE id = v_target_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Factura destino ID % no encontrada.', v_target_id;
        END IF;

        IF v_target_doc.supplier_id <> p_supplier_id THEN
            RAISE EXCEPTION 'La Factura ID % pertenece a otro proveedor.', v_target_id;
        END IF;

        SELECT COALESCE(SUM(amount), 0.00) INTO v_target_debt
        FROM public.account_movements
        WHERE reference_id = v_target_id;

        IF v_amount > v_target_debt THEN
            RAISE EXCEPTION 'No sobrecancelación: La Factura % (ID %) tiene deuda de $%, no puede recibir imputación de $%.',
                v_target_doc.human_reference, v_target_id, v_target_debt, v_amount;
        END IF;

        INSERT INTO public.account_movements (
            supplier_id, document_id, reference_id, line_number, movement_type,
            movement_date, currency, amount, notes, created_by
        ) VALUES (
            p_supplier_id, v_doc_id, v_target_id, v_line, 'IMPUTATION',
            p_issue_date, 'ARS', -v_amount, format('Imputación a %s', v_target_doc.human_reference), v_user_id
        );

        v_line := v_line + 1;
    END LOOP;

    -- Si queda remanente, generar renglón REMAINDER
    v_remainder := p_total_amount - v_total_imputed;
    IF v_remainder > 0 THEN
        INSERT INTO public.account_movements (
            supplier_id, document_id, reference_id, line_number, movement_type,
            movement_date, currency, amount, notes, created_by
        ) VALUES (
            p_supplier_id, v_doc_id, v_doc_id, v_line, 'REMAINDER',
            p_issue_date, 'ARS', -v_remainder, 'Remanente libre de Orden de Pago', v_user_id
        );
    END IF;

    -- Validar invariante: SUM(renglones) = -p_total_amount
    IF (SELECT SUM(amount) FROM public.account_movements WHERE document_id = v_doc_id) <> -p_total_amount THEN
        RAISE EXCEPTION 'Error de Integridad: La suma de renglones de la OP no coincide con -total_amount.';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'document_id', v_doc_id,
        'human_reference', v_final_human_ref,
        'numbering_series_id', v_series_id,
        'total_amount', p_total_amount,
        'imputed_amount', v_total_imputed,
        'remainder_amount', v_remainder,
        'message', 'Orden de Pago registrada y confirmada exitosamente.'
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. ACTUALIZACIÓN DE rpc_apply_existing_balance (APL)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_apply_existing_balance(
    p_source_document_id bigint,
    p_target_applications jsonb,
    p_notes text DEFAULT NULL::text,
    p_numbering_series_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id bigint;
    v_source record;
    v_apl_type record;
    v_apl_doc_id bigint;
    v_human_ref varchar(100);
    v_app jsonb;
    v_target_id bigint;
    v_amount numeric(15,2);
    v_total_to_apply numeric(15,2) := 0.00;
    v_line_no smallint := 1;
    v_series_id bigint;
    v_series record;
    v_allocated record;
    v_final_pos integer := NULL;
    v_final_num bigint := NULL;
    v_active_series_count integer;
BEGIN
    v_user_id := current_app_user_id();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Acceso no autorizado o perfil inactivo.';
    END IF;

    IF NOT has_permission('applications.create') THEN
        RAISE EXCEPTION 'Permiso denegado: Se requiere \"applications.create\".';
    END IF;

    SELECT * INTO v_source FROM public.documents WHERE id = p_source_document_id;
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
            WHERE document_type_id = v_apl_type.id AND is_active = true;

            IF v_active_series_count = 0 THEN
                RAISE EXCEPTION 'SIN_SERIE_ACTIVA: No existen series activas configuradas para documentos APL.';
            ELSIF v_active_series_count > 1 THEN
                RAISE EXCEPTION 'SELECCION_SERIE_OBLIGATORIA: Existen múltiples series activas para APL. Debe seleccionar una.';
            END IF;
        ELSE
            SELECT * INTO v_series FROM public.document_numbering_series WHERE id = v_series_id;
            IF NOT FOUND OR NOT v_series.is_active OR v_series.document_type_id <> v_apl_type.id THEN
                RAISE EXCEPTION 'La serie seleccionada (ID %) no es válida para APL.', v_series_id;
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
$$;

-- ----------------------------------------------------------------------------
-- 10. ACTUALIZACIÓN DE rpc_reverse_imputation (APL-REV CON SERIE APL COMPARTIDA)
-- ----------------------------------------------------------------------------
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
BEGIN
    v_user_id := current_app_user_id();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Acceso no autorizado o perfil inactivo.';
    END IF;

    IF NOT has_permission('applications.desimpute') THEN
        RAISE EXCEPTION 'Permiso denegado: Se requiere \"applications.desimpute\".';
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

    SELECT * INTO v_apl_type FROM public.document_types WHERE code = 'APL';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tipo de documento APL no encontrado.';
    END IF;

    -- Desimputación usa la misma serie de APL
    IF v_apl_type.numbering_mode = 'INTERNAL_SEQUENCE' THEN
        v_series_id := p_numbering_series_id;
        IF v_series_id IS NULL THEN
            SELECT count(*), min(id) INTO v_active_series_count, v_series_id
            FROM public.document_numbering_series
            WHERE document_type_id = v_apl_type.id AND is_active = true;

            IF v_active_series_count = 0 THEN
                RAISE EXCEPTION 'SIN_SERIE_ACTIVA: No existen series activas configuradas para APL/Desimputaciones.';
            ELSIF v_active_series_count > 1 THEN
                RAISE EXCEPTION 'SELECCION_SERIE_OBLIGATORIA: Existen múltiples series activas para APL. Debe seleccionar una para la desimputación.';
            END IF;
        ELSE
            SELECT * INTO v_series FROM public.document_numbering_series WHERE id = v_series_id;
            IF NOT FOUND OR NOT v_series.is_active OR v_series.document_type_id <> v_apl_type.id THEN
                RAISE EXCEPTION 'La serie seleccionada (ID %) no es válida para APL.', v_series_id;
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

    -- Validar invariante de APL suma cero
    IF (SELECT SUM(amount) FROM public.account_movements WHERE document_id = v_apl_id) <> 0.00 THEN
        RAISE EXCEPTION 'Error de Integridad: El APL de desimputación debe sumar 0.00.';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'apl_id', v_apl_id,
        'human_reference', v_apl_ref,
        'numbering_series_id', v_series_id,
        'reversed_amount', v_reverse_amount,
        'message', 'Imputación desimputada exitosamente mediante contra-asiento APL.'
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 11. EXTENSIÓN DE suppliers (BENEFICIO PAGO PUNTUAL)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'suppliers' AND column_name = 'strict_due_date_discount'
    ) THEN
        ALTER TABLE public.suppliers 
        ADD COLUMN strict_due_date_discount boolean NOT NULL DEFAULT false;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'suppliers' AND column_name = 'discount_payment_note'
    ) THEN
        ALTER TABLE public.suppliers 
        ADD COLUMN discount_payment_note text NULL;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 12. EXTENSIÓN DE document_files Y CIERRE INMUTABLE TRAS CONFIRMACIÓN
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'document_files' AND column_name = 'file_hash'
    ) THEN
        ALTER TABLE public.document_files 
        ADD COLUMN file_hash text NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'document_files' AND column_name = 'parent_file_id'
    ) THEN
        ALTER TABLE public.document_files 
        ADD COLUMN parent_file_id bigint NULL REFERENCES public.document_files(id) ON DELETE RESTRICT;
    END IF;
END $$;

-- Trigger para impedir agregar, modificar o borrar archivos en documentos ya CONFIRMADOS
CREATE OR REPLACE FUNCTION public.fn_protect_confirmed_document_files()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.document_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.documents WHERE id = OLD.document_id AND status = 'CONFIRMED'
        ) THEN
            RAISE EXCEPTION 'INMUTABILIDAD_FILES: No se puede eliminar el archivo ID % porque pertenece a un documento CONFIRMADO.', OLD.id;
        END IF;
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.document_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.documents WHERE id = OLD.document_id AND status = 'CONFIRMED'
        ) THEN
            IF NEW.storage_path <> OLD.storage_path OR
               NEW.storage_bucket <> OLD.storage_bucket OR
               NEW.document_id IS DISTINCT FROM OLD.document_id OR
               NEW.file_category <> OLD.file_category THEN
                RAISE EXCEPTION 'INMUTABILIDAD_FILES: No se pueden alterar los metadatos de un archivo perteneciente a un documento CONFIRMADO (ID %).', OLD.id;
            END IF;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        IF NEW.document_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.documents WHERE id = NEW.document_id AND status = 'CONFIRMED'
        ) THEN
            RAISE EXCEPTION 'CONJUNTO_CERRADO: No se pueden agregar archivos a un documento que ya fue CONFIRMADO (ID %).', NEW.document_id;
        END IF;
        RETURN NEW;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_confirmed_document_files ON public.document_files;
CREATE TRIGGER trg_protect_confirmed_document_files
BEFORE INSERT OR UPDATE OR DELETE ON public.document_files
FOR EACH ROW
EXECUTE FUNCTION public.fn_protect_confirmed_document_files();

-- Trigger en storage.objects para impedir borrar o alterar objetos físicos de documentos confirmados
CREATE OR REPLACE FUNCTION public.fn_protect_confirmed_storage_objects()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF EXISTS (
            SELECT 1 FROM public.document_files df
            JOIN public.documents d ON d.id = df.document_id
            WHERE df.storage_path = OLD.name
              AND d.status = 'CONFIRMED'
        ) THEN
            RAISE EXCEPTION 'INMUTABILIDAD_STORAGE: No se puede eliminar el archivo físico % porque pertenece a un comprobante confirmado.', OLD.name;
        END IF;
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        IF EXISTS (
            SELECT 1 FROM public.document_files df
            JOIN public.documents d ON d.id = df.document_id
            WHERE df.storage_path = OLD.name
              AND d.status = 'CONFIRMED'
        ) THEN
            RAISE EXCEPTION 'INMUTABILIDAD_STORAGE: No se puede modificar el archivo físico % porque pertenece a un comprobante confirmado.', OLD.name;
        END IF;
        RETURN NEW;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_confirmed_storage_objects ON storage.objects;
CREATE TRIGGER trg_protect_confirmed_storage_objects
BEFORE DELETE OR UPDATE ON storage.objects
FOR EACH ROW
EXECUTE FUNCTION public.fn_protect_confirmed_storage_objects();

-- ----------------------------------------------------------------------------
-- 13. RPC rpc_get_document_files (ACCESO SEGURO CON DISCRIMINACIÓN DE ROLES)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_get_document_files(
    p_document_id bigint,
    p_include_derivatives boolean DEFAULT false
)
RETURNS TABLE (
    file_id bigint,
    document_id bigint,
    storage_bucket varchar,
    storage_path text,
    file_name text,
    mime_type varchar,
    file_size_bytes bigint,
    file_category varchar,
    file_hash text,
    parent_file_id bigint,
    uploaded_by bigint,
    uploaded_by_name text,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id bigint;
BEGIN
    v_user_id := current_app_user_id();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Acceso no autorizado: Debe estar autenticado.';
    END IF;

    -- Control estricto de permisos
    IF p_include_derivatives THEN
        IF NOT has_permission('audit.view') THEN
            RAISE EXCEPTION 'Permiso denegado: Se requiere "audit.view" para acceder a archivos derivados de IA.';
        END IF;
    ELSE
        IF NOT has_permission('documents.view') AND NOT has_permission('documents.ai_review') THEN
            RAISE EXCEPTION 'Permiso denegado: Se requiere "documents.view" para ver el comprobante original.';
        END IF;
    END IF;

    RETURN QUERY
    SELECT 
        df.id AS file_id,
        df.document_id,
        df.storage_bucket,
        df.storage_path,
        df.file_name,
        df.mime_type,
        df.file_size_bytes,
        df.file_category,
        df.file_hash,
        df.parent_file_id,
        df.uploaded_by,
        COALESCE(p.first_name || ' ' || p.last_name, p.email, 'Usuario')::text AS uploaded_by_name,
        df.created_at
    FROM public.document_files df
    LEFT JOIN public.profiles p ON p.id = df.uploaded_by
    WHERE df.document_id = p_document_id
      AND (
          p_include_derivatives = true
          OR df.file_category IN ('ORIGINAL', 'INVOICE_PDF', 'INVOICE_IMAGE', 'ATTACHMENT')
      )
    ORDER BY df.id ASC;
END;
$$;

-- ----------------------------------------------------------------------------
-- 14. ACTUALIZACIÓN DE VISTAS (PAGO PUNTUAL Y ARCHIVOS - COLUMNAS APPEND AL FINAL)
-- ----------------------------------------------------------------------------

-- Vista v_open_reference_balances: conserva las 21 columnas originales y anexa las nuevas
CREATE OR REPLACE VIEW public.v_open_reference_balances AS
WITH ref_totals AS (
    SELECT m.reference_id,
           m.currency,
           sum(m.amount) AS reference_balance
    FROM public.account_movements m
    GROUP BY m.reference_id, m.currency
)
SELECT d.id AS document_id,
       d.supplier_id,
       s.trade_name AS supplier_trade_name,
       s.legal_name AS supplier_legal_name,
       s.tax_id AS supplier_tax_id,
       d.seller_id,
       sel.code AS seller_code,
       sel.display_name AS seller_display_name,
       dt.id AS document_type_id,
       dt.code AS document_type_code,
       dt.name AS document_type_name,
       dt.balance_nature,
       d.status,
       d.human_reference,
       d.issue_date,
       d.due_date,
       d.currency,
       d.total_amount,
       d.concept,
       d.notes,
       COALESCE(r.reference_balance, 0.00) AS reference_balance,
       s.strict_due_date_discount,
       s.discount_payment_note,
       d.numbering_series_id
FROM public.documents d
JOIN public.suppliers s ON s.id = d.supplier_id
JOIN public.document_types dt ON dt.id = d.document_type_id
LEFT JOIN public.sellers sel ON sel.id = d.seller_id
JOIN ref_totals r ON r.reference_id = d.id AND r.currency::text = d.currency::text
WHERE r.reference_balance <> 0.00;

-- Vista v_document_summary: conserva las 28 columnas originales y anexa las nuevas
CREATE OR REPLACE VIEW public.v_document_summary AS
SELECT d.id AS document_id,
       d.supplier_id,
       s.trade_name AS supplier_trade_name,
       s.tax_id AS supplier_tax_id,
       d.seller_id,
       sel.code AS seller_code,
       sel.display_name AS seller_display_name,
       d.document_type_id,
       dt.code AS document_type_code,
       dt.name AS document_type_name,
       dt.balance_nature,
       d.status,
       d.letter,
       d.point_of_sale,
       d.document_number,
       d.human_reference,
       d.issue_date,
       d.due_date,
       d.currency,
       d.total_amount,
       CASE
           WHEN dt.balance_nature::text = 'DEBIT'::text THEN d.total_amount
           WHEN dt.balance_nature::text = 'CREDIT'::text THEN - d.total_amount
           ELSE 0.00
       END AS signed_total_amount,
       COALESCE(ref_bal.current_balance, 0.00) AS reference_balance,
       COALESCE(doc_mov.total_emitted, 0.00) AS total_emitted_amount,
       CASE
           WHEN d.human_reference::text ~~ 'REV-%'::text THEN 'REVERSED'::text
           WHEN d.human_reference::text ~~ 'APL-REV%'::text THEN 'DESIMPUTATION'::text
           WHEN dt.code::text = 'APL'::text THEN 'APL_TRANSFER'::text
           WHEN dt.balance_nature::text = 'DEBIT'::text AND COALESCE(ref_bal.current_balance, 0.00) = 0.00 THEN 'PAID'::text
           WHEN dt.balance_nature::text = 'DEBIT'::text AND COALESCE(ref_bal.current_balance, 0.00) < d.total_amount THEN 'PARTIAL'::text
           WHEN dt.balance_nature::text = 'DEBIT'::text THEN 'PENDING'::text
           WHEN dt.balance_nature::text = 'CREDIT'::text AND COALESCE(ref_bal.current_balance, 0.00) < 0.00 THEN 'AVAILABLE_CREDIT'::text
           WHEN dt.balance_nature::text = 'CREDIT'::text THEN 'SETTLED_CREDIT'::text
           ELSE 'NEUTRAL'::text
       END AS derived_status,
       d.concept,
       d.notes,
       d.created_by,
       (p.first_name || ' '::text) || p.last_name AS created_by_name,
       d.created_at,
       s.strict_due_date_discount,
       s.discount_payment_note,
       d.numbering_series_id,
       COALESCE(f_meta.files_count, 0)::integer AS files_count,
       f_meta.primary_file_mime,
       f_meta.primary_file_name
FROM public.documents d
JOIN public.suppliers s ON s.id = d.supplier_id
JOIN public.document_types dt ON dt.id = d.document_type_id
JOIN public.profiles p ON p.id = d.created_by
LEFT JOIN public.sellers sel ON sel.id = d.seller_id
LEFT JOIN (
    SELECT reference_id, sum(amount) AS current_balance
    FROM public.account_movements
    GROUP BY reference_id
) ref_bal ON ref_bal.reference_id = d.id
LEFT JOIN (
    SELECT document_id, sum(amount) AS total_emitted
    FROM public.account_movements
    GROUP BY document_id
) doc_mov ON doc_mov.document_id = d.id
LEFT JOIN (
    SELECT document_id,
           count(*)::integer AS files_count,
           min(mime_type) FILTER (WHERE file_category IN ('ORIGINAL', 'INVOICE_PDF', 'INVOICE_IMAGE')) AS primary_file_mime,
           min(file_name) FILTER (WHERE file_category IN ('ORIGINAL', 'INVOICE_PDF', 'INVOICE_IMAGE')) AS primary_file_name
    FROM public.document_files
    GROUP BY document_id
) f_meta ON f_meta.document_id = d.id;

-- ----------------------------------------------------------------------------
-- 15. ACTUALIZACIÓN DE RPCs DE AGING, PROYECCIÓN Y DETALLE
-- ----------------------------------------------------------------------------

-- rpc_get_supplier_aging con beneficio pago puntual y fecha mínima urgente
DROP FUNCTION IF EXISTS public.rpc_get_supplier_aging(date);

CREATE FUNCTION public.rpc_get_supplier_aging(p_cutoff_date date DEFAULT CURRENT_DATE)
RETURNS TABLE(
    supplier_id bigint, 
    supplier_trade_name text, 
    supplier_tax_id character varying, 
    currency character varying, 
    overdue_gt_60 numeric, 
    overdue_31_60 numeric, 
    overdue_1_30 numeric, 
    due_0_30 numeric, 
    due_31_60 numeric, 
    due_gt_60 numeric, 
    no_due_date_amount numeric, 
    free_credits_amount numeric, 
    total_pending_debt numeric, 
    net_total_balance numeric,
    strict_due_date_discount boolean,
    discount_payment_note text,
    min_due_date date,
    has_no_due_date_docs boolean
)
LANGUAGE sql
STABLE
AS $function$
  WITH classified AS (
    SELECT 
      b.supplier_id,
      b.supplier_trade_name,
      b.supplier_tax_id,
      b.strict_due_date_discount,
      b.discount_payment_note,
      b.currency,
      b.due_date,
      b.reference_balance,
      CASE 
        WHEN b.reference_balance > 0 AND b.due_date IS NULL THEN 'NO_DUE_DATE'
        WHEN b.reference_balance > 0 AND b.due_date < (p_cutoff_date - 60) THEN 'OVERDUE_GT_60'
        WHEN b.reference_balance > 0 AND b.due_date >= (p_cutoff_date - 60) AND b.due_date <= (p_cutoff_date - 31) THEN 'OVERDUE_31_60'
        WHEN b.reference_balance > 0 AND b.due_date >= (p_cutoff_date - 30) AND b.due_date <= (p_cutoff_date - 1) THEN 'OVERDUE_1_30'
        WHEN b.reference_balance > 0 AND b.due_date >= p_cutoff_date AND b.due_date <= (p_cutoff_date + 30) THEN 'DUE_0_30'
        WHEN b.reference_balance > 0 AND b.due_date >= (p_cutoff_date + 31) AND b.due_date <= (p_cutoff_date + 60) THEN 'DUE_31_60'
        WHEN b.reference_balance > 0 AND b.due_date > (p_cutoff_date + 60) THEN 'DUE_GT_60'
        WHEN b.reference_balance < 0 THEN 'FREE_CREDIT'
        ELSE 'OTHER'
      END AS bucket_category
    FROM public.v_open_reference_balances b
  )
  SELECT 
    c.supplier_id,
    c.supplier_trade_name,
    c.supplier_tax_id,
    c.currency,
    COALESCE(SUM(CASE WHEN c.bucket_category = 'OVERDUE_GT_60' THEN c.reference_balance ELSE 0 END), 0.00) AS overdue_gt_60,
    COALESCE(SUM(CASE WHEN c.bucket_category = 'OVERDUE_31_60' THEN c.reference_balance ELSE 0 END), 0.00) AS overdue_31_60,
    COALESCE(SUM(CASE WHEN c.bucket_category = 'OVERDUE_1_30' THEN c.reference_balance ELSE 0 END), 0.00) AS overdue_1_30,
    COALESCE(SUM(CASE WHEN c.bucket_category = 'DUE_0_30' THEN c.reference_balance ELSE 0 END), 0.00) AS due_0_30,
    COALESCE(SUM(CASE WHEN c.bucket_category = 'DUE_31_60' THEN c.reference_balance ELSE 0 END), 0.00) AS due_31_60,
    COALESCE(SUM(CASE WHEN c.bucket_category = 'DUE_GT_60' THEN c.reference_balance ELSE 0 END), 0.00) AS due_gt_60,
    COALESCE(SUM(CASE WHEN c.bucket_category = 'NO_DUE_DATE' THEN c.reference_balance ELSE 0 END), 0.00) AS no_due_date_amount,
    COALESCE(SUM(CASE WHEN c.bucket_category = 'FREE_CREDIT' THEN c.reference_balance ELSE 0 END), 0.00) AS free_credits_amount,
    COALESCE(SUM(CASE WHEN c.reference_balance > 0 THEN c.reference_balance ELSE 0 END), 0.00) AS total_pending_debt,
    COALESCE(SUM(c.reference_balance), 0.00) AS net_total_balance,
    c.strict_due_date_discount,
    c.discount_payment_note,
    min(CASE WHEN c.reference_balance > 0 THEN c.due_date ELSE NULL END) AS min_due_date,
    bool_or(c.reference_balance > 0 AND c.due_date IS NULL) AS has_no_due_date_docs
  FROM classified c
  GROUP BY c.supplier_id, c.supplier_trade_name, c.supplier_tax_id, c.currency, c.strict_due_date_discount, c.discount_payment_note
  ORDER BY c.supplier_trade_name, c.currency;
$function$;

-- rpc_get_payment_projection con beneficio pago puntual y fechas
DROP FUNCTION IF EXISTS public.rpc_get_payment_projection(date, date, date);

CREATE FUNCTION public.rpc_get_payment_projection(
    p_cutoff_date date DEFAULT CURRENT_DATE, 
    p_date_from date DEFAULT NULL::date, 
    p_date_to date DEFAULT NULL::date
)
RETURNS TABLE(
    supplier_id bigint, 
    supplier_trade_name text, 
    supplier_tax_id character varying, 
    currency character varying, 
    bucket_type text, 
    week_start date, 
    week_end date, 
    amount numeric, 
    doc_count bigint,
    strict_due_date_discount boolean,
    discount_payment_note text,
    min_due_date date,
    has_no_due_date_docs boolean
)
LANGUAGE plpgsql
STABLE
AS $function$
BEGIN
  IF p_date_from IS NOT NULL AND p_date_to IS NOT NULL AND p_date_from > p_date_to THEN
    RAISE EXCEPTION 'Rango de fechas inválido: p_date_from (%) debe ser menor o igual a p_date_to (%)', p_date_from, p_date_to;
  END IF;

  RETURN QUERY
  WITH filtered_debt AS (
    SELECT 
      b.supplier_id,
      b.supplier_trade_name,
      b.supplier_tax_id,
      b.strict_due_date_discount,
      b.discount_payment_note,
      b.currency,
      b.due_date,
      b.reference_balance
    FROM public.v_open_reference_balances b
    WHERE b.reference_balance > 0
      AND (
        (p_date_from IS NULL AND p_date_to IS NULL)
        OR
        (
          b.due_date IS NOT NULL 
          AND b.due_date >= COALESCE(p_date_from, '-infinity'::DATE)
          AND b.due_date <= COALESCE(p_date_to, 'infinity'::DATE)
        )
      )
  ),
  bucketed AS (
    SELECT 
      f.supplier_id,
      f.supplier_trade_name,
      f.supplier_tax_id,
      f.strict_due_date_discount,
      f.discount_payment_note,
      f.currency,
      f.due_date,
      f.reference_balance,
      CASE 
        WHEN f.due_date IS NULL THEN 'NO_DUE_DATE'
        WHEN f.due_date < p_cutoff_date THEN 'OVERDUE'
        ELSE 'WEEK'
      END AS b_type,
      CASE 
        WHEN f.due_date >= p_cutoff_date THEN DATE_TRUNC('week', f.due_date)::DATE
        ELSE NULL
      END AS w_start,
      CASE 
        WHEN f.due_date >= p_cutoff_date THEN (DATE_TRUNC('week', f.due_date) + INTERVAL '6 days')::DATE
        ELSE NULL
      END AS w_end
    FROM filtered_debt f
  )
  SELECT 
    k.supplier_id,
    k.supplier_trade_name,
    k.supplier_tax_id,
    k.currency,
    k.b_type AS bucket_type,
    k.w_start AS week_start,
    k.w_end AS week_end,
    SUM(k.reference_balance)::NUMERIC(15,2) AS amount,
    COUNT(*)::BIGINT AS doc_count,
    k.strict_due_date_discount,
    k.discount_payment_note,
    min(k.due_date) AS min_due_date,
    bool_or(k.due_date IS NULL) AS has_no_due_date_docs
  FROM bucketed k
  GROUP BY k.supplier_id, k.supplier_trade_name, k.supplier_tax_id, k.currency, k.b_type, k.w_start, k.w_end, k.strict_due_date_discount, k.discount_payment_note
  ORDER BY 
    k.supplier_trade_name, 
    k.currency, 
    CASE k.b_type WHEN 'OVERDUE' THEN 1 WHEN 'WEEK' THEN 2 WHEN 'NO_DUE_DATE' THEN 3 ELSE 4 END,
    k.w_start;
END;
$function$;

-- rpc_get_open_documents_detail con archivos y pago puntual
DROP FUNCTION IF EXISTS public.rpc_get_open_documents_detail(bigint, character varying, text, text, date, date, date, date);

CREATE FUNCTION public.rpc_get_open_documents_detail(
    p_supplier_id bigint, 
    p_currency character varying, 
    p_context text, 
    p_bucket_code text DEFAULT NULL::text, 
    p_cutoff_date date DEFAULT CURRENT_DATE, 
    p_week_start date DEFAULT NULL::date, 
    p_date_from date DEFAULT NULL::date, 
    p_date_to date DEFAULT NULL::date
)
RETURNS TABLE(
    document_id bigint, 
    supplier_id bigint, 
    supplier_trade_name text, 
    human_reference character varying, 
    document_type_code character varying, 
    document_type_name character varying, 
    balance_nature character varying, 
    issue_date date, 
    due_date date, 
    currency character varying, 
    total_amount numeric, 
    reference_balance numeric, 
    concept text, 
    notes text,
    strict_due_date_discount boolean,
    discount_payment_note text,
    files_count integer,
    primary_file_mime text
)
LANGUAGE plpgsql
STABLE
AS $function$
BEGIN
  IF p_context = 'AGING' THEN
    RETURN QUERY
    SELECT 
      b.document_id,
      b.supplier_id,
      b.supplier_trade_name,
      b.human_reference,
      b.document_type_code,
      b.document_type_name,
      b.balance_nature::VARCHAR,
      b.issue_date,
      b.due_date,
      b.currency,
      b.total_amount,
      b.reference_balance,
      b.concept,
      b.notes,
      b.strict_due_date_discount,
      b.discount_payment_note,
      COALESCE(f.files_count, 0)::integer AS files_count,
      f.primary_file_mime
    FROM public.v_open_reference_balances b
    LEFT JOIN (
        SELECT df.document_id, count(*)::integer AS files_count,
               min(df.mime_type) FILTER (WHERE df.file_category IN ('ORIGINAL', 'INVOICE_PDF', 'INVOICE_IMAGE')) AS primary_file_mime
        FROM public.document_files df
        GROUP BY df.document_id
    ) f ON f.document_id = b.document_id
    WHERE b.supplier_id = p_supplier_id
      AND b.currency = p_currency
      AND (
        p_bucket_code IS NULL OR p_bucket_code = 'ALL' OR
        (p_bucket_code = 'NO_DUE_DATE' AND b.reference_balance > 0 AND b.due_date IS NULL) OR
        (p_bucket_code = 'OVERDUE_GT_60' AND b.reference_balance > 0 AND b.due_date < (p_cutoff_date - 60)) OR
        (p_bucket_code = 'OVERDUE_31_60' AND b.reference_balance > 0 AND b.due_date >= (p_cutoff_date - 60) AND b.due_date <= (p_cutoff_date - 31)) OR
        (p_bucket_code = 'OVERDUE_1_30' AND b.reference_balance > 0 AND b.due_date >= (p_cutoff_date - 30) AND b.due_date <= (p_cutoff_date - 1)) OR
        (p_bucket_code = 'DUE_0_30' AND b.reference_balance > 0 AND b.due_date >= p_cutoff_date AND b.due_date <= (p_cutoff_date + 30)) OR
        (p_bucket_code = 'DUE_31_60' AND b.reference_balance > 0 AND b.due_date >= (p_cutoff_date + 31) AND b.due_date <= (p_cutoff_date + 60)) OR
        (p_bucket_code = 'DUE_GT_60' AND b.reference_balance > 0 AND b.due_date > (p_cutoff_date + 60)) OR
        (p_bucket_code = 'FREE_CREDIT' AND b.reference_balance < 0)
      )
    ORDER BY b.due_date NULLS LAST, b.issue_date, b.document_id;

  ELSE -- PROJECTION
    RETURN QUERY
    SELECT 
      b.document_id,
      b.supplier_id,
      b.supplier_trade_name,
      b.human_reference,
      b.document_type_code,
      b.document_type_name,
      b.balance_nature::VARCHAR,
      b.issue_date,
      b.due_date,
      b.currency,
      b.total_amount,
      b.reference_balance,
      b.concept,
      b.notes,
      b.strict_due_date_discount,
      b.discount_payment_note,
      COALESCE(f.files_count, 0)::integer AS files_count,
      f.primary_file_mime
    FROM public.v_open_reference_balances b
    LEFT JOIN (
        SELECT df.document_id, count(*)::integer AS files_count,
               min(df.mime_type) FILTER (WHERE df.file_category IN ('ORIGINAL', 'INVOICE_PDF', 'INVOICE_IMAGE')) AS primary_file_mime
        FROM public.document_files df
        GROUP BY df.document_id
    ) f ON f.document_id = b.document_id
    WHERE b.supplier_id = p_supplier_id
      AND b.currency = p_currency
      AND b.reference_balance > 0
      AND (
        (p_date_from IS NULL AND p_date_to IS NULL)
        OR
        (
          b.due_date IS NOT NULL 
          AND b.due_date >= COALESCE(p_date_from, '-infinity'::DATE)
          AND b.due_date <= COALESCE(p_date_to, 'infinity'::DATE)
        )
      )
      AND (
        (p_bucket_code = 'NO_DUE_DATE' AND b.due_date IS NULL) OR
        (p_bucket_code = 'OVERDUE' AND b.due_date IS NOT NULL AND b.due_date < p_cutoff_date) OR
        (p_bucket_code = 'WEEK' AND b.due_date IS NOT NULL AND b.due_date >= p_cutoff_date AND DATE_TRUNC('week', b.due_date)::DATE = p_week_start) OR
        (p_bucket_code = 'ALL')
      )
    ORDER BY b.due_date NULLS LAST, b.issue_date, b.document_id;
  END IF;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 16. PROCEDIMIENTO REPRODUCIBLE DE LIMPIEZA DE CARGAS ABANDONADAS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_get_abandoned_uploads_for_cleanup(p_retention_days integer DEFAULT 7)
RETURNS TABLE (
    file_id bigint,
    storage_path text,
    created_at timestamptz,
    file_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT has_permission('system.manage') THEN
        RAISE EXCEPTION 'Permiso denegado: Se requiere "system.manage" para inspeccionar cargas abandonadas.';
    END IF;

    RETURN QUERY
    SELECT 
        df.id AS file_id,
        df.storage_path,
        df.created_at,
        df.file_name
    FROM public.document_files df
    WHERE df.document_id IS NULL
      AND df.created_at < (clock_timestamp() - (p_retention_days || ' days')::interval)
      AND NOT EXISTS (
          SELECT 1 FROM public.document_upload_sessions s
          WHERE s.file_id = df.id AND (s.status = 'PENDING' OR s.expires_at > clock_timestamp())
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.document_ai_extractions e
          WHERE e.file_id = df.id AND e.document_id IS NOT NULL
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.document_files child
          WHERE child.parent_file_id = df.id
      );
END;
$$;

-- ----------------------------------------------------------------------------
-- 17. PERMISOS Y ROLES (REUTILIZACIÓN EXACTA DE LOS 18 PERMISOS EXISTENTES)
-- ----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON public.document_numbering_series TO authenticated, service_role;
GRANT SELECT ON public.document_numbering_series_adjustments TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.fn_allocate_internal_document_number(bigint, varchar, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_adjust_numbering_series(bigint, bigint, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_create_and_confirm_document(bigint, smallint, bigint, varchar, integer, bigint, varchar, date, date, numeric, varchar, text, text, text, bigint, bigint, jsonb, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_create_and_confirm_op(bigint, smallint, integer, integer, varchar, date, numeric, text, text, jsonb, text, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_apply_existing_balance(bigint, jsonb, text, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_reverse_imputation(bigint, text, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_get_document_files(bigint, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_get_abandoned_uploads_for_cleanup(integer) TO authenticated, service_role;
