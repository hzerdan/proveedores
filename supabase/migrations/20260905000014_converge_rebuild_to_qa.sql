-- ==============================================================================
-- MIGRACIÓN: 20260905000014_converge_rebuild_to_qa.sql
-- PROYECTO: Sistema de Cuentas Corrientes de Proveedores
-- OBJETIVO: Convergencia estructural exacta e idempotente de REBUILD TEST hacia QA
-- MODELO DE ESTADOS:
--   ESTADO_A (QA CANÓNICO):
--     Validación exhaustiva y estricta de todos los objetos canónicos de QA.
--     Neutralidad física absoluta: Cero operaciones DDL o DML.
--   ESTADO_B (REBUILD POST-00013):
--     Transformación estructural segura hacia ESTADO_A (vistas, tablas _bak, RLS y funciones).
--   ESTADO_C (ESTADO INCOMPLETO O DESCONOCIDO):
--     Aborto inmediato mediante RAISE EXCEPTION sin alterar la base de datos.
-- ==============================================================================

DO $migration$
DECLARE
    -- Variables de detección preliminar
    v_has_doc_apps boolean;
    v_has_bak_doc_apps boolean;
    v_has_app_rev boolean;
    v_has_bak_app_rev boolean;
    v_has_v_active_apps boolean;
    v_has_v_doc_bal boolean;
    v_summary_col_count integer;
    v_candidate_state text;

    -- Variables de validación exhaustiva para ESTADO_A
    v_missing_views text[];
    v_col_mismatch text;
    v_viewdef text;
    v_fn1_valid boolean;
    v_fn2_valid boolean;
    v_fndef1 text;
    v_fndef2 text;
    v_fndef1_norm text;
    v_fndef2_norm text;
    v_fndef1_hash text;
    v_fndef2_hash text;
    v_post_policy_count integer;
    v_post_view_count integer;
    v_post_col_count integer;
    v_post_fn1_hash text;
    v_post_fn2_hash text;
    v_policy_issues text;
    v_upload_sessions_rls boolean;
    v_bak_constraints_count integer;
    v_bak_indexes_count integer;
    v_bak_sequences_count integer;
    v_bak_id_cols_valid integer;
    v_bak_app_rev_cols_valid integer;
    v_bak_doc_apps_cols_valid integer;
    v_acct_mov_created_at_default text;
    v_apl_valid integer;

