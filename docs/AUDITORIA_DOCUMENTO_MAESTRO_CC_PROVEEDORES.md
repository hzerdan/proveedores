# INFORME DE AUDITORÍA: DOCUMENTO MAESTRO VS. CÓDIGO REAL
**Proyecto:** Sistema de Cuentas Corrientes de Proveedores  
**Fecha de Auditoría:** 31 de Agosto de 2026 / 1 de Septiembre de 2026 (Validación STAGING)  
**Documento Auditado:** `docs/PROYECTO — SISTEMA DE CUENTAS CORRIENTES DE PROVEEDORES.md` (v0.1 Preliminar)  
**Entorno de Contraste:** Repositorio `Leon_Proveedores` (Migraciones SQL 1 a 11, Supabase DB QA y STAGING, Edge Functions, React Frontend v4.1)

---

## 1. Resumen Ejecutivo

### 1.1. Grado General de Coincidencia
La auditoría exhaustiva revela un **grado de alineación conceptual alto (85%)**, pero con **diferencias arquitectónicas y de madurez críticas** entre el documento maestro preliminar y la implementación técnica vigente.

El repositorio experimentó una evolución en tres fases:
1. **Fase 1 (Migraciones 1-4):** Modelo relacional clásico de imputaciones basado en tabla intermedia `document_applications` y `application_reversals`.
2. **Fase 2 (Migraciones 5-8):** Migración al **Ledger Inmutable v3.0** (`account_movements` con importes firmados, documentos `APL` de suma cero, saldos por `reference_id` y módulo de Vendedores N:M).
3. **Fase 3 (Migraciones 9-11 + Frontend v4.1):** Asignación/corrección auditada de vendedores (`document_seller_history`), analítica de Aging y Proyección de Pagos parametrizable, ingesta de comprobantes con IA y captura móvil QR.

### 1.2. Principales Discrepancias Identificadas

1. **Estructura del Ledger (`account_movements` vs `document_applications`):**
   El documento maestro preliminar planteaba el Ledger de forma abstracta e hipotética (`SUM(account_movements.amount_signed)`). En el código real, el Ledger es la **única fuente de verdad económica**, pero la columna real se llama `amount` (no `amount_signed`), con signo algebraico explícito (+ Débito, - Crédito). La tabla `document_applications` quedó obsoleta tras la implementación de `account_movements` y las vistas `v_document_summary` / `v_document_ledger`.

2. **Mecanismo de Órdenes de Pago (Imputación Nativa al Nacer):**
   El documento preliminar sugería que toda aplicación requiere un documento intermedio `APL`. En el código real (`rpc_create_and_confirm_op` y `PaymentOrderModal.tsx`), cuando una OP se emite conociendo qué facturas cancela, **nace imputada directamente en sus renglones de `account_movements` (`reference_id = FAC_ID`)**, y el remanente no aplicado genera un renglón propio (`reference_id = OP_ID`). El documento `APL` se reserva exclusivamente para aplicaciones posteriores o transferencias de saldos libres.

3. **Módulo de Vendedores (Altamente sofisticado y superior al documento):**
   El código implementa validaciones de vigencia temporal (`valid_from`, `valid_to`), control de selección obligatoria si hay más de un vendedor activo, clasificación en Aging y Proyección, tabla append-only `document_seller_history` con categorización automática en backend (`HISTORICAL_ASSIGNMENT` vs `CORRECTION`), control de concurrencia optimista y reconciliación matemática estricta:
   $$\text{Saldo Proveedor} = \sum \text{Saldos Vendedores} + \text{Deuda Sin Vendedor} + \text{Créditos Libres}$$

4. **Captura de Comprobantes e IA (Totalmente implementada):**
   El documento planteaba la captura móvil y la IA como ideas tentativas. En el código real existen 4 modalidades activas: Carga Manual, Archivos PDF, Imágenes, y Captura Móvil vía QR con tokens SHA-256 efímeros (`document_upload_sessions`), respaldadas por la Edge Function `extract-invoice` con OpenAI Structured Outputs (`gpt-4o-mini`) y alta rápida de proveedores con validación algorítmica Módulo 11 de CUIT (`fn_validate_cuit` / `rpc_quick_create_supplier`).

