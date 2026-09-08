-- ============================================================================
-- MIGRACIÓN: 20260907000019_cleanup_legacy_desimputacion_type.sql
-- PROYECTO: Sistema de Cuentas Corrientes de Proveedores
-- OBJETIVO:
--   Eliminar el tipo documental legado 'DESIMPUTACION' de document_types.
--   Las desimputaciones son documentos de tipo 'APL' y comparten serie unificada.
-- ============================================================================

DO $$
BEGIN
    -- Verificar que no haya documentos asociados antes de eliminar
    IF EXISTS (
        SELECT 1 FROM public.documents d
        JOIN public.document_types dt ON dt.id = d.document_type_id
        WHERE dt.code = 'DESIMPUTACION'
    ) THEN
        RAISE EXCEPTION 'No se puede eliminar el tipo DESIMPUTACION porque existen comprobantes asociados.';
    END IF;

    DELETE FROM public.document_types WHERE code = 'DESIMPUTACION';
END $$;