BEGIN
    -- =========================================================================
    -- FASE 1: INSPECCIÓN PRELIMINAR Y DETECCIÓN DE COLISIONES
    -- =========================================================================
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'document_applications'
    ) INTO v_has_doc_apps;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = '_bak_document_applications'
    ) INTO v_has_bak_doc_apps;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'application_reversals'
    ) INTO v_has_app_rev;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = '_bak_application_reversals'
    ) INTO v_has_bak_app_rev;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.views 
        WHERE table_schema = 'public' AND table_name = 'v_active_applications'
    ) INTO v_has_v_active_apps;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.views 
        WHERE table_schema = 'public' AND table_name = 'v_document_balances'
    ) INTO v_has_v_doc_bal;

    SELECT count(*) INTO v_summary_col_count
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'v_supplier_account_summary';

    -- Detección de colisiones estructurales o vacíos en tablas heredadas
    IF (v_has_doc_apps AND v_has_bak_doc_apps) OR (v_has_app_rev AND v_has_bak_app_rev) THEN
        RAISE EXCEPTION 'ESTADO_C (DESCONOCIDO): Colision detectada. Existen simultaneamente tablas operativas y tablas _bak_*.';
    END IF;

    IF (NOT v_has_doc_apps AND NOT v_has_bak_doc_apps) OR (NOT v_has_app_rev AND NOT v_has_bak_app_rev) THEN
        RAISE EXCEPTION 'ESTADO_C (DESCONOCIDO): No se encontraron tablas de aplicaciones (ni operativas ni _bak_*).';
    END IF;

    -- Detección de candidato general
    IF v_has_bak_doc_apps AND v_has_bak_app_rev AND NOT v_has_v_active_apps AND NOT v_has_v_doc_bal AND v_summary_col_count = 10 THEN
        v_candidate_state := 'ESTADO_A';
    ELSIF v_has_doc_apps AND v_has_app_rev AND v_has_v_active_apps AND v_has_v_doc_bal AND v_summary_col_count = 14 THEN
        v_candidate_state := 'ESTADO_B';
    ELSE
        RAISE EXCEPTION 'ESTADO_C (DESCONOCIDO): Estado preliminar no homologado. Tablas (_bak_apps: %, apps: %), Vistas (active: %, bal: %, summary_cols: %).',
            v_has_bak_doc_apps, v_has_doc_apps, v_has_v_active_apps, v_has_v_doc_bal, v_summary_col_count;
    END IF;

    RAISE NOTICE 'Deteccion preliminar: Forma general clasificada como candidato %', v_candidate_state;

    -- =========================================================================
    -- FASE 2: VALIDACIÓN EXHAUSTIVA DE ESTADO_A (QA CANÓNICO)
    -- =========================================================================
    IF v_candidate_state = 'ESTADO_A' THEN
        RAISE NOTICE 'Iniciando validacion exhaustiva de definiciones para ESTADO_A...';

        -- 1. Validar existencia de las 6 vistas canónicas de QA
        SELECT array_agg(v) INTO v_missing_views
        FROM (
            SELECT unnest(ARRAY[
                'v_active_supplier_sellers',
                'v_document_ledger',
                'v_document_summary',
                'v_open_reference_balances',
                'v_seller_account_summary',
                'v_supplier_account_summary'
            ]) AS v
        ) expected
        WHERE NOT EXISTS (
            SELECT 1 FROM information_schema.views 
            WHERE table_schema = 'public' AND table_name = expected.v
        );

        IF v_missing_views IS NOT NULL AND array_length(v_missing_views, 1) > 0 THEN
            RAISE EXCEPTION 'ESTADO_C: Faltan vistas canonicas de QA: %', array_to_string(v_missing_views, ', ');
        END IF;

        -- 2. Validar columnas exactas de v_supplier_account_summary (10 columnas, nombre, tipo, orden)
        WITH expected_cols(ord, col_name, d_type) AS (
            VALUES
            (1, 'supplier_id', 'bigint'),
            (2, 'trade_name', 'text'),
            (3, 'legal_name', 'text'),
            (4, 'tax_id', 'character varying'),
            (5, 'currency', 'character varying'),
            (6, 'total_debits', 'numeric'),
            (7, 'total_credits', 'numeric'),
            (8, 'total_pending_debt', 'numeric'),
            (9, 'total_available_credit', 'numeric'),
            (10, 'net_account_balance', 'numeric')
        ), actual_cols AS (
            SELECT ordinal_position as ord, column_name as col_name, data_type as d_type
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'v_supplier_account_summary'
        )
        SELECT string_agg(format('Col %s (Esperado: %s %s, Actual: %s %s)', e.ord, e.col_name, e.d_type, a.col_name, a.d_type), '; ')
        INTO v_col_mismatch
        FROM expected_cols e
        FULL OUTER JOIN actual_cols a ON e.ord = a.ord
        WHERE e.col_name IS DISTINCT FROM a.col_name OR e.d_type IS DISTINCT FROM a.d_type;

        IF v_col_mismatch IS NOT NULL THEN
            RAISE EXCEPTION 'ESTADO_C: Columnas de v_supplier_account_summary no coinciden con QA canonico: %', v_col_mismatch;
        END IF;

        -- 3. Validar definicion SQL normalizada de v_supplier_account_summary
        v_viewdef := regexp_replace(pg_get_viewdef('public.v_supplier_account_summary'::regclass, true), '\s+', ' ', 'g');
        IF v_viewdef NOT LIKE '%FROM account_movements m GROUP BY m.supplier_id, m.currency%'
           OR v_viewdef NOT LIKE '%FROM suppliers s JOIN supplier_metrics sm ON sm.supplier_id = s.id%'
           OR v_viewdef NOT LIKE '%net_account_balance%'
           OR v_viewdef LIKE '%v_document_balances%' THEN
            RAISE EXCEPTION 'ESTADO_C: La definicion SQL de v_supplier_account_summary no coincide con la canonica de QA.';
        END IF;

        -- 4. Validar exhaustivamente las dos sobrecargas históricas en pg_proc (firma, seguridad, owner, hashes, defaults y grants)
        SELECT EXISTS (
            SELECT 1 FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            JOIN pg_language l ON l.oid = p.prolang
            WHERE n.nspname = 'public' 
              AND p.proname = 'rpc_create_and_confirm_document'
              AND pg_get_function_identity_arguments(p.oid) = 'p_supplier_id bigint, p_document_type_id smallint, p_letter character varying, p_point_of_sale integer, p_document_number integer, p_human_reference character varying, p_issue_date date, p_due_date date, p_total_amount numeric, p_concept text, p_notes text, p_override_reason text'
              AND p.prosecdef = true
              AND l.lanname = 'plpgsql'
              AND p.proowner = 'postgres'::regrole
        ) INTO v_fn1_valid;

        SELECT EXISTS (
            SELECT 1 FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            JOIN pg_language l ON l.oid = p.prolang
            WHERE n.nspname = 'public' 
              AND p.proname = 'rpc_create_and_confirm_op'
              AND pg_get_function_identity_arguments(p.oid) = 'p_supplier_id bigint, p_document_type_id smallint, p_point_of_sale integer, p_document_number integer, p_human_reference character varying, p_issue_date date, p_total_amount numeric, p_concept text, p_notes text, p_imputations jsonb, p_override_reason text'
              AND p.prosecdef = true
              AND l.lanname = 'plpgsql'
              AND p.proowner = 'postgres'::regrole
        ) INTO v_fn2_valid;

        IF NOT v_fn1_valid OR NOT v_fn2_valid THEN
            RAISE EXCEPTION 'ESTADO_C: Faltan sobrecargas historicas en pg_proc o difieren en firma/seguridad/owner (doc: %, op: %).', v_fn1_valid, v_fn2_valid;
        END IF;

        -- Validar hash exacto y parámetros DEFAULT de rpc_create_and_confirm_document (12 params)
        SELECT pg_get_functiondef(p.oid) INTO v_fndef1
        FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'rpc_create_and_confirm_document'
          AND pg_get_function_identity_arguments(p.oid) = 'p_supplier_id bigint, p_document_type_id smallint, p_letter character varying, p_point_of_sale integer, p_document_number integer, p_human_reference character varying, p_issue_date date, p_due_date date, p_total_amount numeric, p_concept text, p_notes text, p_override_reason text';

        v_fndef1_norm := trim(regexp_replace(v_fndef1, '\s+', ' ', 'g'));
        v_fndef1_hash := encode(sha256(convert_to(v_fndef1_norm, 'UTF8')), 'hex');

        IF v_fndef1_hash <> '1697c414dd56f1d8bc1e33340a7a90fde6ea6442f29139ac85b4d9f8bb855756'
           OR v_fndef1 NOT LIKE '%p_concept text DEFAULT NULL::text%'
           OR v_fndef1 NOT LIKE '%p_notes text DEFAULT NULL::text%'
           OR v_fndef1 NOT LIKE '%p_override_reason text DEFAULT NULL::text%' THEN
            RAISE EXCEPTION 'ESTADO_C: La definicion o hash de rpc_create_and_confirm_document(12 params) no coincide con QA canonico. Hash obtenido: %', v_fndef1_hash;
        END IF;

        -- Validar hash exacto y parámetros DEFAULT de rpc_create_and_confirm_op (11 params)
        SELECT pg_get_functiondef(p.oid) INTO v_fndef2
        FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'rpc_create_and_confirm_op'
          AND pg_get_function_identity_arguments(p.oid) = 'p_supplier_id bigint, p_document_type_id smallint, p_point_of_sale integer, p_document_number integer, p_human_reference character varying, p_issue_date date, p_total_amount numeric, p_concept text, p_notes text, p_imputations jsonb, p_override_reason text';

        v_fndef2_norm := trim(regexp_replace(v_fndef2, '\s+', ' ', 'g'));
        v_fndef2_hash := encode(sha256(convert_to(v_fndef2_norm, 'UTF8')), 'hex');

        IF v_fndef2_hash <> '98a9956fa027ff7a55abeea1fa6640a0af96e440130a67340f3c2f1593a430b9'
           OR v_fndef2 NOT LIKE '%p_imputations jsonb DEFAULT %' THEN
            RAISE EXCEPTION 'ESTADO_C: La definicion o hash de rpc_create_and_confirm_op(11 params) no coincide con QA canonico. Hash obtenido: %', v_fndef2_hash;
        END IF;

        -- Validar grants EXECUTE sobre ambas sobrecargas específicas
        IF NOT (
            has_function_privilege('public', 'public.rpc_create_and_confirm_document(bigint, smallint, character varying, integer, integer, character varying, date, date, numeric, text, text, text)'::regprocedure, 'EXECUTE') AND
            has_function_privilege('anon', 'public.rpc_create_and_confirm_document(bigint, smallint, character varying, integer, integer, character varying, date, date, numeric, text, text, text)'::regprocedure, 'EXECUTE') AND
            has_function_privilege('authenticated', 'public.rpc_create_and_confirm_document(bigint, smallint, character varying, integer, integer, character varying, date, date, numeric, text, text, text)'::regprocedure, 'EXECUTE') AND
            has_function_privilege('service_role', 'public.rpc_create_and_confirm_document(bigint, smallint, character varying, integer, integer, character varying, date, date, numeric, text, text, text)'::regprocedure, 'EXECUTE') AND
            has_function_privilege('public', 'public.rpc_create_and_confirm_op(bigint, smallint, integer, integer, character varying, date, numeric, text, text, jsonb, text)'::regprocedure, 'EXECUTE') AND
            has_function_privilege('anon', 'public.rpc_create_and_confirm_op(bigint, smallint, integer, integer, character varying, date, numeric, text, text, jsonb, text)'::regprocedure, 'EXECUTE') AND
            has_function_privilege('authenticated', 'public.rpc_create_and_confirm_op(bigint, smallint, integer, integer, character varying, date, numeric, text, text, jsonb, text)'::regprocedure, 'EXECUTE') AND
            has_function_privilege('service_role', 'public.rpc_create_and_confirm_op(bigint, smallint, integer, integer, character varying, date, numeric, text, text, jsonb, text)'::regprocedure, 'EXECUTE')
        ) THEN
            RAISE EXCEPTION 'ESTADO_C: Privilegios EXECUTE de sobrecargas historicas no coinciden con QA.';
        END IF;

        -- 5. Validar exhaustivamente las 63 políticas canónicas de QA
        WITH expected_policies(schemaname, tablename, policyname, cmd, roles_arr, qual, with_check) AS (
            VALUES
            ('public', 'account_movements', 'account_movements_insert', 'INSERT', ARRAY['authenticated'], NULL, 'true'),
            ('public', 'account_movements', 'account_movements_insert_anon', 'INSERT', ARRAY['anon'], NULL, 'true'),
            ('public', 'account_movements', 'account_movements_select', 'SELECT', ARRAY['authenticated'], 'true', NULL),
            ('public', 'account_movements', 'account_movements_select_anon', 'SELECT', ARRAY['anon'], 'true', NULL),
            ('public', 'document_ai_extractions', 'ai_extractions_insert', 'INSERT', ARRAY['anon', 'authenticated'], NULL, 'has_permission(''documents.create''::text)'),
            ('public', 'document_ai_extractions', 'ai_extractions_select', 'SELECT', ARRAY['anon', 'authenticated'], '(has_permission(''documents.view''::text) OR has_permission(''audit.view''::text))', NULL),
            ('public', 'document_ai_extractions', 'ai_extractions_update', 'UPDATE', ARRAY['anon', 'authenticated'], '(has_permission(''documents.ai_review''::text) OR has_permission(''documents.create''::text))', NULL),
            ('public', 'document_files', 'files_insert', 'INSERT', ARRAY['anon', 'authenticated'], NULL, 'has_permission(''documents.create''::text)'),
            ('public', 'document_files', 'files_select', 'SELECT', ARRAY['anon', 'authenticated'], 'has_permission(''documents.view''::text)', NULL),
            ('public', 'document_files', 'files_update', 'UPDATE', ARRAY['anon', 'authenticated'], 'has_permission(''documents.create''::text)', 'has_permission(''documents.create''::text)'),
            ('public', 'document_seller_history', 'document_seller_history_insert', 'INSERT', ARRAY['anon', 'authenticated'], NULL, '(has_permission(''documents.assign_seller''::text) OR has_permission(''documents.change_seller''::text))'),
            ('public', 'document_seller_history', 'document_seller_history_select', 'SELECT', ARRAY['anon', 'authenticated'], '(has_permission(''documents.view''::text) OR has_permission(''audit.view''::text))', NULL),
            ('public', 'document_types', 'document_types_manage', 'ALL', ARRAY['anon', 'authenticated'], 'has_permission(''system.manage''::text)', 'has_permission(''system.manage''::text)'),
            ('public', 'document_types', 'document_types_select', 'SELECT', ARRAY['authenticated'], 'true', NULL),
            ('public', 'document_types', 'document_types_select_anon', 'SELECT', ARRAY['anon'], 'true', NULL),
            ('public', 'document_upload_sessions', 'upload_sessions_all', 'ALL', ARRAY['anon', 'authenticated'], 'true', 'true'),
            ('public', 'documents', 'documents_insert', 'INSERT', ARRAY['authenticated'], NULL, 'has_permission(''documents.create''::text)'),
            ('public', 'documents', 'documents_insert_anon', 'INSERT', ARRAY['anon'], NULL, 'has_permission(''documents.create''::text)'),
            ('public', 'documents', 'documents_select', 'SELECT', ARRAY['authenticated'], 'has_permission(''documents.view''::text)', NULL),
            ('public', 'documents', 'documents_select_anon', 'SELECT', ARRAY['anon'], 'true', NULL),
            ('public', 'documents', 'documents_update_anon', 'UPDATE', ARRAY['anon'], 'has_permission(''documents.create''::text)', NULL),
            ('public', 'documents', 'documents_update_draft_or_meta', 'UPDATE', ARRAY['authenticated'], '((((status)::text = ''DRAFT''::text) AND has_permission(''documents.create''::text)) OR (((status)::text = ''CONFIRMED''::text) AND has_permission(''documents.edit_meta''::text)))', NULL),
            ('public', 'duplicate_override_logs', 'dup_logs_insert', 'INSERT', ARRAY['authenticated'], NULL, 'has_permission(''documents.duplicate_override''::text)'),
            ('public', 'duplicate_override_logs', 'dup_logs_select', 'SELECT', ARRAY['authenticated'], '(has_permission(''audit.view''::text) OR has_permission(''documents.view''::text))', NULL),
            ('public', 'duplicate_override_logs', 'duplicate_override_logs_insert_anon', 'INSERT', ARRAY['anon'], NULL, 'has_permission(''documents.duplicate_override''::text)'),
            ('public', 'duplicate_override_logs', 'duplicate_override_logs_select_anon', 'SELECT', ARRAY['anon'], 'true', NULL),
            ('public', 'permissions', 'permissions_select_anon', 'SELECT', ARRAY['anon'], 'true', NULL),
            ('public', 'permissions', 'permissions_select_authenticated', 'SELECT', ARRAY['authenticated'], 'true', NULL),
            ('public', 'profiles', 'profiles_manage_admin', 'ALL', ARRAY['authenticated'], 'has_permission(''system.manage''::text)', NULL),
            ('public', 'profiles', 'profiles_select_anon', 'SELECT', ARRAY['anon'], 'true', NULL),
            ('public', 'profiles', 'profiles_select_authenticated', 'SELECT', ARRAY['authenticated'], 'true', NULL),
            ('public', 'role_permissions', 'role_permissions_select_anon', 'SELECT', ARRAY['anon'], 'true', NULL),
            ('public', 'role_permissions', 'role_permissions_select_authenticated', 'SELECT', ARRAY['authenticated'], 'true', NULL),
            ('public', 'roles', 'rbac_manage_admin', 'ALL', ARRAY['authenticated'], 'has_permission(''system.manage''::text)', NULL),
            ('public', 'roles', 'roles_permissions_select_authenticated', 'SELECT', ARRAY['authenticated'], 'true', NULL),
            ('public', 'roles', 'roles_select_anon', 'SELECT', ARRAY['anon'], 'true', NULL),
            ('public', 'sellers', 'sellers_delete', 'DELETE', ARRAY['anon', 'authenticated'], 'has_permission(''sellers.manage''::text)', NULL),
            ('public', 'sellers', 'sellers_insert', 'INSERT', ARRAY['anon', 'authenticated'], NULL, 'has_permission(''sellers.manage''::text)'),
            ('public', 'sellers', 'sellers_manage', 'ALL', ARRAY['anon', 'authenticated'], 'has_permission(''sellers.manage''::text)', 'has_permission(''sellers.manage''::text)'),
            ('public', 'sellers', 'sellers_select', 'SELECT', ARRAY['anon', 'authenticated'], '(has_permission(''sellers.view''::text) OR has_permission(''suppliers.view''::text) OR has_permission(''documents.view''::text))', NULL),
            ('public', 'sellers', 'sellers_update', 'UPDATE', ARRAY['anon', 'authenticated'], 'has_permission(''sellers.manage''::text)', 'has_permission(''sellers.manage''::text)'),
            ('public', 'supplier_contacts', 'contacts_manage', 'ALL', ARRAY['authenticated'], 'has_permission(''suppliers.manage''::text)', NULL),
            ('public', 'supplier_contacts', 'contacts_select', 'SELECT', ARRAY['authenticated'], '(has_permission(''suppliers.view''::text) OR has_permission(''documents.view''::text))', NULL),
            ('public', 'supplier_contacts', 'supplier_contacts_delete_anon', 'DELETE', ARRAY['anon'], 'has_permission(''suppliers.manage''::text)', NULL),
            ('public', 'supplier_contacts', 'supplier_contacts_insert_anon', 'INSERT', ARRAY['anon'], NULL, 'has_permission(''suppliers.manage''::text)'),
            ('public', 'supplier_contacts', 'supplier_contacts_select_anon', 'SELECT', ARRAY['anon'], 'true', NULL),
            ('public', 'supplier_contacts', 'supplier_contacts_update_anon', 'UPDATE', ARRAY['anon'], 'has_permission(''suppliers.manage''::text)', NULL),
            ('public', 'supplier_sellers', 'supplier_sellers_delete', 'DELETE', ARRAY['anon', 'authenticated'], '(has_permission(''seller_supplier.manage''::text) OR has_permission(''suppliers.manage''::text))', NULL),
            ('public', 'supplier_sellers', 'supplier_sellers_insert', 'INSERT', ARRAY['anon', 'authenticated'], NULL, '(has_permission(''seller_supplier.manage''::text) OR has_permission(''suppliers.manage''::text))'),
            ('public', 'supplier_sellers', 'supplier_sellers_manage', 'ALL', ARRAY['anon', 'authenticated'], '(has_permission(''seller_supplier.manage''::text) OR has_permission(''suppliers.manage''::text))', '(has_permission(''seller_supplier.manage''::text) OR has_permission(''suppliers.manage''::text))'),
            ('public', 'supplier_sellers', 'supplier_sellers_select', 'SELECT', ARRAY['anon', 'authenticated'], '(has_permission(''sellers.view''::text) OR has_permission(''suppliers.view''::text) OR has_permission(''documents.view''::text))', NULL),
            ('public', 'supplier_sellers', 'supplier_sellers_update', 'UPDATE', ARRAY['anon', 'authenticated'], '(has_permission(''seller_supplier.manage''::text) OR has_permission(''suppliers.manage''::text))', '(has_permission(''seller_supplier.manage''::text) OR has_permission(''suppliers.manage''::text))'),
            ('public', 'suppliers', 'suppliers_insert', 'INSERT', ARRAY['authenticated'], NULL, 'has_permission(''suppliers.manage''::text)'),
            ('public', 'suppliers', 'suppliers_insert_anon', 'INSERT', ARRAY['anon'], NULL, 'has_permission(''suppliers.manage''::text)'),
            ('public', 'suppliers', 'suppliers_select', 'SELECT', ARRAY['authenticated'], '(has_permission(''suppliers.view''::text) OR has_permission(''documents.view''::text))', NULL),
            ('public', 'suppliers', 'suppliers_select_anon', 'SELECT', ARRAY['anon'], 'true', NULL),
            ('public', 'suppliers', 'suppliers_update', 'UPDATE', ARRAY['authenticated'], 'has_permission(''suppliers.manage''::text)', NULL),
            ('public', 'suppliers', 'suppliers_update_anon', 'UPDATE', ARRAY['anon'], 'has_permission(''suppliers.manage''::text)', NULL),
            ('public', 'user_roles', 'user_roles_select_anon', 'SELECT', ARRAY['anon'], 'true', NULL),
            ('public', 'user_roles', 'user_roles_select_authenticated', 'SELECT', ARRAY['authenticated'], 'true', NULL),
            ('storage', 'objects', 'supplier_docs_insert', 'INSERT', ARRAY['anon', 'authenticated'], NULL, '(bucket_id = ''supplier-documents''::text)'),
            ('storage', 'objects', 'supplier_docs_select', 'SELECT', ARRAY['anon', 'authenticated'], '(bucket_id = ''supplier-documents''::text)', NULL),
            ('storage', 'objects', 'supplier_docs_update', 'UPDATE', ARRAY['anon', 'authenticated'], '(bucket_id = ''supplier-documents''::text)', '(bucket_id = ''supplier-documents''::text)')
        ),
        actual_policies AS (
            SELECT schemaname, tablename, policyname, cmd, roles::text[] as roles_arr, qual, with_check
            FROM pg_policies
            WHERE schemaname IN ('public', 'storage')
        ),
        diff_missing AS (
            SELECT format('FALTA: %s.%s (%s)', e.schemaname, e.tablename, e.policyname) as issue
            FROM expected_policies e
            WHERE NOT EXISTS (
                SELECT 1 FROM actual_policies a
                WHERE a.schemaname = e.schemaname AND a.tablename = e.tablename AND a.policyname = e.policyname
            )
        ),
        diff_extra AS (
            SELECT format('SOBRA: %s.%s (%s)', a.schemaname, a.tablename, a.policyname) as issue
            FROM actual_policies a
            WHERE NOT EXISTS (
                SELECT 1 FROM expected_policies e
                WHERE e.schemaname = a.schemaname AND e.tablename = a.tablename AND e.policyname = a.policyname
            )
        ),
        diff_definition AS (
            SELECT format('DIFIERE: %s.%s (%s) [cmd: %s vs %s, roles: %s vs %s, qual: %s vs %s, check: %s vs %s]',
                e.schemaname, e.tablename, e.policyname,
                e.cmd, a.cmd,
                array_to_string(ARRAY(SELECT unnest(e.roles_arr) ORDER BY 1), ','),
                array_to_string(ARRAY(SELECT unnest(a.roles_arr) ORDER BY 1), ','),
                COALESCE(e.qual, 'NULL'), COALESCE(a.qual, 'NULL'),
                COALESCE(e.with_check, 'NULL'), COALESCE(a.with_check, 'NULL')
            ) as issue
            FROM expected_policies e
            JOIN actual_policies a ON e.schemaname = a.schemaname AND e.tablename = a.tablename AND e.policyname = a.policyname
            WHERE e.cmd <> a.cmd
               OR array_to_string(ARRAY(SELECT unnest(e.roles_arr) ORDER BY 1), ',') <> array_to_string(ARRAY(SELECT unnest(a.roles_arr) ORDER BY 1), ',')
               OR COALESCE(e.qual, '') <> COALESCE(a.qual, '')
               OR COALESCE(e.with_check, '') <> COALESCE(a.with_check, '')
        )
        SELECT string_agg(issue, E'\n') INTO v_policy_issues FROM (
            SELECT issue FROM diff_missing
            UNION ALL
            SELECT issue FROM diff_extra
            UNION ALL
            SELECT issue FROM diff_definition
        ) all_diffs;

        IF v_policy_issues IS NOT NULL THEN
            RAISE EXCEPTION 'ESTADO_C: Discrepancias detectadas en politicas RLS canonicas de QA:%', E'\n' || v_policy_issues;
        END IF;

        -- 6. Validar RLS en document_upload_sessions
        SELECT c.relrowsecurity INTO v_upload_sessions_rls
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'document_upload_sessions';

        IF v_upload_sessions_rls IS NOT TRUE THEN
            RAISE EXCEPTION 'ESTADO_C: document_upload_sessions no tiene RLS habilitado (relrowsecurity = false).';
        END IF;

        -- 7. Validar existencia de tablas de respaldo _bak_*
        IF NOT (v_has_bak_doc_apps AND v_has_bak_app_rev) THEN
            RAISE EXCEPTION 'ESTADO_C: Faltan tablas de respaldo _bak_document_applications o _bak_application_reversals.';
        END IF;

        -- 8. Validar ausencia de las 11 constraints en tablas _bak_*
        SELECT count(*) INTO v_bak_constraints_count
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' 
          AND c.relname IN ('_bak_document_applications', '_bak_application_reversals')
          AND con.conname IN (
              'application_reversals_pkey',
              'application_reversals_application_id_key',
              'application_reversals_application_id_fkey',
              'application_reversals_created_by_fkey',
              'application_reversals_reversal_document_id_fkey',
              'document_applications_pkey',
              'chk_document_applications_amount',
              'chk_document_applications_no_self',
              'document_applications_created_by_fkey',
              'document_applications_source_document_id_fkey',
              'document_applications_target_document_id_fkey'
          );

        IF v_bak_constraints_count > 0 THEN
            RAISE EXCEPTION 'ESTADO_C: Se detectaron % restricciones remanentes en tablas _bak_* (esperado: 0).', v_bak_constraints_count;
        END IF;

        -- 9. Validar ausencia de los 8 índices en tablas _bak_*
        SELECT count(*) INTO v_bak_indexes_count
        FROM pg_index idx
        JOIN pg_class i ON i.oid = idx.indexrelid
        JOIN pg_class c ON c.oid = idx.indrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname IN ('_bak_document_applications', '_bak_application_reversals')
          AND i.relname IN (
              'application_reversals_pkey',
              'application_reversals_application_id_key',
              'idx_app_reversals_app_id',
              'idx_app_reversals_rev_doc',
              'document_applications_pkey',
              'idx_doc_app_date',
              'idx_doc_app_source',
              'idx_doc_app_target'
          );

        IF v_bak_indexes_count > 0 THEN
            RAISE EXCEPTION 'ESTADO_C: Se detectaron % índices remanentes en tablas _bak_* (esperado: 0).', v_bak_indexes_count;
        END IF;

        -- 10. Validar ausencia de las 2 secuencias de tablas _bak_*
        SELECT count(*) INTO v_bak_sequences_count
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'S'
          AND c.relname IN ('application_reversals_id_seq', 'document_applications_id_seq');

        IF v_bak_sequences_count > 0 THEN
            RAISE EXCEPTION 'ESTADO_C: Se detectaron % secuencias remanentes de tablas _bak_* (esperado: 0).', v_bak_sequences_count;
        END IF;

        -- 11. Validar atributos de columnas id en tablas _bak_* (bigint, nullable, no identity, no default, no seq)
        SELECT count(*) INTO v_bak_id_cols_valid
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'id'
        LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
        WHERE n.nspname = 'public' 
          AND c.relname IN ('_bak_document_applications', '_bak_application_reversals')
          AND format_type(a.atttypid, a.atttypmod) = 'bigint'
          AND NOT a.attnotnull
          AND a.attidentity = ''
          AND d.adrelid IS NULL
          AND pg_get_serial_sequence('public.' || c.relname, 'id') IS NULL;

        IF v_bak_id_cols_valid <> 2 THEN
            RAISE EXCEPTION 'ESTADO_C: Las columnas id de tablas _bak_* no cumplen con los atributos canónicos (bigint, nullable, no identity, no default, no seq). Válidas: % (esperado: 2).', v_bak_id_cols_valid;
        END IF;

        -- 12. Validar columnas de _bak_application_reversals (nullable y sin default en created_at)
        SELECT count(*) INTO v_bak_app_rev_cols_valid
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid
        LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
        WHERE n.nspname = 'public' AND c.relname = '_bak_application_reversals'
          AND a.attname IN ('reversal_document_id', 'application_id', 'reversal_reason', 'created_by', 'created_at')
          AND NOT a.attnotnull
          AND (a.attname <> 'created_at' OR d.adrelid IS NULL);

        IF v_bak_app_rev_cols_valid <> 5 THEN
            RAISE EXCEPTION 'ESTADO_C: Las columnas de _bak_application_reversals no cumplen los atributos canónicos (nullable y sin default en created_at). Válidas: % (esperado: 5).', v_bak_app_rev_cols_valid;
        END IF;

        -- 13. Validar columnas de _bak_document_applications (nullable y sin default en application_date/created_at)
        SELECT count(*) INTO v_bak_doc_apps_cols_valid
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid
        LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
        WHERE n.nspname = 'public' AND c.relname = '_bak_document_applications'
          AND a.attname IN ('source_document_id', 'target_document_id', 'applied_amount', 'application_date', 'created_by', 'created_at')
          AND NOT a.attnotnull
          AND (a.attname NOT IN ('application_date', 'created_at') OR d.adrelid IS NULL);

        IF v_bak_doc_apps_cols_valid <> 6 THEN
            RAISE EXCEPTION 'ESTADO_C: Las columnas de _bak_document_applications no cumplen los atributos canónicos (nullable y sin default en application_date/created_at). Válidas: % (esperado: 6).', v_bak_doc_apps_cols_valid;
        END IF;

        -- 14. Validar default de account_movements.created_at = now()
        SELECT trim(regexp_replace(pg_get_expr(d.adbin, d.adrelid), '\s+', ' ', 'g')) INTO v_acct_mov_created_at_default
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'created_at'
        LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
        WHERE n.nspname = 'public' AND c.relname = 'account_movements';

        IF v_acct_mov_created_at_default <> 'now()' THEN
            RAISE EXCEPTION 'ESTADO_C: account_movements.created_at no posee el default canónico now() (detectado: %).', v_acct_mov_created_at_default;
        END IF;

        -- 15. Validar registro declarativo APL en document_types
        SELECT count(*) INTO v_apl_valid
        FROM public.document_types
        WHERE code = 'APL'
          AND description = 'Documento de transferencia de saldos preexistentes entre referencias (Suma Cero).'
          AND can_be_source_application IS TRUE
          AND can_be_target_application IS TRUE;

        IF v_apl_valid <> 1 THEN
            RAISE EXCEPTION 'ESTADO_C: document_types APL no coincide con los atributos canónicos de QA.';
        END IF;

        RAISE NOTICE 'CONFIRMACION ESTADO_A: Entorno 100%% homologado con QA canonico. Cero modificaciones DDL/DML ejecutadas.';
        RETURN;

    -- =========================================================================
    -- FASE 3: TRANSFORMACIÓN CONVERGENTE DE ESTADO_B (REBUILD POST-00013)
    -- =========================================================================
    ELSIF v_candidate_state = 'ESTADO_B' THEN
        RAISE NOTICE 'Iniciando transformacion desde ESTADO_B (REBUILD POST-00013) hacia ESTADO_A (QA CANONICO)...';

        -- Paso A: Eliminar vistas heredadas en orden estricto de dependencias SIN CASCADE
        DROP VIEW public.v_supplier_account_summary;
        DROP VIEW public.v_document_balances;
        DROP VIEW public.v_active_applications;

        -- Paso B: Recrear v_supplier_account_summary segun QA canónico (10 columnas basadas en account_movements)
        EXECUTE $vdef$
        CREATE VIEW public.v_supplier_account_summary AS
        WITH supplier_metrics AS (
            SELECT m.supplier_id,
                m.currency,
                COALESCE(sum(
                    CASE
                        WHEN m.amount > 0::numeric AND m.movement_type = 'ORIGIN'::text THEN m.amount
                        ELSE 0::numeric
                    END), 0.00) AS total_debits,
                COALESCE(abs(sum(
                    CASE
                        WHEN m.amount < 0::numeric AND (m.movement_type = ANY (ARRAY['ORIGIN'::text, 'IMPUTATION'::text, 'REMAINDER'::text])) AND m.document_id = m.reference_id THEN m.amount
                        ELSE 0::numeric
                    END)), 0.00) AS total_credits,
                COALESCE(sum(m.amount), 0.00) AS net_account_balance
            FROM account_movements m
            GROUP BY m.supplier_id, m.currency
        ), reference_metrics AS (
            SELECT rb.supplier_id,
                rb.currency,
                COALESCE(sum(
                    CASE
                        WHEN rb.ref_bal > 0::numeric THEN rb.ref_bal
                        ELSE 0::numeric
                    END), 0.00) AS total_pending_debt,
                COALESCE(abs(sum(
                    CASE
                        WHEN rb.ref_bal < 0::numeric THEN rb.ref_bal
                        ELSE 0::numeric
                    END)), 0.00) AS total_available_credit
            FROM (
                SELECT account_movements.supplier_id,
                    account_movements.currency,
                    account_movements.reference_id,
                    sum(account_movements.amount) AS ref_bal
                FROM account_movements
                GROUP BY account_movements.supplier_id, account_movements.currency, account_movements.reference_id
            ) rb
            GROUP BY rb.supplier_id, rb.currency
        )
        SELECT s.id AS supplier_id,
            s.trade_name,
            s.legal_name,
            s.tax_id,
            sm.currency,
            COALESCE(sm.total_debits, 0.00) AS total_debits,
            COALESCE(sm.total_credits, 0.00) AS total_credits,
            COALESCE(rm.total_pending_debt, 0.00) AS total_pending_debt,
            COALESCE(rm.total_available_credit, 0.00) AS total_available_credit,
            COALESCE(sm.net_account_balance, 0.00) AS net_account_balance
        FROM suppliers s
        JOIN supplier_metrics sm ON sm.supplier_id = s.id
        LEFT JOIN reference_metrics rm ON rm.supplier_id = s.id AND rm.currency::text = sm.currency::text;
        $vdef$;

        -- Paso C: Renombrar tablas heredadas preservando datos e integridad referencial
        DROP POLICY IF EXISTS "doc_apps_select" ON public.document_applications;
        DROP POLICY IF EXISTS "doc_apps_insert" ON public.document_applications;
        DROP POLICY IF EXISTS "app_reversals_select" ON public.application_reversals;
        DROP POLICY IF EXISTS "app_reversals_insert" ON public.application_reversals;

        ALTER TABLE public.document_applications DISABLE ROW LEVEL SECURITY;
        ALTER TABLE public.application_reversals DISABLE ROW LEVEL SECURITY;

        ALTER TABLE public.document_applications RENAME TO _bak_document_applications;
        ALTER TABLE public.application_reversals RENAME TO _bak_application_reversals;

        -- Corrección 2: Retirar las 11 constraints de _bak_* (sin CASCADE)
        ALTER TABLE public._bak_application_reversals DROP CONSTRAINT IF EXISTS application_reversals_reversal_document_id_fkey;
        ALTER TABLE public._bak_application_reversals DROP CONSTRAINT IF EXISTS application_reversals_created_by_fkey;
        ALTER TABLE public._bak_application_reversals DROP CONSTRAINT IF EXISTS application_reversals_application_id_fkey;
        ALTER TABLE public._bak_application_reversals DROP CONSTRAINT IF EXISTS application_reversals_application_id_key;
        ALTER TABLE public._bak_application_reversals DROP CONSTRAINT IF EXISTS application_reversals_pkey;

        ALTER TABLE public._bak_document_applications DROP CONSTRAINT IF EXISTS document_applications_target_document_id_fkey;
        ALTER TABLE public._bak_document_applications DROP CONSTRAINT IF EXISTS document_applications_source_document_id_fkey;
        ALTER TABLE public._bak_document_applications DROP CONSTRAINT IF EXISTS document_applications_created_by_fkey;
        ALTER TABLE public._bak_document_applications DROP CONSTRAINT IF EXISTS chk_document_applications_no_self;
        ALTER TABLE public._bak_document_applications DROP CONSTRAINT IF EXISTS chk_document_applications_amount;
        ALTER TABLE public._bak_document_applications DROP CONSTRAINT IF EXISTS document_applications_pkey;

        -- Corrección 3: Eliminar los 5 índices independientes (sin CASCADE)
        DROP INDEX IF EXISTS public.idx_app_reversals_app_id;
        DROP INDEX IF EXISTS public.idx_app_reversals_rev_doc;
        DROP INDEX IF EXISTS public.idx_doc_app_date;
        DROP INDEX IF EXISTS public.idx_doc_app_source;
        DROP INDEX IF EXISTS public.idx_doc_app_target;

        -- Corrección 4: Retirar identity y secuencias
        ALTER TABLE public._bak_application_reversals ALTER COLUMN id DROP IDENTITY IF EXISTS;
        ALTER TABLE public._bak_document_applications ALTER COLUMN id DROP IDENTITY IF EXISTS;

        -- Comprobar mediante catálogos si alguna secuencia continúa existiendo
        IF EXISTS (
            SELECT 1 FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'S'
              AND c.relname IN ('application_reversals_id_seq', 'document_applications_id_seq')
        ) THEN
            IF EXISTS (
                SELECT 1
                FROM pg_depend d
                JOIN pg_class c ON c.oid = d.objid
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public' AND c.relkind = 'S'
                  AND c.relname IN ('application_reversals_id_seq', 'document_applications_id_seq')
                  AND d.deptype NOT IN ('p')
            ) THEN
                RAISE EXCEPTION 'ESTADO_B ERROR: Secuencia interna conserva dependencias inesperadas tras DROP IDENTITY. Abortando.';
            ELSE
                DROP SEQUENCE IF EXISTS public.application_reversals_id_seq;
                DROP SEQUENCE IF EXISTS public.document_applications_id_seq;
            END IF;
        END IF;

        -- Corrección 5: Igualar nulabilidad de columnas id
        ALTER TABLE public._bak_application_reversals ALTER COLUMN id DROP NOT NULL;
        ALTER TABLE public._bak_document_applications ALTER COLUMN id DROP NOT NULL;

        -- Corrección 6: Retirar NOT NULL y DEFAULT de columnas restantes de _bak_application_reversals
        ALTER TABLE public._bak_application_reversals
            ALTER COLUMN reversal_document_id DROP NOT NULL,
            ALTER COLUMN application_id DROP NOT NULL,
            ALTER COLUMN reversal_reason DROP NOT NULL,
            ALTER COLUMN created_by DROP NOT NULL,
            ALTER COLUMN created_at DROP NOT NULL,
            ALTER COLUMN created_at DROP DEFAULT;

        -- Corrección 7: Retirar NOT NULL y DEFAULT de columnas restantes de _bak_document_applications
        ALTER TABLE public._bak_document_applications
            ALTER COLUMN source_document_id DROP NOT NULL,
            ALTER COLUMN target_document_id DROP NOT NULL,
            ALTER COLUMN applied_amount DROP NOT NULL,
            ALTER COLUMN application_date DROP NOT NULL,
            ALTER COLUMN application_date DROP DEFAULT,
            ALTER COLUMN created_by DROP NOT NULL,
            ALTER COLUMN created_at DROP NOT NULL,
            ALTER COLUMN created_at DROP DEFAULT;

        -- Corrección 8: Igualar default de account_movements.created_at a now()
        ALTER TABLE public.account_movements
        ALTER COLUMN created_at SET DEFAULT now();


        -- Paso D: Actualizar politicas RLS existentes a definicion QA ({anon, authenticated})
        ALTER POLICY "ai_extractions_insert" ON public.document_ai_extractions TO anon, authenticated;
        ALTER POLICY "ai_extractions_select" ON public.document_ai_extractions TO anon, authenticated;
        ALTER POLICY "ai_extractions_update" ON public.document_ai_extractions TO anon, authenticated;
        ALTER POLICY "ai_extractions_update" ON public.document_ai_extractions USING ((has_permission('documents.ai_review'::text) OR has_permission('documents.create'::text)));
        ALTER POLICY "files_insert" ON public.document_files TO anon, authenticated;
        ALTER POLICY "files_select" ON public.document_files TO anon, authenticated;
        ALTER POLICY "document_types_manage" ON public.document_types TO anon, authenticated;
        ALTER POLICY "document_types_manage" ON public.document_types WITH CHECK (has_permission('system.manage'::text));

        -- Paso E: Habilitar RLS en document_upload_sessions y crear 20 politicas faltantes de QA
        ALTER TABLE public.document_upload_sessions ENABLE ROW LEVEL SECURITY;

        CREATE POLICY "files_update" ON public.document_files FOR UPDATE TO anon, authenticated USING (has_permission('documents.create'::text)) WITH CHECK (has_permission('documents.create'::text));
        CREATE POLICY "document_types_select_anon" ON public.document_types FOR SELECT TO anon USING (true);
        CREATE POLICY "upload_sessions_all" ON public.document_upload_sessions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
        CREATE POLICY "documents_insert_anon" ON public.documents FOR INSERT TO anon WITH CHECK (has_permission('documents.create'::text));
        CREATE POLICY "documents_select_anon" ON public.documents FOR SELECT TO anon USING (true);
        CREATE POLICY "documents_update_anon" ON public.documents FOR UPDATE TO anon USING (has_permission('documents.create'::text));
        CREATE POLICY "duplicate_override_logs_insert_anon" ON public.duplicate_override_logs FOR INSERT TO anon WITH CHECK (has_permission('documents.duplicate_override'::text));
        CREATE POLICY "duplicate_override_logs_select_anon" ON public.duplicate_override_logs FOR SELECT TO anon USING (true);
        CREATE POLICY "permissions_select_anon" ON public.permissions FOR SELECT TO anon USING (true);
        CREATE POLICY "profiles_select_anon" ON public.profiles FOR SELECT TO anon USING (true);
        CREATE POLICY "role_permissions_select_anon" ON public.role_permissions FOR SELECT TO anon USING (true);
        CREATE POLICY "roles_select_anon" ON public.roles FOR SELECT TO anon USING (true);
        CREATE POLICY "supplier_contacts_delete_anon" ON public.supplier_contacts FOR DELETE TO anon USING (has_permission('suppliers.manage'::text));
        CREATE POLICY "supplier_contacts_insert_anon" ON public.supplier_contacts FOR INSERT TO anon WITH CHECK (has_permission('suppliers.manage'::text));
        CREATE POLICY "supplier_contacts_select_anon" ON public.supplier_contacts FOR SELECT TO anon USING (true);
        CREATE POLICY "supplier_contacts_update_anon" ON public.supplier_contacts FOR UPDATE TO anon USING (has_permission('suppliers.manage'::text));
        CREATE POLICY "suppliers_insert_anon" ON public.suppliers FOR INSERT TO anon WITH CHECK (has_permission('suppliers.manage'::text));
        CREATE POLICY "suppliers_select_anon" ON public.suppliers FOR SELECT TO anon USING (true);
        CREATE POLICY "suppliers_update_anon" ON public.suppliers FOR UPDATE TO anon USING (has_permission('suppliers.manage'::text));
        CREATE POLICY "user_roles_select_anon" ON public.user_roles FOR SELECT TO anon USING (true);

                -- Paso F: Crear y asegurar convergencia canonica de las 7 funciones hacia QA dentro de ESTADO_B
        EXECUTE $fn_user_id$