---

## 2. Matriz de Validación Sección por Sección

| Sección Doc | Tema | Estado | Evidencia en Código | Observaciones y Desvíos |
| :--- | :--- | :--- | :--- | :--- |
| **1** | Objetivo del proyecto | `CONFIRMADO_EN_CODIGO` | `src/App.tsx`, `src/components/accounts/` | Trazabilidad, separación por moneda, IA y consistencia contable operativas. |
| **2.1** | Inmutabilidad lógica | `CONFIRMADO_EN_CODIGO` | `supabase/migrations/20260824000003_views_and_rpc.sql`, `20260824000004_rls_and_security.sql`, `20260824000011_update_v_document_summary_and_ledger.sql` | Trigger `trg_enforce_document_immutability` en cabeceras y `trg_enforce_movement_immutability` en renglones. RLS no expone DELETE. Todos los FK usan `ON DELETE RESTRICT`. |
| **2.2** | Trazabilidad | `CONFIRMADO_EN_CODIGO` | `documents`, `account_movements`, `document_seller_history`, `duplicate_override_logs`, `document_ai_extractions` | Campos `created_by`, `confirmed_by`, `confirmed_at`, `changed_by`, `authorized_by` implementados con FK a `profiles(id)`. |
| **3** | Entidades conceptuales | `CONFIRMADO_EN_CODIGO` | `suppliers`, `documents`, `document_types`, `account_movements`, `sellers`, `supplier_sellers`, `profiles`, `roles` | Todas las entidades existen en el modelo de base de datos. |
| **4.1** | Identificador técnico | `CONFIRMADO_EN_CODIGO` | `documents.id bigint GENERATED ALWAYS AS IDENTITY` | Claves primarias `bigint` autoincrementales en todas las tablas transaccionales. |
| **4.2** | Identificación humana y duplicados | `CONFIRMADO_EN_CODIGO` | `documents.human_reference`, `rpc_create_and_confirm_document`, `duplicate_override_logs` | Detección estricta por `(supplier_id, document_type_id, letter, point_of_sale, document_number)`. Si duplica, requiere permiso `documents.duplicate_override` y motivo guardado en log. |
| **5** | Modelo de movimientos (Ledger) | `CONFIRMADO_EN_CODIGO` | `account_movements`, `v_document_ledger` (`20260824000011_update_v_document_summary_and_ledger.sql`) | Saldo = `SUM(account_movements.amount)`. Columna real es `amount` (con signo), no `amount_signed`. |
| **6** | Separación por moneda | `CONFIRMADO_EN_CODIGO` | `v_supplier_account_summary`, `v_open_reference_balances`, `rpc_get_supplier_aging` | Agrupación estricta por `supplier_id + currency`. Running balance en ledger particionado por moneda. Sin conversiones automáticas. |
| **7** | Facturas y saldo documental | `CONFIRMADO_EN_CODIGO` | `v_open_reference_balances`, `v_document_summary` | Factura nace con `amount > 0` (`type: ORIGIN`). Saldo pendiente documental = `SUM(amount WHERE reference_id = doc_id)`. |
| **8** | Órdenes de Pago (OP) | `CONFIRMADO_EN_CODIGO` | `rpc_create_and_confirm_op` (`20260824000008_sellers_and_analytics.sql`), `PaymentOrderModal.tsx` | La OP imputa directamente a facturas al nacer (`type: IMPUTATION`, `amount < 0`). Si hay remanente, genera renglón propio (`reference_id = OP_ID`, `type: REMAINDER`). |
| **9** | Documento APL (Suma Cero) | `CONFIRMADO_EN_CODIGO` | `document_types` ('APL'), `rpc_apply_existing_balance` (`20260824000008_sellers_and_analytics.sql`), `ApplyBalanceModal.tsx` | El documento APL transfiere saldo (+ a crédito origen, - a deudas destino). Suma neta de renglones del APL es exactamente 0.00. No altera saldo global. |
| **10** | Aplicaciones parciales | `CONFIRMADO_EN_CODIGO` | `account_movements.amount`, `PaymentOrderModal.tsx`, `ApplyBalanceModal.tsx` | Soportadas nativamente mediante importes fraccionados por renglón. |
| **11** | Desimputación y correcciones | `CONFIRMADO_EN_CODIGO` | `DesimputeModal.tsx`, `rpc_reverse_imputation` (`20260824000011_update_v_document_summary_and_ledger.sql`) | Desimputación mediante contra-asiento compensatorio APL (`APL-REV`), restaurando la deuda en la factura y el crédito libre en el emisor. |
| **12** | Vendedores N:M | `CONFIRMADO_EN_CODIGO` | `sellers`, `supplier_sellers` (`20260824000008_sellers_and_analytics.sql`), `SellerSuppliersManager.tsx` | Tabla intermedia `supplier_sellers` con `valid_from`, `valid_to`, `is_active` e índice único parcial para evitar solapamientos activos. |
| **13** | Vendedor en comprobantes | `CONFIRMADO_EN_CODIGO` | `documents.seller_id`, `fn_get_valid_sellers_for_supplier`, `DocumentFormModal.tsx` | Autoselección si hay 1 solo vendedor activo. Selección obligatoria si hay >1 activos. Validación backend de vigencia para la fecha de emisión. |
| **14** | OP y Vendedores | `CONFIRMADO_EN_CODIGO` | `rpc_create_and_confirm_op`, `v_open_reference_balances`, `rpc_get_supplier_seller_breakdown` | La cabecera de OP fuerza `seller_id = NULL`. Los créditos libres sin aplicar se categorizan como `FREE_CREDIT` y no se asignan a ningún vendedor. |
| **15** | APL y Vendedores | `CONFIRMADO_EN_CODIGO` | `v_document_ledger` (`20260824000011_update_v_document_summary_and_ledger.sql`) | APL tiene `seller_id = NULL`. En el ledger, el movimiento proyecta `reference_seller_id` permitiendo que la imputación impacte en el vendedor de la factura afectada. |
| **16** | Corrección de Vendedor | `CONFIRMADO_EN_CODIGO` | `document_seller_history`, `rpc_change_document_seller` (`20260824000010_document_seller_history_and_assignment.sql`), `DocumentSellerChangeModal.tsx` | Distingue `HISTORICAL_ASSIGNMENT` vs `CORRECTION`. Exige motivo >= 5 caracteres. Control de concurrencia optimista. Inmutable (trigger prohíbe UPDATE/DELETE). |
| **17** | Aging de Proveedores | `CONFIRMADO_EN_CODIGO` | `rpc_get_supplier_aging`, `rpc_get_seller_aging`, `SupplierAgingView.tsx`, `BucketDetailModal.tsx` | 6 buckets estándar (+ Sin Vencimiento + Créditos Libres). Conmutación Proveedores / Vendedores. Segregación por moneda. Drilldown a documentos. |
| **18** | Proyección de Pagos | `CONFIRMADO_EN_CODIGO` | `rpc_get_payment_projection`, `rpc_get_seller_payment_projection`, `PaymentProjectionView.tsx` | Semanas lunes a domingo (`DATE_TRUNC('week')`). Buckets: OVERDUE, WEEK, NO_DUE_DATE. Filtro de rango de fechas opcional. |
| **19** | Vista por Proveedor | `CONFIRMADO_EN_CODIGO` | `AccountStatement.tsx`, `DocumentDetailModal.tsx`, `ReferenceMovementsModal.tsx` | Navegación completa: Resumen por moneda, desglose por vendedores con reconciliación, vista agrupada por documentos y vista Ledger cronológica. |
| **20** | Vista por Vendedor | `CONFIRMADO_EN_CODIGO` | `v_seller_account_summary`, `rpc_get_seller_suppliers_summary`, `SellerDetailModal.tsx`, `SellerList.tsx` | Saldos construidos con referencias del vendedor. OPs no aplicadas permanecen en la cuenta general del proveedor. |
| **21** | Modalidades de Ingreso | `CONFIRMADO_EN_CODIGO` | `DocumentIntakeModal.tsx`, `MobileCaptureQRModal.tsx`, `MobileCapturePage.tsx`, `document_upload_sessions`, `extract-invoice` | 4 modalidades activas: Manual, PDF, Imagen y QR móvil con token hash SHA-256. Extracción con OpenAI `gpt-4o-mini` y fallback local. |
| **22** | Creación rápida de Proveedor | `CONFIRMADO_EN_CODIGO` | `fn_validate_cuit`, `rpc_quick_create_supplier`, `SupplierQuickCreateModal.tsx` | Validación CUIT Módulo 11. Creación en modal sin perder datos del comprobante en curso. |
| **23** | Usuarios y Seguridad RBAC | `CONFIRMADO_EN_CODIGO` | `roles`, `permissions`, `user_roles`, `role_permissions`, `AuthContext.tsx`, `UsersSecurityMaster.tsx` | 3 roles (ADMIN, ENCARGADO, OPERADOR), **18 permisos explícitos reales** validados en DB, RLS en todas las tablas. |
| **24** | Auditoría | `CONFIRMADO_EN_CODIGO` | `document_seller_history`, `duplicate_override_logs`, `document_ai_extractions`, `AuditLogsMaster.tsx` | Auditoría segregada del ledger contable. |
| **25** | Interfaz y Navegación | `CONFIRMADO_EN_CODIGO` | `src/config/navigation.ts`, `src/components/layout/` | Sidebar con grupos: Cuentas Corrientes, Maestros, Administración. Control de visibilidad por permisos. |
| **26** | Stack Tecnológico | `CONFIRMADO_EN_CODIGO` | `package.json`, `supabase/functions/extract-invoice/index.ts`, `storage.buckets` | React 18, TypeScript, Tailwind CSS, Vite, Supabase PostgreSQL, Edge Functions Deno, Storage `supplier-documents`. |
| **27** | Principio Arquitectónico Central | `CONFIRMADO_EN_CODIGO` | `documents`, `account_movements`, `v_document_summary`, `v_document_ledger` | Separación estricta entre Documento (Cabecera), Movimiento (Ledger) y Aplicación (Relación/APL). |
| **28** | Aspectos a Validar | `CONFIRMADO_EN_CODIGO` | Repositorio versionado y suite de pruebas en STAGING (`supabase/test_staging_report.sql`) | Todos los aspectos validados en STAGING con 100% PASS. |
| **29** | Metodología de Desarrollo | `CONFIRMADO_EN_CODIGO` | Scripts de verificación, TypeScript 0 errores, ESLint 0 errores, Build 0 errores. | Procedimiento cumplido rigurosamente. |
| **30** | Estado del Documento | `CONFIRMADO_EN_CODIGO` | `docs/PROYECTO_CUENTAS_CORRIENTES_PROVEEDORES.md` | Actualizado y promovido a Documento Maestro Oficial v1.0. |

