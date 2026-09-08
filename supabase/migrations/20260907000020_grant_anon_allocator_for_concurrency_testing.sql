-- ============================================================================
-- MIGRACIÓN: 20260907000020_grant_anon_allocator_for_concurrency_testing.sql
-- PROYECTO: Sistema de Cuentas Corrientes de Proveedores
-- OBJETIVO:
--   Permitir ejecución de fn_allocate_internal_document_number vía PostgREST
--   para pruebas de concurrencia real multi-conexión con @supabase/supabase-js.
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.fn_allocate_internal_document_number(bigint, varchar, boolean) TO anon;
