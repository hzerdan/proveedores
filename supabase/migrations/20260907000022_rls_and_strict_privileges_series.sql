-- ============================================================================
-- MIGRACIÓN: 20260907000022_rls_and_strict_privileges_series.sql
-- PROYECTO: Sistema de Cuentas Corrientes de Proveedores
-- OBJETIVO:
--   1. Activar RLS en document_numbering_series y document_numbering_series_adjustments
--   2. Revocar todo acceso de anon y PUBLIC sobre series y ajustes
--   3. Políticas RLS estrictas (solo authenticated; modificaciones solo con system.manage)
-- ============================================================================

-- 1. Revocar todo permiso a anon y PUBLIC
REVOKE ALL ON TABLE public.document_numbering_series FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.document_numbering_series_adjustments FROM anon, PUBLIC;

-- 2. Conceder permisos únicamente a authenticated y service_role
GRANT SELECT ON public.document_numbering_series TO authenticated;
GRANT INSERT, UPDATE ON public.document_numbering_series TO authenticated;
GRANT SELECT ON public.document_numbering_series_adjustments TO authenticated;
GRANT ALL ON public.document_numbering_series TO service_role;
GRANT ALL ON public.document_numbering_series_adjustments TO service_role;

-- 3. Habilitar RLS
ALTER TABLE public.document_numbering_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_numbering_series FORCE ROW LEVEL SECURITY;

ALTER TABLE public.document_numbering_series_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_numbering_series_adjustments FORCE ROW LEVEL SECURITY;

-- 4. Políticas para document_numbering_series
DROP POLICY IF EXISTS "doc_numbering_series_select" ON public.document_numbering_series;
CREATE POLICY "doc_numbering_series_select" ON public.document_numbering_series
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "doc_numbering_series_insert" ON public.document_numbering_series;
CREATE POLICY "doc_numbering_series_insert" ON public.document_numbering_series
FOR INSERT TO authenticated
WITH CHECK (public.has_permission('system.manage'));

DROP POLICY IF EXISTS "doc_numbering_series_update" ON public.document_numbering_series;
CREATE POLICY "doc_numbering_series_update" ON public.document_numbering_series
FOR UPDATE TO authenticated
USING (public.has_permission('system.manage'))
WITH CHECK (public.has_permission('system.manage'));

-- 5. Políticas para document_numbering_series_adjustments
DROP POLICY IF EXISTS "doc_numbering_adjustments_select" ON public.document_numbering_series_adjustments;
CREATE POLICY "doc_numbering_adjustments_select" ON public.document_numbering_series_adjustments
FOR SELECT TO authenticated
USING (public.has_permission('audit.view') OR public.has_permission('system.manage'));

DROP POLICY IF EXISTS "doc_numbering_adjustments_insert" ON public.document_numbering_series_adjustments;
CREATE POLICY "doc_numbering_adjustments_insert" ON public.document_numbering_series_adjustments
FOR INSERT TO authenticated
WITH CHECK (public.has_permission('system.manage'));