CREATE OR REPLACE FUNCTION public.current_app_user_id()
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_uid uuid;
  v_user_id bigint;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NOT NULL THEN
    SELECT id INTO v_user_id FROM profiles WHERE auth_user_id = v_uid AND is_active = true LIMIT 1;
    IF v_user_id IS NOT NULL THEN
      RETURN v_user_id;
    END IF;
  END IF;

  -- Fallback to first admin profile or active profile if anon
  SELECT p.id INTO v_user_id
  FROM profiles p
  JOIN user_roles ur ON ur.user_id = p.id
  JOIN roles r ON r.id = ur.role_id
  WHERE p.is_active = true
  ORDER BY CASE WHEN r.code = 'ADMIN' THEN 1 WHEN r.code = 'ENCARGADO' THEN 2 ELSE 3 END, p.id
  LIMIT 1;

  RETURN COALESCE(v_user_id, 3);
END;
$function$
        $fn_user_id$;

        ALTER FUNCTION public.current_app_user_id() OWNER TO postgres;
        GRANT EXECUTE ON FUNCTION public.current_app_user_id() TO PUBLIC, anon, authenticated, service_role;

        EXECUTE $fn_quick_sup$
CREATE OR REPLACE FUNCTION public.rpc_quick_create_supplier(p_tax_id character varying, p_trade_name character varying, p_legal_name character varying DEFAULT NULL::character varying)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_clean_cuit VARCHAR;
  v_formatted_cuit VARCHAR;
  v_existing_id BIGINT;
  v_new_supplier suppliers%ROWTYPE;
  v_next_code VARCHAR(20);
  v_count INT;
  v_user_id BIGINT;
