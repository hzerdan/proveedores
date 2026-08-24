-- ============================================================================
-- MIGRATION: Document Intake, QR Sessions & Quick Supplier Creation (v4.1)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Table: document_upload_sessions
CREATE TABLE IF NOT EXISTS document_upload_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING, UPLOADED, PROCESSING, COMPLETED, EXPIRED, CANCELLED, FAILED
  created_by BIGINT REFERENCES profiles(id),
  file_id BIGINT REFERENCES document_files(id),
  document_id BIGINT REFERENCES documents(id),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_upload_sessions_token_hash ON document_upload_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_status_exp ON document_upload_sessions(status, expires_at);

-- 2. Function: Validate Argentine CUIT (mod 11)
CREATE OR REPLACE FUNCTION fn_validate_cuit(p_cuit VARCHAR)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_clean VARCHAR;
  v_sum INT := 0;
  v_multipliers INT[] := ARRAY[5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  v_check_digit INT;
  v_calc_digit INT;
  i INT;
BEGIN
  -- Strip dashes, dots, spaces
  v_clean := regexp_replace(p_cuit, '[^0-9]', '', 'g');
  
  IF length(v_clean) <> 11 THEN
    RETURN FALSE;
  END IF;

  FOR i IN 1..10 LOOP
    v_sum := v_sum + (substring(v_clean from i for 1)::INT * v_multipliers[i]);
  END LOOP;

  v_calc_digit := 11 - (v_sum % 11);
  IF v_calc_digit = 11 THEN
    v_calc_digit := 0;
  ELSIF v_calc_digit = 10 THEN
    v_calc_digit := 9;
  END IF;

  v_check_digit := substring(v_clean from 11 for 1)::INT;
  RETURN v_calc_digit = v_check_digit;
END;
$$;

-- 3. RPC: Create Upload Session (PC side)
CREATE OR REPLACE FUNCTION rpc_create_upload_session(
  p_expires_in_minutes INT DEFAULT 15
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_raw_token VARCHAR(64);
  v_token_hash VARCHAR(64);
  v_session_id UUID;
  v_user_id BIGINT;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Authenticated user ID (defaulting to system/profile if anon for development)
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
    'session_token', v_raw_token, -- returned once to PC to put in QR
    'expires_at', v_expires_at,
    'status', 'PENDING'
  );
END;
$$;

-- 4. RPC: Get Upload Session Status (Minimal Public Scope for Mobile/PC Polling)
CREATE OR REPLACE FUNCTION rpc_get_upload_session_status(
  p_session_token VARCHAR
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token_hash VARCHAR(64);
  v_session document_upload_sessions%ROWTYPE;
  v_file_record document_files%ROWTYPE;
BEGIN
  IF p_session_token IS NULL OR length(p_session_token) < 10 THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Token inválido');
  END IF;

  v_token_hash := encode(digest(p_session_token, 'sha256'), 'hex');

  SELECT * INTO v_session 
  FROM document_upload_sessions 
  WHERE token_hash = v_token_hash;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Sesión no encontrada');
  END IF;

  -- Check expiration
  IF v_session.status = 'PENDING' AND now() > v_session.expires_at THEN
    UPDATE document_upload_sessions SET status = 'EXPIRED' WHERE id = v_session.id;
    RETURN jsonb_build_object('valid', false, 'status', 'EXPIRED', 'error', 'La sesión ha expirado');
  END IF;

  -- If uploaded, fetch file details
  IF v_session.file_id IS NOT NULL THEN
    SELECT * INTO v_file_record FROM document_files WHERE id = v_session.file_id;
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'session_id', v_session.id,
    'status', v_session.status,
    'expires_at', v_session.expires_at,
    'file_id', v_session.file_id,
    'file_name', v_file_record.file_name,
    'storage_path', v_file_record.storage_path,
    'mime_type', v_file_record.mime_type
  );
END;
$$;

-- 5. RPC: Submit Mobile Upload (Authorized by Token Hash)
CREATE OR REPLACE FUNCTION rpc_submit_mobile_upload(
  p_session_token VARCHAR,
  p_storage_path TEXT,
  p_file_name TEXT,
  p_mime_type TEXT,
  p_file_size BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token_hash VARCHAR(64);
  v_session document_upload_sessions%ROWTYPE;
  v_file_id BIGINT;
BEGIN
  IF p_session_token IS NULL OR length(p_session_token) < 10 THEN
    RAISE EXCEPTION 'Token de sesión inválido';
  END IF;

  v_token_hash := encode(digest(p_session_token, 'sha256'), 'hex');

  SELECT * INTO v_session 
  FROM document_upload_sessions 
  WHERE token_hash = v_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesión no encontrada o token inválido';
  END IF;

  IF v_session.status <> 'PENDING' THEN
    RAISE EXCEPTION 'La sesión no está disponible para subida (Estado: %)', v_session.status;
  END IF;

  IF now() > v_session.expires_at THEN
    UPDATE document_upload_sessions SET status = 'EXPIRED' WHERE id = v_session.id;
    RAISE EXCEPTION 'La sesión ha expirado';
  END IF;

  -- Register in document_files
  INSERT INTO document_files (
    storage_bucket,
    storage_path,
    file_name,
    mime_type,
    file_size_bytes,
    file_category,
    uploaded_by
  ) VALUES (
    'supplier-documents',
    p_storage_path,
    p_file_name,
    COALESCE(p_mime_type, 'image/jpeg'),
    COALESCE(p_file_size, 0),
    'INVOICE_IMAGE',
    v_session.created_by
  ) RETURNING id INTO v_file_id;

  -- Update session to UPLOADED and record completion
  UPDATE document_upload_sessions
  SET 
    status = 'UPLOADED',
    file_id = v_file_id,
    completed_at = now()
  WHERE id = v_session.id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_session.id,
    'file_id', v_file_id,
    'status', 'UPLOADED'
  );
END;
$$;

-- 6. RPC: Quick Create Supplier "On the Fly"
CREATE OR REPLACE FUNCTION rpc_quick_create_supplier(
  p_tax_id VARCHAR,
  p_trade_name VARCHAR,
  p_legal_name VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_clean_cuit VARCHAR;
  v_formatted_cuit VARCHAR;
  v_existing_id BIGINT;
  v_new_supplier suppliers%ROWTYPE;
  v_next_code VARCHAR(20);
  v_count INT;
BEGIN
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
$$;

-- 7. Storage and document_files RLS Policies
DROP POLICY IF EXISTS "supplier_docs_insert_auth" ON storage.objects;
DROP POLICY IF EXISTS "supplier_docs_select_auth" ON storage.objects;
DROP POLICY IF EXISTS "supplier_docs_all_auth" ON storage.objects;
DROP POLICY IF EXISTS "supplier_docs_insert" ON storage.objects;
DROP POLICY IF EXISTS "supplier_docs_select" ON storage.objects;
DROP POLICY IF EXISTS "supplier_docs_update" ON storage.objects;

CREATE POLICY "supplier_docs_insert"
ON storage.objects FOR INSERT
TO authenticated, anon
WITH CHECK (bucket_id = 'supplier-documents');

CREATE POLICY "supplier_docs_select"
ON storage.objects FOR SELECT
TO authenticated, anon
USING (bucket_id = 'supplier-documents');

CREATE POLICY "supplier_docs_update"
ON storage.objects FOR UPDATE
TO authenticated, anon
USING (bucket_id = 'supplier-documents')
WITH CHECK (bucket_id = 'supplier-documents');

-- 8. RPC: Register Document File
CREATE OR REPLACE FUNCTION rpc_register_document_file(
  p_storage_path TEXT,
  p_file_name TEXT,
  p_mime_type TEXT,
  p_file_size BIGINT,
  p_file_category TEXT DEFAULT 'INVOICE_PDF'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id BIGINT;
  v_file_id BIGINT;
BEGIN
  v_user_id := current_app_user_id();

  INSERT INTO document_files (
    storage_bucket,
    storage_path,
    file_name,
    mime_type,
    file_size_bytes,
    file_category,
    uploaded_by
  ) VALUES (
    'supplier-documents',
    p_storage_path,
    p_file_name,
    COALESCE(p_mime_type, 'application/pdf'),
    COALESCE(p_file_size, 0),
    COALESCE(p_file_category, 'INVOICE_PDF'),
    v_user_id
  ) RETURNING id INTO v_file_id;

  RETURN jsonb_build_object(
    'success', true,
    'file_id', v_file_id
  );
END;
$$;