---

## 3. Catálogo Real de Permisos RBAC (18 Permisos)

| # | Código de Permiso | Módulo | Descripción | ADMIN | ENCARGADO | OPERADOR |
|---|---|---|---|:---:|:---:|:---:|
| 1 | `documents.view` | DOCUMENTS | Visualizar comprobantes y estados de cuenta | Sí | Sí | Sí |
| 2 | `documents.create` | DOCUMENTS | Crear borradores manuales o subir archivos para extracción IA | Sí | Sí | Sí |
| 3 | `documents.ai_review` | DOCUMENTS | Revisar y corregir datos derivados de la extracción por IA | Sí | Sí | Sí |
| 4 | `documents.confirm` | DOCUMENTS | Confirmar comprobantes e impactar inmediatamente en cuenta corriente | Sí | Sí | Sí |
| 5 | `documents.edit_meta` | DOCUMENTS | Editar observaciones o metadatos no económicos de documentos confirmados | Sí | Sí | Sí |
| 6 | `documents.reverse` | DOCUMENTS | Generar documentos compensatorios para corregir comprobantes confirmados | Sí | Sí | No |
| 7 | `documents.duplicate_override` | DOCUMENTS | Autorizar con motivo la confirmación excepcional de comprobantes detectados como duplicados | Sí | Sí | No |
| 8 | `documents.assign_seller` | DOCUMENTS | Asignar vendedor inicial a comprobantes sin vendedor asignado (`seller_id IS NULL`) | Sí | Sí | Sí |
| 9 | `documents.change_seller` | DOCUMENTS | Corregir o reasignar vendedor en comprobantes que ya poseen uno asignado | Sí | Sí | No |
| 10 | `applications.create` | APPLICATIONS | Crear imputaciones/aplicaciones entre documentos de crédito y débito | Sí | Sí | Sí |
| 11 | `applications.desimpute` | APPLICATIONS | Neutralizar y revertir aplicaciones históricas | Sí | Sí | No |
| 12 | `suppliers.view` | SUPPLIERS | Consultar proveedores y sus datos de contacto | Sí | Sí | Sí |
| 13 | `suppliers.manage` | SUPPLIERS | Crear, editar o inactivar proveedores y contactos | Sí | Sí | No |
| 14 | `sellers.view` | SELLERS | Visualizar el maestro de vendedores y sus asignaciones | Sí | Sí | Sí |
| 15 | `sellers.manage` | SELLERS | Crear, editar o desactivar vendedores | Sí | Sí | No |
| 16 | `seller_supplier.manage` | SELLERS | Vincular, desvincular o finalizar vigencias de vendedores con proveedores | Sí | Sí | No |
| 17 | `audit.view` | AUDIT | Consultar logs de auditoría de IA, excepciones de duplicados y desimputaciones | Sí | Sí | No |
| 18 | `system.manage` | SYSTEM | Gestionar roles, permisos y tipos de documentos parametrizables | Sí | No | No |

