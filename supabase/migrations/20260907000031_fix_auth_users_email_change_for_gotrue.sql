-- ==============================================================================
-- Migration: 20260907000031_fix_auth_users_email_change_for_gotrue.sql
-- Description: Inicializar email_change en vacío en auth.users para satisfacer
--              el escaneo estricto de GoTrue al validar credenciales.
-- ==============================================================================

UPDATE auth.users
SET email_change = COALESCE(email_change, '')
WHERE email_change IS NULL;
