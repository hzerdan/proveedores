-- ==============================================================================
-- Migration: 20260907000027_qualify_pgcrypto_extensions_search_path.sql
-- Description: Calificar explícitamente extensions.gen_random_bytes y
--              extensions.digest, y fijar search_path TO public, extensions
--              en todas las funciones de sesión de subida móvil.
-- ==============================================================================

-- 1. rpc_create_upload_session
CREATE OR REPLACE FUNCTION public.rpc_create_upload_session(p_expires_in_minutes integer DEFAULT 15)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_raw_token VARCHAR(64);
  v_token_hash VARCHAR(64);
  v_session_id UUID;
  v_user_id BIGINT;
  v_expires_at TIMESTAMPTZ;
  v_expires_mins INT;
BEGIN
  -- Validar que la invocación provenga de un usuario autenticado
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Acceso no autorizado: Se requiere una sesión autenticada para crear sesiones de captura.';
  END IF;

  -- Obtener perfil activo del usuario autenticado (sin ningún fallback)
  SELECT id INTO v_user_id
  FROM public.profiles
  WHERE auth_user_id = auth.uid() AND is_active = true
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Perfil de usuario no encontrado o inactivo.';
  END IF;

  -- Validar permiso funcional
  IF NOT public.has_permission('documents.create') THEN
    RAISE EXCEPTION 'Permiso denegado: Se requiere "documents.create" para iniciar sesiones de captura móvil.';
  END IF;

  -- Limitar expiración entre 1 y 60 minutos (default 15)
  v_expires_mins := GREATEST(1, LEAST(COALESCE(p_expires_in_minutes, 15), 60));
  v_expires_at := clock_timestamp() + (v_expires_mins || ' minutes')::INTERVAL;

  -- Generar token criptográfico hex de 64 caracteres calificando extensions
  v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := encode(extensions.digest(v_raw_token, 'sha256'), 'hex');

  INSERT INTO public.document_upload_sessions (token_hash, status, created_by, expires_at)
  VALUES (v_token_hash, 'PENDING', v_user_id, v_expires_at)
  RETURNING id INTO v_session_id;

  RETURN jsonb_build_object(
    'session_id', v_session_id,
    'session_token', v_raw_token,
    'expires_at', v_expires_at,
    'status', 'PENDING'
  );
END;
$function$;

