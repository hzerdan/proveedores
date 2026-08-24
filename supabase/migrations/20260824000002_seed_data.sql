-- ============================================================================
-- MIGRACIÓN 2: Datos Semilla (Document Types, Roles, Permissions)
-- Fecha: 2026-08-24
-- ============================================================================

-- 1. Catálogo Parametrizado de Tipos de Documento
INSERT INTO document_types (
    code, name, description, balance_nature, affects_account_balance, 
    can_be_source_application, can_be_target_application, requires_due_date, is_system_internal
) VALUES 
    ('FACTURA', 'Factura', 'Comprobante de compra o servicio que genera deuda.', 'DEBIT', true, false, true, true, false),
    ('NOTA_DEBITO', 'Nota de Débito', 'Incremento de deuda por intereses, cargos o diferencias.', 'DEBIT', true, false, true, true, false),
    ('ORDEN_PAGO', 'Orden de Pago', 'Comprobante de pago o transferencia que cancela deuda o genera crédito.', 'CREDIT', true, true, false, false, false),
    ('NOTA_CREDITO', 'Nota de Crédito', 'Bonificación, descuento o devolución que reduce deuda.', 'CREDIT', true, true, false, false, false),
    ('RECIBO', 'Recibo de Pago', 'Constancia de cancelación o entrega de fondos.', 'CREDIT', true, true, false, false, false),
    ('ANTICIPO', 'Anticipo a Proveedor', 'Pago previo sin comprobante de deuda inicial asociado.', 'CREDIT', true, true, false, false, false),
    ('RETENCION', 'Certificado de Retención', 'Retención impositiva aplicada en la cancelación.', 'CREDIT', true, true, false, false, false),
    ('AJUSTE_DEBITO', 'Ajuste de Débito', 'Ajuste operativo que incrementa la deuda con el proveedor.', 'DEBIT', true, false, true, false, false),
    ('AJUSTE_CREDITO', 'Ajuste de Crédito / Reversión', 'Ajuste compensatorio que reduce deuda o revierte un débito erróneo.', 'CREDIT', true, true, false, false, false),
    ('PROFORMA', 'Factura Proforma / Presupuesto', 'Documento informativo previo sin impacto económico.', 'NEUTRAL', false, false, false, false, false),
    ('DESIMPUTACION', 'Documento de Desimputación', 'Documento de control interno para revertir aplicaciones sin alterar saldo global.', 'NEUTRAL', false, false, false, false, true)
ON CONFLICT (code) DO NOTHING;

-- 2. Catálogo de Roles
INSERT INTO roles (code, name, description) VALUES
    ('ADMIN', 'Administrador del Sistema', 'Acceso irrestricto, configuración de seguridad y parametrización.'),
    ('ENCARGADO', 'Encargado de Cuentas por Pagar', 'Gestión de proveedores, reversiones, desimputaciones y excepciones auditadas.'),
    ('OPERADOR', 'Operador Administrativo', 'Carga manual, revisión de IA, confirmación de comprobantes y aplicaciones.')
ON CONFLICT (code) DO NOTHING;

-- 3. Catálogo de Permisos Granulares
INSERT INTO permissions (code, module, description) VALUES
    ('documents.view', 'DOCUMENTS', 'Visualizar comprobantes y estados de cuenta.'),
    ('documents.create', 'DOCUMENTS', 'Crear borradores manuales o subir archivos para extracción IA.'),
    ('documents.ai_review', 'DOCUMENTS', 'Revisar y corregir datos derivados de la extracción por IA.'),
    ('documents.confirm', 'DOCUMENTS', 'Confirmar comprobantes e impactar inmediatamente en cuenta corriente.'),
    ('documents.edit_meta', 'DOCUMENTS', 'Editar observaciones o metadatos no económicos de documentos confirmados.'),
    ('documents.reverse', 'DOCUMENTS', 'Generar documentos compensatorios para corregir comprobantes confirmados.'),
    ('documents.duplicate_override', 'DOCUMENTS', 'Autorizar con motivo la confirmación excepcional de comprobantes detectados como duplicados.'),
    ('applications.create', 'APPLICATIONS', 'Crear imputaciones/aplicaciones entre documentos de crédito y débito.'),
    ('applications.desimpute', 'APPLICATIONS', 'Neutralizar y revertir aplicaciones históricas.'),
    ('suppliers.view', 'SUPPLIERS', 'Consultar proveedores y sus datos de contacto.'),
    ('suppliers.manage', 'SUPPLIERS', 'Crear, editar o inactivar proveedores y contactos.'),
    ('audit.view', 'AUDIT', 'Consultar logs de auditoría de IA, excepciones de duplicados y desimputaciones.'),
    ('system.manage', 'SYSTEM', 'Gestionar roles, permisos y tipos de documentos parametrizables.')
ON CONFLICT (code) DO NOTHING;

-- 4. Asignación de Permisos por Rol (role_permissions)

-- Asignación para OPERADOR
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.code = 'OPERADOR' 
  AND p.code IN (
      'documents.view',
      'documents.create',
      'documents.ai_review',
      'documents.confirm',
      'documents.edit_meta',
      'applications.create',
      'suppliers.view'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Asignación para ENCARGADO (Todo lo de Operador + Reversiones, Desimputaciones, Duplicados, Proveedores, Auditoría)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.code = 'ENCARGADO' 
  AND p.code IN (
      'documents.view',
      'documents.create',
      'documents.ai_review',
      'documents.confirm',
      'documents.edit_meta',
      'documents.reverse',
      'documents.duplicate_override',
      'applications.create',
      'applications.desimpute',
      'suppliers.view',
      'suppliers.manage',
      'audit.view'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Asignación para ADMIN (Todos los permisos existentes)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.code = 'ADMIN'
ON CONFLICT (role_id, permission_id) DO NOTHING;
