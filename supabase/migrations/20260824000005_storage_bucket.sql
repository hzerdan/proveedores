-- ============================================================================
-- MIGRACIÓN 5: Configuración de Bucket de Storage para Comprobantes
-- Fecha: 2026-08-24
-- ============================================================================

-- Crear bucket de storage si no existe
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'supplier-documents',
    'supplier-documents',
    false,
    20971520, -- 20MB
    ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/tiff']
)
ON CONFLICT (id) DO NOTHING;

-- Políticas de Seguridad en Storage
CREATE POLICY "supplier_docs_select_auth" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'supplier-documents');

CREATE POLICY "supplier_docs_insert_auth" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'supplier-documents');
