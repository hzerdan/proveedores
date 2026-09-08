-- ==============================================================================
-- Migration: 20260907000029_strict_auth_current_user_and_gotrue_grant.sql
-- Description: 1. Elimina todo fallback a perfiles predeterminados en
--                 current_app_user_id(). Devuelve NULL si auth.uid() es NULL
--                 o si el usuario autenticado no tiene perfil activo.
--              2. Otorga permisos de USAGE y EXECUTE sobre el esquema extensions
--                 al rol supabase_auth_admin para permitir la autenticación de
--                 GoTrue sin errores de resolución de funciones criptográficas.
-- ==============================================================================

-- 1. Actualizar current_app_user_id() eliminando cualquier fallback
CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS bigint
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid;
  v_user_id bigint;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_user_id
  FROM public.profiles
  WHERE auth_user_id = v_uid AND is_active = true
  LIMIT 1;

  RETURN v_user_id;
END;
$function$;

ALTER FUNCTION public.current_app_user_id() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.current_app_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_app_user_id() TO authenticated, service_role;

-- 2. Conceder privilegios necesarios a supabase_auth_admin sobre el esquema extensions
GRANT USAGE ON SCHEMA extensions TO supabase_auth_admin;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO supabase_auth_admin;