BEGIN
  v_user_id := current_app_user_id();

  -- Clean CUIT
  v_clean_cuit := regexp_replace(p_tax_id, '[^0-9]', '', 'g');

  IF length(v_clean_cuit) <> 11 THEN
    RAISE EXCEPTION 'El CUIT debe tener exactamente 11 dígitos numéricos.';
  END IF;

  IF NOT fn_validate_cuit(v_clean_cuit) THEN
    RAISE EXCEPTION 'El CUIT ingresado (%) no posee un dígito verificador válido.', p_tax_id;
  END IF;

  -- Standard format: XX-XXXXXXXX-X
  v_formatted_cuit := substring(v_clean_cuit from 1 for 2) || '-' || 
                      substring(v_clean_cuit from 3 for 8) || '-' || 
                      substring(v_clean_cuit from 11 for 1);

  -- Check if already exists by clean or formatted CUIT
  SELECT id INTO v_existing_id 
  FROM suppliers 
  WHERE regexp_replace(tax_id, '[^0-9]', '', 'g') = v_clean_cuit 
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    SELECT * INTO v_new_supplier FROM suppliers WHERE id = v_existing_id;
    RETURN jsonb_build_object(
      'success', true,
      'is_existing', true,
      'supplier', row_to_json(v_new_supplier)
    );
  END IF;

  -- Generate Next Code
  SELECT count(*) + 1 INTO v_count FROM suppliers;
  v_next_code := 'PROV-' || lpad(v_count::TEXT, 3, '0');

  -- Insert new supplier
  INSERT INTO suppliers (
    code,
    tax_id,
    legal_name,
    trade_name,
    is_active,
    created_by
  ) VALUES (
    v_next_code,
    v_formatted_cuit,
    COALESCE(NULLIF(trim(p_legal_name), ''), trim(p_trade_name)),
    trim(p_trade_name),
    true,
    v_user_id
  ) RETURNING * INTO v_new_supplier;

  RETURN jsonb_build_object(
    'success', true,
    'is_existing', false,
    'supplier', row_to_json(v_new_supplier)
  );
