-- ==============================================================================
-- Migration: 20260907000028_prevent_concurrent_session_claims.sql
-- Description: Impedir reclamos concurrentes o múltiples en rpc_claim_upload_session_for_upload.
--              Garantiza que una sesión no pueda ser reclamada más de una vez
--              rechazando intentos si storage_path ya fue asignado.
-- ==============================================================================

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

  -- Bloqueo pesimista exclusivo para evitar colisiones y carreras concurrentes
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

  -- Impedir reclamos múltiples o concurrentes para la misma sesión
  IF v_session.storage_path IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'SESSION_ALREADY_CLAIMED', 'message', 'Esta sesión ya fue reclamada para carga y tiene una ruta asignada en proceso.');
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

  -- Generar ruta única vinculada a la sesión
  v_storage_path := format('temp-uploads/%s/%s_%s.%s', 
    v_session.id, 
    extract(epoch from clock_timestamp())::bigint, 
    encode(extensions.gen_random_bytes(8), 'hex'), 
    v_ext
  );

  -- Vincular ruta a la sesión atómicamente bajo el bloqueo FOR UPDATE
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