ALTER FUNCTION public.rpc_create_upload_session(integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rpc_create_upload_session(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_upload_session(integer) TO authenticated, service_role;

-- 2. rpc_get_upload_session_status
CREATE OR REPLACE FUNCTION public.rpc_get_upload_session_status(p_session_token character varying)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_token_hash VARCHAR(64);
  v_session public.document_upload_sessions%ROWTYPE;
  v_file_record public.document_files%ROWTYPE;
BEGIN
  IF p_session_token IS NULL OR length(trim(p_session_token)) < 10 THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Token inválido');
  END IF;

  v_token_hash := encode(extensions.digest(trim(p_session_token), 'sha256'), 'hex');

  SELECT * INTO v_session 
  FROM public.document_upload_sessions 
  WHERE token_hash = v_token_hash;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Sesión no encontrada');
  END IF;

  -- Verificar expiración y persistir cambio a EXPIRED atómicamente sin abortar transacción
  IF v_session.status = 'PENDING' AND clock_timestamp() > v_session.expires_at THEN
    UPDATE public.document_upload_sessions 
    SET status = 'EXPIRED' 
    WHERE id = v_session.id;

    RETURN jsonb_build_object(
      'valid', false,
      'session_id', v_session.id,
      'status', 'EXPIRED',
      'error', 'La sesión ha expirado'
    );
  END IF;

  IF v_session.status = 'EXPIRED' THEN
    RETURN jsonb_build_object(
      'valid', false,
      'session_id', v_session.id,
      'status', 'EXPIRED',
      'error', 'La sesión ha expirado'
    );
  END IF;

  -- Si ya fue cargado, consultar detalles del archivo
  IF v_session.file_id IS NOT NULL THEN
    SELECT * INTO v_file_record FROM public.document_files WHERE id = v_session.file_id;
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'session_id', v_session.id,
    'status', v_session.status,
    'expires_at', v_session.expires_at,
    'storage_path', v_session.storage_path,
    'file_id', v_session.file_id,
    'file_name', v_file_record.file_name,
    'mime_type', v_file_record.mime_type
  );
END;
$function$;

ALTER FUNCTION public.rpc_get_upload_session_status(character varying) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rpc_get_upload_session_status(character varying) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_get_upload_session_status(character varying) TO anon, authenticated, service_role;

-- 3. rpc_claim_upload_session_for_upload
CREATE OR REPLACE FUNCTION public.rpc_claim_upload_session_for_upload(
  p_session_token text,
  p_file_name text,
  p_mime_type text,
  p_file_size bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_token_hash VARCHAR(64);
  v_session public.document_upload_sessions%ROWTYPE;
  v_ext text;
  v_storage_path text;
BEGIN
  IF p_session_token IS NULL OR length(trim(p_session_token)) < 10 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_TOKEN', 'message', 'Token de sesión inválido.');
  END IF;

  v_token_hash := encode(extensions.digest(trim(p_session_token), 'sha256'), 'hex');

  -- Bloqueo pesimista para evitar colisiones concurrentes
  SELECT * INTO v_session 
  FROM public.document_upload_sessions 
  WHERE token_hash = v_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'SESSION_NOT_FOUND', 'message', 'Sesión no encontrada o token inválido.');
  END IF;

  IF v_session.status <> 'PENDING' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'SESSION_NOT_PENDING', 'message', format('Esta sesión ya fue utilizada o se encuentra en estado: %s', v_session.status));
  END IF;

  -- Comprobar expiración persistiendo EXPIRED
  IF clock_timestamp() > v_session.expires_at THEN
    UPDATE public.document_upload_sessions SET status = 'EXPIRED' WHERE id = v_session.id;
    RETURN jsonb_build_object('success', false, 'error_code', 'SESSION_EXPIRED', 'message', 'La sesión ha expirado.');
  END IF;

  -- Validar MIME permitido
  IF p_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNSUPPORTED_MIME_TYPE', 'message', format('Tipo MIME no permitido: %s', p_mime_type));
  END IF;

  -- Validar tamaño máximo (20 MB)
  IF p_file_size <= 0 OR p_file_size > 20971520 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_FILE_SIZE', 'message', 'El tamaño del archivo debe ser mayor a 0 y no superar los 20 MB.');
  END IF;

  -- Determinar extensión limpia
  v_ext := CASE 
    WHEN p_mime_type = 'application/pdf' THEN 'pdf'
    WHEN p_mime_type = 'image/png' THEN 'png'
    WHEN p_mime_type = 'image/webp' THEN 'webp'
    ELSE 'jpg'
  END;

  -- Generar ruta única vinculada a la sesión calificando extensions
  v_storage_path := format('temp-uploads/%s/%s_%s.%s', 
    v_session.id, 
    extract(epoch from clock_timestamp())::bigint, 
    encode(extensions.gen_random_bytes(8), 'hex'), 
    v_ext
  );

  -- Vincular ruta a la sesión
  UPDATE public.document_upload_sessions
  SET storage_path = v_storage_path
  WHERE id = v_session.id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_session.id,
    'storage_path', v_storage_path,
    'created_by', v_session.created_by
  );
END;
$function$;