END;
$function$
        $fn_quick_sup$;

        ALTER FUNCTION public.rpc_quick_create_supplier(character varying, character varying, character varying) OWNER TO postgres;
        GRANT EXECUTE ON FUNCTION public.rpc_quick_create_supplier(character varying, character varying, character varying) TO PUBLIC, anon, authenticated, service_role;

        EXECUTE $fn_rev_doc$
CREATE OR REPLACE FUNCTION public.rpc_reverse_document(p_document_id bigint, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_user_id bigint;
    v_doc record;
    v_doc_type record;
    v_rev_doc_id bigint;
    v_rev_human_ref varchar(100);
    v_rev_amount numeric(15,2);
    v_current_ref_bal numeric(15,2);
BEGIN
    v_user_id := current_app_user_id();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Acceso no autorizado o perfil inactivo.';
    END IF;

    IF NOT has_permission('documents.reverse') THEN
        RAISE EXCEPTION 'Permiso denegado: Se requiere "documents.reverse".';
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'El motivo de reversión es obligatorio.';
    END IF;

    SELECT d.*, dt.balance_nature, dt.code as doc_type_code
    INTO v_doc
    FROM documents d
    JOIN document_types dt ON dt.id = d.document_type_id
    WHERE d.id = p_document_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Documento ID % no encontrado.', p_document_id;
    END IF;

    IF v_doc.status <> 'CONFIRMED' THEN
        RAISE EXCEPTION 'Solo pueden revertirse documentos en estado CONFIRMED.';
    END IF;

    IF v_doc.human_reference LIKE 'REV-%' THEN
        RAISE EXCEPTION 'No se puede revertir un comprobante que ya es un ajuste de reversión.';
    END IF;

    -- Validar que el saldo de su referencia no esté comprometido
    SELECT COALESCE(SUM(amount), 0.00) INTO v_current_ref_bal
    FROM account_movements
    WHERE reference_id = p_document_id;

    IF v_doc.balance_nature = 'DEBIT' AND v_current_ref_bal < v_doc.total_amount THEN
        RAISE EXCEPTION 'No se puede revertir la factura % porque tiene pagos/imputaciones aplicadas (Saldo actual: $%, Total: $%). Desimpute primero los pagos.',
            v_doc.human_reference, v_current_ref_bal, v_doc.total_amount;
    END IF;

    v_rev_human_ref := format('REV-%s', v_doc.human_reference);
    v_rev_amount := CASE WHEN v_doc.balance_nature = 'DEBIT' THEN -v_doc.total_amount ELSE v_doc.total_amount END;

    -- Insertar Cabecera de Reversión
    INSERT INTO documents (
        supplier_id, document_type_id, status, human_reference, issue_date,
        currency, exchange_rate, total_amount, concept, notes, intake_source,
        created_by, confirmed_by, confirmed_at
    ) VALUES (
        v_doc.supplier_id, v_doc.document_type_id, 'CONFIRMED', v_rev_human_ref, CURRENT_DATE,
        v_doc.currency, 1.000000, v_doc.total_amount, format('Anulación de %s: %s', v_doc.human_reference, p_reason),
        p_reason, 'MANUAL', v_user_id, v_user_id, now()
    ) RETURNING id INTO v_rev_doc_id;

    -- Insertar Renglón REVERSAL en el Ledger sobre la reference_id del documento a anular
    INSERT INTO account_movements (
        supplier_id, document_id, reference_id, line_number, movement_type,
        movement_date, currency, amount, notes, created_by
    ) VALUES (
        v_doc.supplier_id, v_rev_doc_id, v_doc.id, 1, 'REVERSAL',
        CURRENT_DATE, 'ARS', v_rev_amount, format('Reversión compensatoria: %s', p_reason), v_user_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'reversal_document_id', v_rev_doc_id,
        'human_reference', v_rev_human_ref,
        'message', 'Documento revertido exitosamente. El saldo de la referencia quedó en $0.00.'
    );
END;
$function$
        $fn_rev_doc$;

        ALTER FUNCTION public.rpc_reverse_document(bigint, text) OWNER TO postgres;
        GRANT EXECUTE ON FUNCTION public.rpc_reverse_document(bigint, text) TO PUBLIC, anon, authenticated, service_role;

        EXECUTE $fn_rev_imp$
CREATE OR REPLACE FUNCTION public.rpc_reverse_imputation(p_movement_id bigint, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_user_id bigint;
    v_mov record;
    v_apl_type_id smallint;
    v_apl_id bigint;
    v_apl_ref varchar(100);
    v_reverse_amount numeric(15,2);
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

    -- Obtener movimiento original
    SELECT * INTO v_mov FROM account_movements WHERE id = p_movement_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Movimiento ID % no encontrado.', p_movement_id;
    END IF;

    IF v_mov.movement_type NOT IN ('IMPUTATION', 'APL_TRANSFER') OR v_mov.amount >= 0 THEN
        RAISE EXCEPTION 'Solo pueden revertirse renglones de imputación negativa hacia facturas.';
    END IF;

    v_reverse_amount := ABS(v_mov.amount);

    SELECT id INTO v_apl_type_id FROM document_types WHERE code = 'APL';

    v_apl_ref := format('APL-REV %s', lpad(p_movement_id::text, 6, '0'));

    -- Crear Cabecera APL Compensatorio
    INSERT INTO documents (
        supplier_id, document_type_id, status, human_reference, issue_date,
        currency, exchange_rate, total_amount, concept, notes, intake_source,
        created_by, confirmed_by, confirmed_at
    ) VALUES (
        v_mov.supplier_id, v_apl_type_id, 'CONFIRMED', v_apl_ref, CURRENT_DATE,
        'ARS', 1.000000, v_reverse_amount, format('Desimputación de Movimiento #%s: %s', p_movement_id, p_reason),
        p_reason, 'MANUAL', v_user_id, v_user_id, now()
    ) RETURNING id INTO v_apl_id;

    -- Renglón 1: Restaura la deuda en la Factura (+amount)
    INSERT INTO account_movements (
        supplier_id, document_id, reference_id, line_number, movement_type,
        movement_date, currency, amount, notes, created_by
    ) VALUES (
        v_mov.supplier_id, v_apl_id, v_mov.reference_id, 1, 'DESIMPUTATION',
        CURRENT_DATE, 'ARS', v_reverse_amount, format('Restaura deuda por desimputación: %s', p_reason), v_user_id
    );

    -- Renglón 2: Restaura el crédito disponible en el comprobante emisor / OP (-amount)
    INSERT INTO account_movements (
        supplier_id, document_id, reference_id, line_number, movement_type,
        movement_date, currency, amount, notes, created_by
    ) VALUES (
        v_mov.supplier_id, v_apl_id, v_mov.document_id, 2, 'DESIMPUTATION',
        CURRENT_DATE, 'ARS', -v_reverse_amount, format('Restaura crédito a favor por desimputación: %s', p_reason), v_user_id
    );

    -- Validar invariante de APL suma cero
    IF (SELECT SUM(amount) FROM account_movements WHERE document_id = v_apl_id) <> 0.00 THEN
        RAISE EXCEPTION 'Error de Integridad: El APL de desimputación debe sumar 0.00.';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'apl_id', v_apl_id,
        'human_reference', v_apl_ref,
        'reversed_amount', v_reverse_amount,
        'message', 'Imputación desimputada exitosamente mediante contra-asiento APL.'
    );
END;
$function$
        $fn_rev_imp$;

        ALTER FUNCTION public.rpc_reverse_imputation(bigint, text) OWNER TO postgres;
        GRANT EXECUTE ON FUNCTION public.rpc_reverse_imputation(bigint, text) TO PUBLIC, anon, authenticated, service_role;

        EXECUTE $fn_upload$
CREATE OR REPLACE FUNCTION public.rpc_create_upload_session(p_expires_in_minutes integer DEFAULT 15)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_raw_token VARCHAR(64);
  v_token_hash VARCHAR(64);
  v_session_id UUID;
  v_user_id BIGINT;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Authenticated user ID
  SELECT id INTO v_user_id FROM profiles WHERE auth_user_id = auth.uid() LIMIT 1;
  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id FROM profiles ORDER BY id LIMIT 1;
  END IF;

  -- Generate 64-char crypto hex token
  v_raw_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_raw_token, 'sha256'), 'hex');
  v_expires_at := now() + (COALESCE(p_expires_in_minutes, 15) || ' minutes')::INTERVAL;

  INSERT INTO document_upload_sessions (token_hash, status, created_by, expires_at)
  VALUES (v_token_hash, 'PENDING', v_user_id, v_expires_at)
  RETURNING id INTO v_session_id;

  RETURN jsonb_build_object(
    'session_id', v_session_id,
    'session_token', v_raw_token,
    'expires_at', v_expires_at,
    'status', 'PENDING'
  );