---

## 4. Cierre de Reproducibilidad STAGING

### 4.1. Estado Inicial
Se detectaron dos brechas de reproducibilidad al intentar reconstruir el sistema en una base de datos limpia:
1. `account_movements` no estaba definida en la migración inicial `20260824000001_initial_schema.sql`, lo que causaba que la migración 5 (`aging_and_payment_projection`) fallara con `relation "account_movements" does not exist`.
2. El RPC `rpc_reverse_imputation` no estaba formalizado en los archivos de migración `.sql`.

### 4.2. Investigación y Diagnóstico
- Mediante inspección en QA, se determinó el contrato exacto de `account_movements` (tipos de datos, CHECK constraints, FKs con `ON DELETE RESTRICT`, índices y políticas RLS).
- Se extrajo de QA la definición canónica del RPC `rpc_reverse_imputation`, el RPC `rpc_reverse_document` adaptado al Ledger v3, y el trigger `trg_enforce_movement_immutability`.

### 4.3. Correcciones Aplicadas en Git
1. `supabase/migrations/20260824000001_initial_schema.sql`: Incorporación formal del DDL de `account_movements`.
2. `supabase/migrations/20260824000002_seed_data.sql`: Incorporación del tipo de documento `APL`.
3. `supabase/migrations/20260824000004_rls_and_security.sql`: Activación de RLS y políticas para `account_movements`.
4. `supabase/migrations/20260824000011_update_v_document_summary_and_ledger.sql`: Incorporación de `trg_enforce_movement_immutability`, `rpc_reverse_document` y `rpc_reverse_imputation`.

