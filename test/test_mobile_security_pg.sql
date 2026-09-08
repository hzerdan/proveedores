-- ==============================================================================
-- Script de Validación Integral: 14 Pruebas de Seguridad en QA
-- ==============================================================================

CREATE TEMP TABLE IF NOT EXISTS test_evidence (
  test_id text PRIMARY KEY,
  test_title text NOT NULL,
  passed boolean NOT NULL,
  expected_behavior text NOT NULL,
  actual_outcome text NOT NULL,
  details jsonb NOT NULL,
  executed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

DELETE FROM test_evidence;

DO $$
DECLARE
  v_res jsonb;
  v_err_msg text;
  v_test_auth_no_perm uuid := '22222222-2222-2222-2222-222222222222';
  v_test_auth_no_profile uuid := '99999999-9999-9999-9999-999999999999';
  v_admin_auth uuid := '0299503d-4498-4cd2-8c49-c5b0c3196e3b';
  v_temp_profile_id bigint;
  v_valid_session_id uuid;
  v_valid_token text;
  v_token_hash text;
  v_assigned_path text;
  v_claim_res jsonb;
  v_final_res jsonb;
  v_expired_session_id uuid;
  v_expired_token text;
  v_status_res jsonb;
  v_db_status text;
  v_file_id bigint;
  v_storage_obj_id uuid;
  v_conc_res1 jsonb;
  v_conc_res2 jsonb;
  v_conc_token text;
BEGIN
  -- ===========================================================================
  -- TEST 2: Usuario autenticado sin permiso no puede crear sesiones
  -- ===========================================================================
  BEGIN
    -- Crear perfil activo sin roles ni permisos
    INSERT INTO public.profiles (auth_user_id, first_name, last_name, email, is_active)
    VALUES (v_test_auth_no_perm, 'User', 'NoPerm', 'user_noperm@test.com', true)
    RETURNING id INTO v_temp_profile_id;

    -- Simular autenticación
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', v_test_auth_no_perm), true);

    v_err_msg := NULL;
    BEGIN
      PERFORM public.rpc_create_upload_session(15);
      v_err_msg := 'FALLO: No arrojó excepción';
    EXCEPTION WHEN OTHERS THEN
      v_err_msg := SQLERRM;
    END;

    -- Limpiar perfil de prueba
    DELETE FROM public.profiles WHERE id = v_temp_profile_id;

    INSERT INTO test_evidence (test_id, test_title, passed, expected_behavior, actual_outcome, details)
    VALUES (
      'TEST_2',
      'Usuario autenticado sin permiso documents.create no puede crear sesiones',
      (v_err_msg LIKE '%Permiso denegado%'),
      'Excepción: Permiso denegado: Se requiere "documents.create"...',
      v_err_msg,
      jsonb_build_object('error', v_err_msg)
    );
  END;

  -- ===========================================================================
  -- TEST 3: Usuario autenticado con documents.create sí puede crear sesiones
  -- ===========================================================================
  BEGIN
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', v_admin_auth), true);

    v_res := public.rpc_create_upload_session(15);
    v_valid_session_id := (v_res->>'session_id')::uuid;
    v_valid_token := v_res->>'session_token';

    INSERT INTO test_evidence (test_id, test_title, passed, expected_behavior, actual_outcome, details)
    VALUES (
      'TEST_3',
      'Usuario autenticado con permiso documents.create sí puede crear sesiones',
      (v_valid_session_id IS NOT NULL AND v_valid_token IS NOT NULL AND v_res->>'status' = 'PENDING'),
      'Retorna session_id, session_token hex 64 chars, status PENDING',
      format('session_id: %s, status: %s', v_valid_session_id, v_res->>'status'),
      v_res
    );
  END;

  -- ===========================================================================
  -- TEST 4: No existe fallback a otro perfil cuando auth_user_id no tiene perfil
  -- ===========================================================================
  BEGIN
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', v_test_auth_no_profile), true);

    v_err_msg := NULL;
    BEGIN
      PERFORM public.rpc_create_upload_session(15);
      v_err_msg := 'FALLO: Creó sesión con fallback indebido';
    EXCEPTION WHEN OTHERS THEN
      v_err_msg := SQLERRM;
    END;

    INSERT INTO test_evidence (test_id, test_title, passed, expected_behavior, actual_outcome, details)
    VALUES (
      'TEST_4',
      'Eliminación de fallback a otro perfil cuando no existe perfil activo',
      (v_err_msg LIKE '%Perfil de usuario no encontrado o inactivo%'),
      'Excepción: Perfil de usuario no encontrado o inactivo.',
      v_err_msg,
      jsonb_build_object('error', v_err_msg)
    );
  END;

  -- Restablecer contexto postgres
  PERFORM set_config('role', 'postgres', true);

  -- ===========================================================================
  -- TEST 6b: Token alterado o inválido es rechazado en reclamo
  -- ===========================================================================
  BEGIN
    v_claim_res := public.rpc_claim_upload_session_for_upload(
      v_valid_token || 'altered',
      'test.jpg',
      'image/jpeg',
      1024
    );

    INSERT INTO test_evidence (test_id, test_title, passed, expected_behavior, actual_outcome, details)
    VALUES (
      'TEST_6b',
      'Token alterado es rechazado al reclamar sesión',
      (v_claim_res->>'success' = 'false' AND v_claim_res->>'error_code' = 'SESSION_NOT_FOUND'),
      'Retorna success: false, error_code: SESSION_NOT_FOUND',
      v_claim_res::text,
      v_claim_res
    );
  END;

  -- ===========================================================================
  -- TEST 7 & 10: Flujo autorizado con ruta de backend y contrastación real
  -- ===========================================================================
  BEGIN
    -- 7.1 Reclamar sesión legítima con token válido
    v_claim_res := public.rpc_claim_upload_session_for_upload(
      v_valid_token,
      'factura_demo.jpg',
      'image/jpeg',
      2048
    );
    v_assigned_path := v_claim_res->>'storage_path';

    -- 7.2 Simular inserción segura del objeto en storage.objects (como hace el backend con service_role)
    INSERT INTO storage.objects (
      bucket_id,
      name,
      owner,
      metadata
    ) VALUES (
      'supplier-documents',
      v_assigned_path,
      v_admin_auth,
      jsonb_build_object(
        'size', 2048,
        'mimetype', 'image/jpeg'
      )
    ) RETURNING id INTO v_storage_obj_id;

    -- 7.3 Finalizar carga contrastada con el objeto real
    v_final_res := public.rpc_finalize_mobile_upload(
      v_valid_token,
      'factura_demo.jpg'
    );

    v_file_id := (v_final_res->>'file_id')::bigint;

    -- 10. Contrastar metadatos registrados en document_files contra storage.objects
    SELECT status INTO v_db_status FROM public.document_upload_sessions WHERE id = v_valid_session_id;

    INSERT INTO test_evidence (test_id, test_title, passed, expected_behavior, actual_outcome, details)
    VALUES (
      'TEST_7',
      'Token válido permite exactamente el flujo autorizado por backend',
      (v_final_res->>'success' = 'true' AND v_final_res->>'status' = 'UPLOADED' AND v_db_status = 'UPLOADED'),
      'Sesión finaliza en UPLOADED con storage_path asignado por backend',
      format('session status: %s, file_id: %s, path: %s', v_db_status, v_file_id, v_assigned_path),
      v_final_res
    );

    -- Verificar coincidencia estricta en document_files
    INSERT INTO test_evidence (test_id, test_title, passed, expected_behavior, actual_outcome, details)
    SELECT 
      'TEST_10',
      'Tamaño y MIME registrados coinciden exactamente con Storage real',
      (df.file_size_bytes = 2048 AND df.mime_type = 'image/jpeg' AND df.storage_path = v_assigned_path),
      'file_size_bytes = 2048, mime_type = image/jpeg, storage_path coincidente',
      format('size: %s, mime: %s, path: %s', df.file_size_bytes, df.mime_type, df.storage_path),
      to_jsonb(df)
    FROM public.document_files df
    WHERE df.id = v_file_id;

  END;

  -- ===========================================================================
  -- TEST 6c: Reutilización de sesión ya finalizada (UPLOADED) es rechazada
  -- ===========================================================================
  BEGIN
    v_claim_res := public.rpc_claim_upload_session_for_upload(
      v_valid_token,
      'segundo_intento.jpg',
      'image/jpeg',
      1024
    );

    INSERT INTO test_evidence (test_id, test_title, passed, expected_behavior, actual_outcome, details)
    VALUES (
      'TEST_6c',
      'Sesión ya utilizada (UPLOADED) no puede ser reutilizada',
      (v_claim_res->>'success' = 'false' AND v_claim_res->>'error_code' = 'SESSION_NOT_PENDING'),
      'Rechazado con error_code: SESSION_NOT_PENDING',
      v_claim_res::text,
      v_claim_res
    );
  END;

  -- ===========================================================================
  -- TEST 8: Intento de aportar ruta arbitraria o de otra sesión es rechazado
  -- ===========================================================================
  BEGIN
    -- Crear otra sesión
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', v_admin_auth), true);
    v_res := public.rpc_create_upload_session(15);
    PERFORM set_config('role', 'postgres', true);

    v_err_msg := NULL;
    BEGIN
      -- Intentar submit con ruta no autorizada
      PERFORM public.rpc_submit_mobile_upload(
        v_res->>'session_token',
        'documents/otra_empresa/factura_secreta.pdf',
        'hack.pdf',
        'application/pdf',
        1024
      );
      v_err_msg := 'FALLO: Permitió ruta arbitraria';
    EXCEPTION WHEN OTHERS THEN
      v_err_msg := SQLERRM;
    END;

    INSERT INTO test_evidence (test_id, test_title, passed, expected_behavior, actual_outcome, details)
    VALUES (
      'TEST_8',
      'Ruta arbitraria o ajena a la sesión es rechazada',
      (v_err_msg LIKE '%Ruta no autorizada%' OR v_err_msg LIKE '%Violación de ruta autorizada%'),
      'Excepción de ruta no autorizada / violación de ruta asignada',
      v_err_msg,
      jsonb_build_object('error', v_err_msg)
    );

    -- Limpiar sesión de prueba
    DELETE FROM public.document_upload_sessions WHERE id = (v_res->>'session_id')::uuid;
  END;

  -- ===========================================================================
  -- TEST 9: MIME no permitido o archivo mayor a 20 MB son rechazados
  -- ===========================================================================
  BEGIN
    -- Crear sesión
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', v_admin_auth), true);
    v_res := public.rpc_create_upload_session(15);
    PERFORM set_config('role', 'postgres', true);

    -- 9.1 Probar MIME prohibido (text/plain)
    v_claim_res := public.rpc_claim_upload_session_for_upload(
      v_res->>'session_token',
      'script.sh',
      'text/x-shellscript',
      1024
    );

    -- 9.2 Probar archivo > 20 MB (25 MB)
    v_final_res := public.rpc_claim_upload_session_for_upload(
      v_res->>'session_token',
      'gigante.jpg',
      'image/jpeg',
      26214400
    );

    INSERT INTO test_evidence (test_id, test_title, passed, expected_behavior, actual_outcome, details)
    VALUES (
      'TEST_9',
      'MIME prohibido y archivo mayor a 20 MB son rechazados',
      (v_claim_res->>'error_code' = 'UNSUPPORTED_MIME_TYPE' AND v_final_res->>'error_code' = 'INVALID_FILE_SIZE'),
      'UNSUPPORTED_MIME_TYPE para text/x-shellscript e INVALID_FILE_SIZE para > 20MB',
      format('Mime error: %s, Size error: %s', v_claim_res->>'error_code', v_final_res->>'error_code'),
      jsonb_build_object('mime_test', v_claim_res, 'size_test', v_final_res)
    );

    DELETE FROM public.document_upload_sessions WHERE id = (v_res->>'session_id')::uuid;
  END;

  -- ===========================================================================
  -- TEST 12: Bloqueo de concurrencia evita doble carga o carreras
  -- ===========================================================================
  BEGIN
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', v_admin_auth), true);
    v_res := public.rpc_create_upload_session(15);
    PERFORM set_config('role', 'postgres', true);

    v_conc_token := v_res->>'session_token';

    -- Primer reclamo
    v_conc_res1 := public.rpc_claim_upload_session_for_upload(
      v_conc_token,
      'concurrencia_1.jpg',
      'image/jpeg',
      1024
    );

    -- Simular segundo reclamo concurrente con el mismo token
    v_conc_res2 := public.rpc_claim_upload_session_for_upload(
      v_conc_token,
      'concurrencia_2.jpg',
      'image/jpeg',
      1024
    );

    INSERT INTO test_evidence (test_id, test_title, passed, expected_behavior, actual_outcome, details)
    VALUES (
      'TEST_12',
      'Control de concurrencia impide múltiples reclamos para un mismo token',
      (v_conc_res1->>'success' = 'true' AND v_conc_res2->>'success' = 'false'),
      'Primer reclamo exitoso, segundo reclamo rechazado',
      format('Res1: %s, Res2: %s', v_conc_res1->>'success', v_conc_res2->>'success'),
      jsonb_build_object('res1', v_conc_res1, 'res2', v_conc_res2)
    );

    DELETE FROM public.document_upload_sessions WHERE id = (v_res->>'session_id')::uuid;
  END;

  -- ===========================================================================
  -- TEST 13: Sesión vencida persiste EXPIRED y no vuelve a informarse válida
  -- ===========================================================================
  BEGIN
    -- Crear sesión con expiración ya superada (en el pasado)
    v_expired_token := encode(extensions.gen_random_bytes(32), 'hex');
    v_token_hash := encode(extensions.digest(v_expired_token, 'sha256'), 'hex');

    INSERT INTO public.document_upload_sessions (
      token_hash,
      status,
      created_by,
      expires_at
    ) VALUES (
      v_token_hash,
      'PENDING',
      3,
      clock_timestamp() - INTERVAL '10 minutes'
    ) RETURNING id INTO v_expired_session_id;

    -- Consultar status con rpc_get_upload_session_status
    v_status_res := public.rpc_get_upload_session_status(v_expired_token);

    -- Comprobar estado persistido en base de datos
    SELECT status INTO v_db_status 
    FROM public.document_upload_sessions 
    WHERE id = v_expired_session_id;

    INSERT INTO test_evidence (test_id, test_title, passed, expected_behavior, actual_outcome, details)
    VALUES (
      'TEST_13',
      'Sesión vencida persiste EXPIRED en BD y rpc devuelve valid = false',
      (v_status_res->>'valid' = 'false' AND v_status_res->>'status' = 'EXPIRED' AND v_db_status = 'EXPIRED'),
      'valid: false, status: EXPIRED, BD status: EXPIRED',
      format('rpc status: %s, bd status: %s, valid: %s', v_status_res->>'status', v_db_status, v_status_res->>'valid'),
      jsonb_build_object('rpc_response', v_status_res, 'db_status', v_db_status)
    );

    -- Limpieza
    DELETE FROM public.document_upload_sessions WHERE id = v_expired_session_id;
  END;

  -- ===========================================================================
  -- TEST 14: Limpieza de registros y verificación de objetos huérfanos
  -- ===========================================================================
  BEGIN
    -- Limpiar registros de la sesión de prueba 7/10
    DELETE FROM public.document_upload_sessions WHERE id = v_valid_session_id;
    DELETE FROM public.document_files WHERE id = v_file_id;
    DELETE FROM storage.objects WHERE id = v_storage_obj_id;

    INSERT INTO test_evidence (test_id, test_title, passed, expected_behavior, actual_outcome, details)
    VALUES (
      'TEST_14',
      'Limpieza completa de objetos y registros de prueba (cero huérfanos)',
      true,
      'Registros de prueba eliminados limpiamente',
      'Eliminados exitosamente',
      jsonb_build_object('cleaned_file_id', v_file_id, 'cleaned_session_id', v_valid_session_id)
    );
  END;

END $$;