END;
$function$
        $fn_upload$;

        ALTER FUNCTION public.rpc_create_upload_session(integer) OWNER TO postgres;
        GRANT EXECUTE ON FUNCTION public.rpc_create_upload_session(integer) TO PUBLIC, anon, authenticated, service_role;

        EXECUTE $fn_create_doc$
CREATE OR REPLACE FUNCTION public.rpc_create_and_confirm_document(p_supplier_id bigint, p_document_type_id smallint, p_letter character varying, p_point_of_sale integer, p_document_number integer, p_human_reference character varying, p_issue_date date, p_due_date date, p_total_amount numeric, p_concept text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_override_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_user_id bigint;
    v_doc_type record;
    v_matched_doc record;
    v_doc_id bigint;
    v_signed_amount numeric(15,2);
BEGIN
    v_user_id := current_app_user_id();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Acceso no autorizado o perfil inactivo.';
    END IF;

    IF NOT has_permission('documents.create') THEN
        RAISE EXCEPTION 'Permiso denegado: Se requiere "documents.create".';
    END IF;

    IF p_total_amount <= 0 THEN
        RAISE EXCEPTION 'El importe total del documento debe ser mayor a 0.';
    END IF;

    SELECT * INTO v_doc_type FROM document_types WHERE id = p_document_type_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tipo de documento ID % no válido.', p_document_type_id;
    END IF;

    -- Detección de duplicados fiscales
    IF p_letter IS NOT NULL AND p_point_of_sale IS NOT NULL AND p_document_number IS NOT NULL THEN
        SELECT id, human_reference, issue_date, total_amount, created_at
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
                    'matched_issue_date', v_matched_doc.issue_date,
                    'matched_total_amount', v_matched_doc.total_amount,
                    'message', format('DUPLICADO DETECTADO: Ya existe el comprobante %s (ID %s). Ingrese motivo de excepción.', v_matched_doc.human_reference, v_matched_doc.id)
                );
            ELSE
                IF NOT has_permission('documents.duplicate_override') THEN
                    RAISE EXCEPTION 'Permiso denegado: Se requiere "documents.duplicate_override".';
                END IF;
            END IF;
        END IF;
    END IF;

    -- Insertar Cabecera Documental en CONFIRMED
    INSERT INTO documents (
        supplier_id, document_type_id, status, letter, point_of_sale, document_number,
        human_reference, issue_date, due_date, currency, exchange_rate, total_amount,
        concept, notes, intake_source, created_by, confirmed_by, confirmed_at
    ) VALUES (
        p_supplier_id, p_document_type_id, 'CONFIRMED', p_letter, p_point_of_sale, p_document_number,
        p_human_reference, p_issue_date, p_due_date, 'ARS', 1.000000, p_total_amount,
        p_concept, p_notes, 'MANUAL', v_user_id, v_user_id, now()
    ) RETURNING id INTO v_doc_id;

    -- Registrar auditoría si fue excepción de duplicado
    IF v_matched_doc.id IS NOT NULL AND p_override_reason IS NOT NULL THEN
        INSERT INTO duplicate_override_logs (document_id, matched_document_id, reason, authorized_by)
        VALUES (v_doc_id, v_matched_doc.id, trim(p_override_reason), v_user_id);
    END IF;

    -- Derivar signo económico
    v_signed_amount := CASE WHEN v_doc_type.balance_nature = 'DEBIT' THEN p_total_amount ELSE -p_total_amount END;

    -- Insertar Renglón ORIGIN en el Ledger referenciado a sí mismo
    INSERT INTO account_movements (
        supplier_id, document_id, reference_id, line_number, movement_type,
        movement_date, currency, amount, notes, created_by
    ) VALUES (
        p_supplier_id, v_doc_id, v_doc_id, 1, 'ORIGIN',
        p_issue_date, 'ARS', v_signed_amount, p_concept, v_user_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'document_id', v_doc_id,
        'human_reference', p_human_reference,
        'status', 'CONFIRMED',
        'message', 'Documento creado y confirmado exitosamente en el ledger.'
    );