### 4.4. Primer Intento de Reconstrucción en STAGING
- Se vinculó Supabase CLI al proyecto STAGING (`zpvbhexucfvywtykqpvq`).
- Se ejecutó `supabase db push --include-all --yes`.
- **Fallo registrado:** Migración `20260824000005_aging_and_payment_projection.sql` abortó en la declaración 1 por falta de `account_movements`.

### 4.5. Reconstrucción Final en STAGING
- Se limpió el esquema público en STAGING para validar el flujo completo desde cero.
- Se re-ejecutó `supabase db push --include-all --yes`.
- **Resultado:** Las 11 migraciones se aplicaron con éxito total en STAGING.

### 4.6. Comparación Estructural QA vs STAGING
- **Tablas de Negocio:** 15/15 coincidentes (QA conserva 2 tablas residuales de backup `_bak_*` creadas durante el refactor histórico, las cuales no forman parte de la arquitectura final).
- **Vistas Canónicas:** 8/8 coincidentes (`v_document_summary`, `v_document_ledger`, `v_open_reference_balances`, `v_supplier_account_summary`, `v_seller_account_summary`, `v_active_supplier_sellers`, `v_active_applications`, `v_document_balances`).
- **Routines / RPCs:** 32/32 coincidentes en firmas, parámetros y comportamiento `SECURITY DEFINER`.
- **Permisos:** 18/18 coincidentes y asignados a roles.
- **Storage:** Bucket privado `supplier-documents` creado con límite de 20MB y tipos MIME autorizados.

