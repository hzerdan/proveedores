-- ==============================================================================
-- Migration: 20260907000030_fix_auth_users_null_tokens_for_gotrue.sql
-- Description: Inicializar tokens vacíos en auth.users para evitar el error de
--              escaneo de GoTrue (Scan error: converting NULL to string is unsupported).
-- ==============================================================================

UPDATE auth.users
SET 
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, '')
WHERE 
  confirmation_token IS NULL 
  OR recovery_token IS NULL 
  OR email_change_token_new IS NULL 
  OR email_change_token_current IS NULL;