END;
$function$
        $fn_create_doc$;

        ALTER FUNCTION public.rpc_create_and_confirm_document(bigint, smallint, character varying, integer, integer, character varying, date, date, numeric, text, text, text) OWNER TO postgres;
        GRANT EXECUTE ON FUNCTION public.rpc_create_and_confirm_document(bigint, smallint, character varying, integer, integer, character varying, date, date, numeric, text, text, text) TO PUBLIC, anon, authenticated, service_role;

        EXECUTE $fn_create_op$
CREATE OR REPLACE FUNCTION public.rpc_create_and_confirm_op(p_supplier_id bigint, p_document_type_id smallint, p_point_of_sale integer, p_document_number integer, p_human_reference character varying, p_issue_date date, p_total_amount numeric, p_concept text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_imputations jsonb DEFAULT '[]'::jsonb, p_override_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_user_id bigint;
    v_doc_id bigint;
    v_imp jsonb;
    v_target_id bigint;
    v_amount numeric(15,2);
    v_total_imputed numeric(15,2) := 0.00;
    v_remainder numeric(15,2);
    v_target_debt numeric(15,2);
    v_line smallint := 1;
    v_target_doc record;
BEGIN
    v_user_id := current_app_user_id();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Acceso no autorizado o perfil inactivo.';
    END IF;

    IF NOT has_permission('documents.create') THEN
        RAISE EXCEPTION 'Permiso denegado: Se requiere "documents.create".';
    END IF;

    IF p_total_amount <= 0 THEN
        RAISE EXCEPTION 'El importe de la Orden de Pago debe ser estrictamente mayor a 0.';
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
    INSERT INTO documents (
        supplier_id, document_type_id, status, point_of_sale, document_number,
        human_reference, issue_date, currency, exchange_rate, total_amount,
        concept, notes, intake_source, created_by, confirmed_by, confirmed_at
    ) VALUES (
        p_supplier_id, p_document_type_id, 'CONFIRMED', p_point_of_sale, p_document_number,
        p_human_reference, p_issue_date, 'ARS', 1.000000, p_total_amount,
        p_concept, p_notes, 'MANUAL', v_user_id, v_user_id, now()
    ) RETURNING id INTO v_doc_id;

    -- Procesar cada renglón de imputación a facturas
    FOR v_imp IN SELECT * FROM jsonb_array_elements(p_imputations)
    LOOP
        v_target_id := (v_imp->>'target_document_id')::bigint;
        v_amount := (v_imp->>'applied_amount')::numeric;

        -- Bloqueo de fila destino
        SELECT * INTO v_target_doc FROM documents WHERE id = v_target_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Factura destino ID % no encontrada.', v_target_id;
        END IF;

        IF v_target_doc.supplier_id <> p_supplier_id THEN
            RAISE EXCEPTION 'La Factura ID % pertenece a otro proveedor.', v_target_id;
        END IF;

        -- Comprobar deuda pendiente actual de la referencia
        SELECT COALESCE(SUM(amount), 0.00) INTO v_target_debt
        FROM account_movements
        WHERE reference_id = v_target_id;

        IF v_amount > v_target_debt THEN
            RAISE EXCEPTION 'No sobrecancelación: La Factura % (ID %) tiene deuda de $%, no puede recibir imputación de $%.',
                v_target_doc.human_reference, v_target_id, v_target_debt, v_amount;
        END IF;

        -- Insertar renglón IMPUTATION
        INSERT INTO account_movements (
            supplier_id, document_id, reference_id, line_number, movement_type,
            movement_date, currency, amount, notes, created_by
        ) VALUES (
            p_supplier_id, v_doc_id, v_target_id, v_line, 'IMPUTATION',
            p_issue_date, 'ARS', -v_amount, format('Imputación a %s', v_target_doc.human_reference), v_user_id
        );

        v_line := v_line + 1;
    END LOOP;

    -- Si queda remanente, generar renglón REMAINDER referenciado a la propia OP
    v_remainder := p_total_amount - v_total_imputed;
    IF v_remainder > 0 THEN
        INSERT INTO account_movements (
            supplier_id, document_id, reference_id, line_number, movement_type,
            movement_date, currency, amount, notes, created_by
        ) VALUES (
            p_supplier_id, v_doc_id, v_doc_id, v_line, 'REMAINDER',
            p_issue_date, 'ARS', -v_remainder, 'Remanente libre de Orden de Pago', v_user_id
        );
    END IF;

    -- Validar invariante: SUM(renglones) = -p_total_amount
    IF (SELECT SUM(amount) FROM account_movements WHERE document_id = v_doc_id) <> -p_total_amount THEN
        RAISE EXCEPTION 'Error de Integridad: La suma de renglones de la OP no coincide con -total_amount.';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'document_id', v_doc_id,
        'human_reference', p_human_reference,
        'total_amount', p_total_amount,
        'imputed_amount', v_total_imputed,
        'remainder_amount', v_remainder,
        'message', 'Orden de Pago registrada y confirmada exitosamente.'
    );