ALTER FUNCTION public.rpc_claim_upload_session_for_upload(text, text, text, bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rpc_claim_upload_session_for_upload(text, text, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_claim_upload_session_for_upload(text, text, text, bigint) TO anon, authenticated, service_role;

-- 4. rpc_finalize_mobile_upload
CREATE OR REPLACE FUNCTION public.rpc_finalize_mobile_upload(
  p_session_token text,
  p_file_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_token_hash VARCHAR(64);
  v_session public.document_upload_sessions%ROWTYPE;
  v_storage_obj record;
  v_actual_size bigint;
  v_actual_mime text;
  v_file_id bigint;
  v_clean_name text;
BEGIN
  IF p_session_token IS NULL OR length(trim(p_session_token)) < 10 THEN
    RAISE EXCEPTION 'Token de sesión inválido.';
  END IF;

  v_token_hash := encode(extensions.digest(trim(p_session_token), 'sha256'), 'hex');

  -- Bloqueo pesimista de sesión
  SELECT * INTO v_session 
  FROM public.document_upload_sessions 
  WHERE token_hash = v_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesión no encontrada o token inválido.';
  END IF;

  IF v_session.status <> 'PENDING' THEN
    RAISE EXCEPTION 'La sesión no se encuentra en estado PENDING (Estado actual: %).', v_session.status;
  END IF;

  IF clock_timestamp() > v_session.expires_at THEN
    UPDATE public.document_upload_sessions SET status = 'EXPIRED' WHERE id = v_session.id;
    RAISE EXCEPTION 'La sesión ha expirado.';
  END IF;

  IF v_session.storage_path IS NULL THEN
    RAISE EXCEPTION 'No existe ruta autorizada vinculada a esta sesión.';
  END IF;

  -- Validar existencia efectiva del objeto en storage.objects
  SELECT * INTO v_storage_obj
  FROM storage.objects
  WHERE bucket_id = 'supplier-documents' AND name = v_session.storage_path;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El objeto no existe en el almacenamiento en la ruta autorizada: %', v_session.storage_path;
  END IF;

  -- Contrastar metadatos reales del objeto
  v_actual_size := COALESCE((v_storage_obj.metadata->>'size')::bigint, 0);
  v_actual_mime := v_storage_obj.metadata->>'mimetype';

  IF v_actual_size <= 0 OR v_actual_size > 20971520 THEN
    RAISE EXCEPTION 'El tamaño del objeto almacenado (% bytes) es inválido o excede los 20 MB.', v_actual_size;
  END IF;

  IF v_actual_mime NOT IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') THEN
    RAISE EXCEPTION 'El tipo MIME del objeto almacenado (%) no está permitido.', v_actual_mime;
  END IF;

  v_clean_name := regexp_replace(COALESCE(NULLIF(trim(p_file_name), ''), 'comprobante_movil.jpg'), '[^a-zA-Z0-9._-]', '_', 'g');

  -- Registrar en document_files con los metadatos reales contrastados
  INSERT INTO public.document_files (
    storage_bucket,
    storage_path,
    file_name,
    mime_type,
    file_size_bytes,
    file_category,
    uploaded_by
  ) VALUES (
    'supplier-documents',
    v_session.storage_path,
    v_clean_name,
    v_actual_mime,
    v_actual_size,
    'INVOICE_IMAGE',
    v_session.created_by
  ) RETURNING id INTO v_file_id;

  -- Cerrar sesión como UPLOADED
  UPDATE public.document_upload_sessions
  SET 
    status = 'UPLOADED',
    file_id = v_file_id,
    completed_at = clock_timestamp()
  WHERE id = v_session.id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_session.id,
    'file_id', v_file_id,
    'storage_path', v_session.storage_path,
    'status', 'UPLOADED'
  );
END;
$function$;

ALTER FUNCTION public.rpc_finalize_mobile_upload(text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rpc_finalize_mobile_upload(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_finalize_mobile_upload(text, text) TO anon, authenticated, service_role;

-- 5. rpc_submit_mobile_upload
CREATE OR REPLACE FUNCTION public.rpc_submit_mobile_upload(
  p_session_token character varying,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_file_size bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_token_hash VARCHAR(64);
  v_session public.document_upload_sessions%ROWTYPE;
  v_storage_obj record;
  v_actual_size bigint;
  v_actual_mime text;
  v_file_id BIGINT;
  v_expected_path text;
BEGIN
  IF p_session_token IS NULL OR length(trim(p_session_token)) < 10 THEN
    RAISE EXCEPTION 'Token de sesión inválido';
  END IF;

  v_token_hash := encode(extensions.digest(trim(p_session_token), 'sha256'), 'hex');

  SELECT * INTO v_session 
  FROM public.document_upload_sessions 
  WHERE token_hash = v_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesión no encontrada o token inválido';
  END IF;

  IF v_session.status <> 'PENDING' THEN
    RAISE EXCEPTION 'La sesión no está disponible para subida (Estado: %)', v_session.status;
  END IF;

  IF clock_timestamp() > v_session.expires_at THEN
    UPDATE public.document_upload_sessions SET status = 'EXPIRED' WHERE id = v_session.id;
    RAISE EXCEPTION 'La sesión ha expirado';
  END IF;

  -- Determinar ruta: Si la sesión ya tenía una ruta autorizada en backend, debe coincidir estrictamente
  IF v_session.storage_path IS NOT NULL THEN
    IF p_storage_path <> v_session.storage_path THEN
      RAISE EXCEPTION 'Violación de ruta autorizada: La ruta enviada no coincide con la asignada a la sesión.';
    END IF;
    v_expected_path := v_session.storage_path;
  ELSE
    -- Validar que la ruta comience por temp-uploads/<session_id>/
    IF NOT (p_storage_path ~~ format('temp-uploads/%s/%%', v_session.id)) THEN
      RAISE EXCEPTION 'Ruta no autorizada: El objeto debe residir en temp-uploads/<session_id>/.';
    END IF;
    v_expected_path := p_storage_path;
    UPDATE public.document_upload_sessions SET storage_path = v_expected_path WHERE id = v_session.id;
  END IF;

  -- Contrastar contra el objeto REAL en storage.objects
  SELECT * INTO v_storage_obj
  FROM storage.objects
  WHERE bucket_id = 'supplier-documents' AND name = v_expected_path;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El objeto no existe en el almacenamiento en la ruta especificada.';
  END IF;

  v_actual_size := COALESCE((v_storage_obj.metadata->>'size')::bigint, 0);
  v_actual_mime := v_storage_obj.metadata->>'mimetype';

  IF v_actual_size <= 0 OR v_actual_size > 20971520 THEN
    RAISE EXCEPTION 'El tamaño del objeto real excede el límite máximo de 20 MB o es 0.';
  END IF;

  IF v_actual_mime NOT IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') THEN
    RAISE EXCEPTION 'El tipo MIME del objeto real (%) no está permitido.', v_actual_mime;
  END IF;

  -- Registrar en document_files con los metadatos verificados
  INSERT INTO public.document_files (
    storage_bucket,
    storage_path,
    file_name,
    mime_type,
    file_size_bytes,
    file_category,
    uploaded_by
  ) VALUES (
    'supplier-documents',
    v_expected_path,
    COALESCE(NULLIF(trim(p_file_name), ''), 'comprobante.jpg'),
    v_actual_mime,
    v_actual_size,
    'INVOICE_IMAGE',
    v_session.created_by
  ) RETURNING id INTO v_file_id;

  -- Actualizar sesión
  UPDATE public.document_upload_sessions
  SET 
    status = 'UPLOADED',
    file_id = v_file_id,
    completed_at = clock_timestamp()
  WHERE id = v_session.id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_session.id,
    'file_id', v_file_id,
    'status', 'UPLOADED'
  );
END;
$function$;

ALTER FUNCTION public.rpc_submit_mobile_upload(character varying, text, text, text, bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rpc_submit_mobile_upload(character varying, text, text, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_submit_mobile_upload(character varying, text, text, text, bigint) TO anon, authenticated, service_role;