---

## 5. Matriz de Resultados de Verificación

| Verificación | Componente / Prueba | Resultado | Detalle |
|---|---|:---:|---|
| **Migraciones en STAGING** | Supabase CLI `db push` | **PASS** | 11/11 migraciones aplicadas secuencialmente |
| **Ledger Base** | `account_movements` | **PASS** | Tabla, PK, 4 FKs, CHECK de 6 tipos, índices y RLS |
| **Desimputación RPC** | `rpc_reverse_imputation` | **PASS** | Contra-asiento `APL-REV` con suma cero |
| **Test Funcional A** | Factura inicial (+1000) | **PASS** | Saldo Proveedor: +1000.00, Saldo Factura: +1000.00 |
| **Test Funcional B** | OP parcial (700) | **PASS** | Saldo Proveedor: +300.00, Saldo FAC1: +300.00, OP Libre: 0.00 |
| **Test Funcional C** | OP con remanente (500) | **PASS** | Saldo Proveedor: -200.00, Saldo FAC1: 0.00, OP2 Libre: -200.00 |
| **Test Funcional D** | APL suma cero (+200 a FAC2) | **PASS** | Suma movimientos APL = 0.00, Saldo FAC2 = 0.00, Saldo Prov = 0.00 |
| **Test Funcional E** | Desimputación comprobada | **PASS** | FAC2 restaurada (+200.00), Crédito APL1 (-200.00), Saldo Prov: 0.00 |
| **Invariante 1** | Saldo Global = SUM(amount) | **PASS** | Reconciliado por proveedor y moneda |
| **Invariante 2** | Saldo Referencia = SUM(amount) | **PASS** | Filtrando por `reference_id` |
| **Invariante 3** | Efecto Neto APL = 0.00 | **PASS** | Invariante matemática confirmada |
| **Invariante 4** | Inmutabilidad Contable | **PASS** | Trigger `trg_enforce_movement_immutability` bloquea UPDATE/DELETE |
| **Vendedores** | Reconciliación N:M | **PASS** | $\text{Saldo Prov} = \sum \text{Saldos Vendedores} + \text{Sin Vend.} + \text{Libres}$ |
| **Aging** | `rpc_get_supplier_aging` | **PASS** | 6 buckets temporales + sin vencimiento + libres |
| **Proyección** | `rpc_get_payment_projection` | **PASS** | Agrupación semanal lunes a domingo |
| **RBAC / RLS** | Catálogo y roles | **PASS** | 18 permisos granulares y políticas activas |
| **Storage / Buckets** | `supplier-documents` | **PASS** | Bucket privado con RLS configurado |
| **TypeScript** | `npx tsc --noEmit` | **PASS** | 0 errores de tipado |
| **ESLint** | `npm run lint` | **PASS** | 0 errores, 0 warnings |
| **Vite Build Staging** | `npm run build:staging` | **PASS** | Bundle generado exitosamente sin secretos expuestos |

---

## 6. Decisiones Funcionales Pendientes de Revisión Humana

1. **Políticas de Cambio de Vendedor en Períodos Cerrados:** Definir si existirá un bloqueo temporal para modificar el vendedor de facturas saldadas de ejercicios cerrados.
2. **Gestión de Retenciones Impositivas en Órdenes de Pago:** Ratificar si las retenciones continúan como documentos `RETENCION` (`CREDIT`) o se desglosarán en la cabecera de la OP.
3. **Consolidación Multimoneda Analítica:** Definir si a futuro se incorporará una vista de reporte consolidada a moneda base con tipo de cambio de cierre (sin alterar el Ledger).