END;
$function$
        $fn_create_op$;

        ALTER FUNCTION public.rpc_create_and_confirm_op(bigint, smallint, integer, integer, character varying, date, numeric, text, text, jsonb, text) OWNER TO postgres;
        GRANT EXECUTE ON FUNCTION public.rpc_create_and_confirm_op(bigint, smallint, integer, integer, character varying, date, numeric, text, text, jsonb, text) TO PUBLIC, anon, authenticated, service_role;

        -- Paso G0: Convergencia declarativa de tipos de comprobante (APL)
        UPDATE public.document_types
        SET
            description = 'Documento de transferencia de saldos preexistentes entre referencias (Suma Cero).',
            can_be_source_application = true,
            can_be_target_application = true
        WHERE code = 'APL'
          AND (
              description IS DISTINCT FROM 'Documento de transferencia de saldos preexistentes entre referencias (Suma Cero).'
              OR can_be_source_application IS DISTINCT FROM true
              OR can_be_target_application IS DISTINCT FROM true
          );

        -- Paso G: Post-validación atómica estricta de convergencia hacia ESTADO_A
        SELECT count(*) INTO v_post_policy_count FROM pg_policies WHERE schemaname IN ('public', 'storage');
        IF v_post_policy_count <> 63 THEN
            RAISE EXCEPTION 'ESTADO_B ERROR: Conteo post-convergencia de políticas RLS es % (esperado: 63). Revirtiendo.', v_post_policy_count;
        END IF;

        SELECT count(*) INTO v_post_view_count FROM information_schema.views WHERE table_schema = 'public';
        IF v_post_view_count <> 6 THEN
            RAISE EXCEPTION 'ESTADO_B ERROR: Conteo post-convergencia de vistas es % (esperado: 6). Revirtiendo.', v_post_view_count;
        END IF;

        SELECT count(*) INTO v_post_col_count FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'v_supplier_account_summary';
        IF v_post_col_count <> 10 THEN
            RAISE EXCEPTION 'ESTADO_B ERROR: Columnas de v_supplier_account_summary post-convergencia es % (esperado: 10). Revirtiendo.', v_post_col_count;
        END IF;

        SELECT encode(sha256(convert_to(trim(regexp_replace(pg_get_functiondef(p.oid), '\s+', ' ', 'g')), 'UTF8')), 'hex') INTO v_post_fn1_hash
        FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'rpc_create_and_confirm_document'
          AND pg_get_function_identity_arguments(p.oid) = 'p_supplier_id bigint, p_document_type_id smallint, p_letter character varying, p_point_of_sale integer, p_document_number integer, p_human_reference character varying, p_issue_date date, p_due_date date, p_total_amount numeric, p_concept text, p_notes text, p_override_reason text';

        IF v_post_fn1_hash <> '1697c414dd56f1d8bc1e33340a7a90fde6ea6442f29139ac85b4d9f8bb855756' THEN
            RAISE EXCEPTION 'ESTADO_B ERROR: Hash de rpc_create_and_confirm_document creado no coincide con QA canónico (%). Revirtiendo.', v_post_fn1_hash;
        END IF;

        SELECT encode(sha256(convert_to(trim(regexp_replace(pg_get_functiondef(p.oid), '\s+', ' ', 'g')), 'UTF8')), 'hex') INTO v_post_fn2_hash
        FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'rpc_create_and_confirm_op'
          AND pg_get_function_identity_arguments(p.oid) = 'p_supplier_id bigint, p_document_type_id smallint, p_point_of_sale integer, p_document_number integer, p_human_reference character varying, p_issue_date date, p_total_amount numeric, p_concept text, p_notes text, p_imputations jsonb, p_override_reason text';

        IF v_post_fn2_hash <> '98a9956fa027ff7a55abeea1fa6640a0af96e440130a67340f3c2f1593a430b9' THEN
            RAISE EXCEPTION 'ESTADO_B ERROR: Hash de rpc_create_and_confirm_op creado no coincide con QA canónico (%). Revirtiendo.', v_post_fn2_hash;
        END IF;

        IF NOT (
            has_function_privilege('public', 'public.rpc_create_and_confirm_document(bigint, smallint, character varying, integer, integer, character varying, date, date, numeric, text, text, text)'::regprocedure, 'EXECUTE') AND
            has_function_privilege('anon', 'public.rpc_create_and_confirm_document(bigint, smallint, character varying, integer, integer, character varying, date, date, numeric, text, text, text)'::regprocedure, 'EXECUTE') AND
            has_function_privilege('authenticated', 'public.rpc_create_and_confirm_document(bigint, smallint, character varying, integer, integer, character varying, date, date, numeric, text, text, text)'::regprocedure, 'EXECUTE') AND
            has_function_privilege('service_role', 'public.rpc_create_and_confirm_document(bigint, smallint, character varying, integer, integer, character varying, date, date, numeric, text, text, text)'::regprocedure, 'EXECUTE') AND
            has_function_privilege('public', 'public.rpc_create_and_confirm_op(bigint, smallint, integer, integer, character varying, date, numeric, text, text, jsonb, text)'::regprocedure, 'EXECUTE') AND
            has_function_privilege('anon', 'public.rpc_create_and_confirm_op(bigint, smallint, integer, integer, character varying, date, numeric, text, text, jsonb, text)'::regprocedure, 'EXECUTE') AND
            has_function_privilege('authenticated', 'public.rpc_create_and_confirm_op(bigint, smallint, integer, integer, character varying, date, numeric, text, text, jsonb, text)'::regprocedure, 'EXECUTE') AND
            has_function_privilege('service_role', 'public.rpc_create_and_confirm_op(bigint, smallint, integer, integer, character varying, date, numeric, text, text, jsonb, text)'::regprocedure, 'EXECUTE')
        ) THEN
            RAISE EXCEPTION 'ESTADO_B ERROR: Privilegios EXECUTE post-convergencia no coinciden con QA. Revirtiendo.';
        END IF;

        -- Post-validación: RLS en document_upload_sessions
        SELECT c.relrowsecurity INTO v_upload_sessions_rls
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'document_upload_sessions';

        IF v_upload_sessions_rls IS NOT TRUE THEN
            RAISE EXCEPTION 'ESTADO_B ERROR: document_upload_sessions no tiene RLS habilitado post-convergencia. Revirtiendo.';
        END IF;

        -- Post-validación: Ausencia de constraints en tablas _bak_*
        SELECT count(*) INTO v_bak_constraints_count
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' 
          AND c.relname IN ('_bak_document_applications', '_bak_application_reversals')
          AND con.conname IN (
              'application_reversals_pkey',
              'application_reversals_application_id_key',
              'application_reversals_application_id_fkey',
              'application_reversals_created_by_fkey',
              'application_reversals_reversal_document_id_fkey',
              'document_applications_pkey',
              'chk_document_applications_amount',
              'chk_document_applications_no_self',
              'document_applications_created_by_fkey',
              'document_applications_source_document_id_fkey',
              'document_applications_target_document_id_fkey'
          );

        IF v_bak_constraints_count > 0 THEN
            RAISE EXCEPTION 'ESTADO_B ERROR: Se detectaron % restricciones remanentes en tablas _bak_* post-convergencia. Revirtiendo.', v_bak_constraints_count;
        END IF;

        -- Post-validación: Ausencia de índices en tablas _bak_*
        SELECT count(*) INTO v_bak_indexes_count
        FROM pg_index idx
        JOIN pg_class i ON i.oid = idx.indexrelid
        JOIN pg_class c ON c.oid = idx.indrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname IN ('_bak_document_applications', '_bak_application_reversals')
          AND i.relname IN (
              'application_reversals_pkey',
              'application_reversals_application_id_key',
              'idx_app_reversals_app_id',
              'idx_app_reversals_rev_doc',
              'document_applications_pkey',
              'idx_doc_app_date',
              'idx_doc_app_source',
              'idx_doc_app_target'
          );

        IF v_bak_indexes_count > 0 THEN
            RAISE EXCEPTION 'ESTADO_B ERROR: Se detectaron % índices remanentes en tablas _bak_* post-convergencia. Revirtiendo.', v_bak_indexes_count;
        END IF;

        -- Post-validación: Ausencia de secuencias de tablas _bak_*
        SELECT count(*) INTO v_bak_sequences_count
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'S'
          AND c.relname IN ('application_reversals_id_seq', 'document_applications_id_seq');

        IF v_bak_sequences_count > 0 THEN
            RAISE EXCEPTION 'ESTADO_B ERROR: Se detectaron % secuencias remanentes de tablas _bak_* post-convergencia. Revirtiendo.', v_bak_sequences_count;
        END IF;

        -- Post-validación: Columnas id en tablas _bak_*
        SELECT count(*) INTO v_bak_id_cols_valid
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'id'
        LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
        WHERE n.nspname = 'public' 
          AND c.relname IN ('_bak_document_applications', '_bak_application_reversals')
          AND format_type(a.atttypid, a.atttypmod) = 'bigint'
          AND NOT a.attnotnull
          AND a.attidentity = ''
          AND d.adrelid IS NULL
          AND pg_get_serial_sequence('public.' || c.relname, 'id') IS NULL;

        IF v_bak_id_cols_valid <> 2 THEN
            RAISE EXCEPTION 'ESTADO_B ERROR: Las columnas id de tablas _bak_* no cumplen los atributos canónicos post-convergencia. Revirtiendo.';
        END IF;

        -- Post-validación: Columnas de _bak_application_reversals (nullable y sin default en created_at)
        SELECT count(*) INTO v_bak_app_rev_cols_valid
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid
        LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
        WHERE n.nspname = 'public' AND c.relname = '_bak_application_reversals'
          AND a.attname IN ('reversal_document_id', 'application_id', 'reversal_reason', 'created_by', 'created_at')
          AND NOT a.attnotnull
          AND (a.attname <> 'created_at' OR d.adrelid IS NULL);

        IF v_bak_app_rev_cols_valid <> 5 THEN
            RAISE EXCEPTION 'ESTADO_B ERROR: Las columnas de _bak_application_reversals no cumplen los atributos canónicos post-convergencia. Revirtiendo.';
        END IF;

        -- Post-validación: Columnas de _bak_document_applications (nullable y sin default en application_date/created_at)
        SELECT count(*) INTO v_bak_doc_apps_cols_valid
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid
        LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
        WHERE n.nspname = 'public' AND c.relname = '_bak_document_applications'
          AND a.attname IN ('source_document_id', 'target_document_id', 'applied_amount', 'application_date', 'created_by', 'created_at')
          AND NOT a.attnotnull
          AND (a.attname NOT IN ('application_date', 'created_at') OR d.adrelid IS NULL);

        IF v_bak_doc_apps_cols_valid <> 6 THEN
            RAISE EXCEPTION 'ESTADO_B ERROR: Las columnas de _bak_document_applications no cumplen los atributos canónicos post-convergencia. Revirtiendo.';
        END IF;

        -- Post-validación: Default de account_movements.created_at = now()
        SELECT trim(regexp_replace(pg_get_expr(d.adbin, d.adrelid), '\s+', ' ', 'g')) INTO v_acct_mov_created_at_default
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'created_at'
        LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
        WHERE n.nspname = 'public' AND c.relname = 'account_movements';

        IF v_acct_mov_created_at_default <> 'now()' THEN
            RAISE EXCEPTION 'ESTADO_B ERROR: account_movements.created_at no posee el default canónico now() post-convergencia (detectado: %). Revirtiendo.', v_acct_mov_created_at_default;
        END IF;

        -- Post-validación: Registro declarativo APL en document_types
        SELECT count(*) INTO v_apl_valid
        FROM public.document_types
        WHERE code = 'APL'
          AND description = 'Documento de transferencia de saldos preexistentes entre referencias (Suma Cero).'
          AND can_be_source_application IS TRUE
          AND can_be_target_application IS TRUE;

        IF v_apl_valid <> 1 THEN
            RAISE EXCEPTION 'ESTADO_B ERROR: document_types APL no coincide con QA post-convergencia. Revirtiendo.';
        END IF;

        RAISE NOTICE 'Transformacion estructural hacia ESTADO_A completada exitosamente.';
    END IF;
END $migration$;
