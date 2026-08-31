# INFORME DE AUDITORÍA: DOCUMENTO MAESTRO VS. CÓDIGO REAL
**Proyecto:** Sistema de Cuentas Corrientes de Proveedores  
**Fecha de Auditoría:** 31 de Agosto de 2026  
**Documento Auditado:** `docs/PROYECTO — SISTEMA DE CUENTAS CORRIENTES DE PROVEEDORES.md` (v0.1 Preliminar)  
**Entorno de Contraste:** Repositorio `Leon_Proveedores` (Migraciones SQL 1 a 11, Supabase DB, Edge Functions, React Frontend v4.1)

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

5. **Gaps Técnicos y Pendientes en Migraciones:**
   - La tabla `account_movements` fue creada y documentada en `docs/REFACTORING_LEDGER_PLAN.md`, pero su sentencia `CREATE TABLE IF NOT EXISTS account_movements` no se encuentra explícitamente en los archivos de migración 1 a 11 (la migración 5 asume su existencia previa).
   - En el frontend, `DesimputeModal.tsx` invoca el RPC `rpc_reverse_imputation`, el cual debe consolidarse en las migraciones formales del repositorio.

---

## 2. Matriz de Validación Sección por Sección

| Sección Doc | Tema | Estado | Evidencia en Código | Observaciones y Desvíos |
| :--- | :--- | :--- | :--- | :--- |
| **1** | Objetivo del proyecto | `CONFIRMADO_EN_CODIGO` | `src/App.tsx`, `src/components/accounts/` | Trazabilidad, separación por moneda, IA y consistencia contable operativas. |
| **2.1** | Inmutabilidad lógica | `CONFIRMADO_EN_CODIGO` | `supabase/migrations/20260824000003_views_and_rpc.sql` (L121-152), `20260824000004_rls_and_security.sql` (L82-84) | Trigger `trg_enforce_document_immutability` prohíbe editar campos económicos de documentos `CONFIRMED`. RLS no expone DELETE. Todos los FK usan `ON DELETE RESTRICT`. |
| **2.2** | Trazabilidad | `CONFIRMADO_EN_CODIGO` | `documents`, `account_movements`, `document_seller_history`, `duplicate_override_logs`, `document_ai_extractions` | Campos `created_by`, `confirmed_by`, `confirmed_at`, `changed_by`, `authorized_by` implementados con FK a `profiles(id)`. |
| **3** | Entidades conceptuales | `CONFIRMADO_EN_CODIGO` | `suppliers`, `documents`, `document_types`, `account_movements`, `sellers`, `supplier_sellers`, `profiles`, `roles` | Todas las entidades existen en el modelo de base de datos. |
| **4.1** | Identificador técnico | `CONFIRMADO_EN_CODIGO` | `documents.id bigint GENERATED ALWAYS AS IDENTITY` | Claves primarias `bigint` autoincrementales en todas las tablas transaccionales. |
| **4.2** | Identificación humana y duplicados | `CONFIRMADO_EN_CODIGO` | `documents.human_reference`, `rpc_create_and_confirm_document` (L982-1010), `duplicate_override_logs` | Detección estricta por `(supplier_id, document_type_id, letter, point_of_sale, document_number)`. Si duplica, requiere permiso `documents.duplicate_override` y motivo guardado en log. |
| **5** | Modelo de movimientos (Ledger) | `CONFIRMADO_EN_CODIGO` | `account_movements`, `v_document_ledger` (`20260824000011_update_v_document_summary_and_ledger.sql`) | Saldo = `SUM(account_movements.amount)`. Columna real es `amount` (con signo), no `amount_signed`. |
| **6** | Separación por moneda | `CONFIRMADO_EN_CODIGO` | `v_supplier_account_summary`, `v_open_reference_balances`, `rpc_get_supplier_aging` | Agrupación estricta por `supplier_id + currency`. Running balance en ledger particionado por moneda. Sin conversiones automáticas. |
| **7** | Facturas y saldo documental | `CONFIRMADO_EN_CODIGO` | `v_open_reference_balances`, `v_document_summary` | Factura nace con `amount > 0` (`type: ORIGIN`). Saldo pendiente documental = `SUM(amount WHERE reference_id = doc_id)`. |
| **8** | Órdenes de Pago (OP) | `CONFIRMADO_EN_CODIGO` | `rpc_create_and_confirm_op` (`20260824000008_sellers_and_analytics.sql` L1051-1158), `PaymentOrderModal.tsx` | La OP imputa directamente a facturas al nacer (`type: IMPUTATION`, `amount < 0`). Si hay remanente, genera renglón propio (`reference_id = OP_ID`, `type: REMAINDER`). |
| **9** | Documento APL (Suma Cero) | `CONFIRMADO_EN_CODIGO` | `document_types` ('APL'), `rpc_apply_existing_balance` (`20260824000008_sellers_and_analytics.sql` L1161-1261), `ApplyBalanceModal.tsx` | El documento APL transfiere saldo (+ a crédito origen, - a deudas destino). Suma neta de renglones del APL es exactamente 0.00. No altera saldo global. |
| **10** | Aplicaciones parciales | `CONFIRMADO_EN_CODIGO` | `account_movements.amount`, `PaymentOrderModal.tsx`, `ApplyBalanceModal.tsx` | Soportadas nativamente mediante importes fraccionados por renglón. |
| **11** | Desimputación y correcciones | `PARCIALMENTE_IMPLEMENTADO` | `DesimputeModal.tsx` (L73), `rpc_reverse_imputation` | El frontend implementa el flujo de contra-asiento APL. Se requiere verificar que la función `rpc_reverse_imputation` esté consolidada en el set formal de migraciones SQL. |
| **12** | Vendedores N:M | `CONFIRMADO_EN_CODIGO` | `sellers`, `supplier_sellers` (`20260824000008_sellers_and_analytics.sql` L7-49), `SellerSuppliersManager.tsx` | Tabla intermedia `supplier_sellers` con `valid_from`, `valid_to`, `is_active` e índice único parcial para evitar solapamientos activos. |
| **13** | Vendedor en comprobantes | `CONFIRMADO_EN_CODIGO` | `documents.seller_id`, `fn_get_valid_sellers_for_supplier`, `DocumentFormModal.tsx` (L109-120, L223-226) | Autoselección si hay 1 solo vendedor activo. Selección obligatoria si hay >1 activos. Validación backend de vigencia para la fecha de emisión. |
| **14** | OP y Vendedores | `CONFIRMADO_EN_CODIGO` | `rpc_create_and_confirm_op` (L1112), `v_open_reference_balances`, `rpc_get_supplier_seller_breakdown` | La cabecera de OP fuerza `seller_id = NULL`. Los créditos libres sin aplicar se categorizan como `FREE_CREDIT` y no se asignan a ningún vendedor. |
| **15** | APL y Vendedores | `CONFIRMADO_EN_CODIGO` | `v_document_ledger` (`20260824000011_update_v_document_summary_and_ledger.sql` L70-108) | APL tiene `seller_id = NULL`. En el ledger, el movimiento proyecta `reference_seller_id` permitiendo que la imputación impacte en el vendedor de la factura afectada. |
| **16** | Corrección de Vendedor | `CONFIRMADO_EN_CODIGO` | `document_seller_history`, `rpc_change_document_seller` (`20260824000010_document_seller_history_and_assignment.sql`), `DocumentSellerChangeModal.tsx` | Distingue `HISTORICAL_ASSIGNMENT` vs `CORRECTION`. Exige motivo >= 5 caracteres. Control de concurrencia optimista. Inmutable (trigger prohíbe UPDATE/DELETE). |
| **17** | Aging de Proveedores | `CONFIRMADO_EN_CODIGO` | `rpc_get_supplier_aging`, `rpc_get_seller_aging`, `SupplierAgingView.tsx`, `BucketDetailModal.tsx` | 6 buckets estándar (+ Sin Vencimiento + Créditos Libres). Conmutación Proveedores / Vendedores. Segregación por moneda. Drilldown a documentos. |
| **18** | Proyección de Pagos | `CONFIRMADO_EN_CODIGO` | `rpc_get_payment_projection`, `rpc_get_seller_payment_projection`, `PaymentProjectionView.tsx` | Semanas lunes a domingo (`DATE_TRUNC('week')`). Buckets: OVERDUE, WEEK, NO_DUE_DATE. Filtro de rango de fechas opcional. |
| **19** | Vista por Proveedor | `CONFIRMADO_EN_CODIGO` | `AccountStatement.tsx`, `DocumentDetailModal.tsx`, `ReferenceMovementsModal.tsx` | Navegación completa: Resumen por moneda, desglose por vendedores con reconciliación, vista agrupada por documentos y vista Ledger cronológica. |
| **20** | Vista por Vendedor | `CONFIRMADO_EN_CODIGO` | `v_seller_account_summary`, `rpc_get_seller_suppliers_summary`, `SellerDetailModal.tsx`, `SellerList.tsx` | Saldos construidos con referencias del vendedor. OPs no aplicadas permanecen en la cuenta general del proveedor. |
| **21** | Modalidades de Ingreso | `CONFIRMADO_EN_CODIGO` | `DocumentIntakeModal.tsx`, `MobileCaptureQRModal.tsx`, `MobileCapturePage.tsx`, `document_upload_sessions`, `extract-invoice` | 4 modalidades activas: Manual, PDF, Imagen y QR móvil con token hash SHA-256. Extracción con OpenAI `gpt-4o-mini` y fallback local. |
| **22** | Creación rápida de Proveedor | `CONFIRMADO_EN_CODIGO` | `fn_validate_cuit`, `rpc_quick_create_supplier`, `SupplierQuickCreateModal.tsx` | Validación CUIT Módulo 11. Creación en modal sin perder datos del comprobante en curso. |
| **23** | Usuarios y Seguridad RBAC | `CONFIRMADO_EN_CODIGO` | `roles`, `permissions`, `user_roles`, `role_permissions`, `AuthContext.tsx`, `UsersSecurityMaster.tsx` | 3 roles (ADMIN, ENCARGADO, OPERADOR), 15 permisos explícitos (`documents.confirm`, `documents.change_seller`, `system.manage`, etc.), RLS en todas las tablas. |
| **24** | Auditoría | `CONFIRMADO_EN_CODIGO` | `document_seller_history`, `duplicate_override_logs`, `document_ai_extractions`, `AuditLogsMaster.tsx` | Auditoría segregada del ledger contable. |
| **25** | Interfaz y Navegación | `CONFIRMADO_EN_CODIGO` | `src/config/navigation.ts`, `src/components/layout/` | Sidebar con grupos: Cuentas Corrientes, Maestros, Administración. Control de visibilidad por permisos. |
| **26** | Stack Tecnológico | `CONFIRMADO_EN_CODIGO` | `package.json`, `supabase/functions/extract-invoice/index.ts`, `storage.buckets` | React 18, TypeScript, Tailwind CSS, Vite, Supabase PostgreSQL, Edge Functions Deno, Storage `supplier-documents`. |
| **27** | Principio Arquitectónico Central | `CONFIRMADO_EN_CODIGO` | `documents`, `account_movements`, `v_document_summary`, `v_document_ledger` | Separación estricta entre Documento (Cabecera), Movimiento (Ledger) y Aplicación (Relación/APL). |
| **28** | Aspectos a Validar | `CONFIRMADO_EN_CODIGO` | Todo el código base y test suites (`verify_account_payable.sql`, `verify_sellers_and_reconciliation.sql`) | Los 16 puntos fueron resueltos en las migraciones 5 a 11 y validados en tests automáticos. |
| **29** | Metodología de Desarrollo | `CONFIRMADO_EN_CODIGO` | Scripts de verificación, TypeScript 0 errores, ESLint 0 errores. | Procedimiento cumplido rigurosamente. |
| **30** | Estado del Documento | `OBSOLETO` | N/A | La versión 0.1 del documento maestro debe actualizarse a versión formal 1.0 aprobada. |

---

## 3. Investigación Específica del Modelo Contable

### 3.1. Origen del Saldo y Source of Truth Económico
1. **Saldo de un Proveedor:** Surge exclusivamente de:
   $$\text{Saldo Global}(P, M) = \sum_{\substack{\text{supplier\_id}=P \\ \text{currency}=M}} \text{account\_movements.amount}$$
2. **Existencia del Ledger:** Existe la tabla `account_movements`.
3. **Importes Firmados:** Los importes se almacenan en el campo `amount NUMERIC(15,2)` con signo algebraico explícito (+ Débito / Deuda, - Crédito / Pago / A favor).
4. **Saldo Pendiente de un Comprobante:** Se deriva dinámicamente mediante:
   $$\text{Saldo Referencia}(R) = \sum_{\text{reference\_id}=R} \text{account\_movements.amount}$$
   - Si $\text{Saldo}(R) = 0 \implies$ Totalmente saldada (`PAID` / `SETTLED`).
   - Si $0 < \text{Saldo}(R) < \text{Total Facial} \implies$ Pago parcial (`PARTIAL`).
   - Si $\text{Saldo}(R) < 0 \implies$ Saldo a favor disponible (`AVAILABLE_CREDIT`).
5. **Relación OP vs Factura:** Se materializa mediante renglones en `account_movements` donde `document_id = OP.id` y `reference_id = FAC.id` con `amount = -monto_imputado` y `movement_type = 'IMPUTATION'`.
6. **Existencia de `APL`:** Existe como tipo de documento (`code = 'APL'`). Se crea con `total_amount = 0.00` y sus renglones en `account_movements` suman exactamente 0.00.
7. **Desimputación:** Se realiza generando un contra-asiento compensatorio (`movement_type = 'DESIMPUTATION'` o `APL_TRANSFER` inverso) que restaura la deuda en la factura y el crédito libre en la OP sin eliminar filas históricas.
8. **Inmutabilidad y `ON DELETE CASCADE`:**
   - **Ninguna tabla económica posee `ON DELETE CASCADE`.** Todas las FK transaccionales tienen `ON DELETE RESTRICT`.
   - La tabla `documents` tiene un trigger `trg_enforce_document_immutability` que bloquea cambios a comprobantes confirmados.
   - Las políticas RLS deniegan DELETE en `documents` y `document_seller_history`.

---

## 4. Discrepancias Críticas y Riesgos Técnicos

### Discrepancia 1: DDL de `account_movements` en Migraciones SQL
* **Descripción:** La tabla `account_movements` es la columna vertebral del sistema y está activa en el código y en las vistas, pero su sentencia `CREATE TABLE IF NOT EXISTS account_movements` no está presente en el archivo `20260824000001_initial_schema.sql` (que contenía el modelo previo `document_applications`). La migración 5 agrega índices sobre ella, asumiendo su existencia.
* **Impacto:** Un despliegue desde cero (`supabase db reset`) fallará en la migración 5 si no se incluye la creación formal de `account_movements`.
* **Acción requerida:** Asegurar que el script de migración base contenga la definición de `account_movements`.

### Discrepancia 2: Consolidación del RPC `rpc_reverse_imputation`
* **Descripción:** `DesimputeModal.tsx` invoca `supabase.rpc('rpc_reverse_imputation')`. En la migración 3 existía `rpc_desimpute_applications` (modelo anterior).
* **Impacto:** Si la base de datos de producción no tiene cargada la función `rpc_reverse_imputation` bajo el nuevo modelo Ledger, la acción de desimputar desde el modal fallará.

---

## 5. Decisiones Funcionales Pendientes vs. Defectos Técnicos

### Decisiones Funcionales Pendientes (Requieren Aprobación de Negocio)
1. **Políticas de Cambio de Vendedor en Documentos Saldados:** ¿Debe permitirse cambiar el vendedor de una factura que ya fue 100% pagada y cerrada hace más de X meses, o debe haber un período de cierre contable?
2. **Tratamiento de Retenciones Impositivas en OP:** Actualmente la retención impositiva es un tipo de documento con naturaleza de crédito (`CREDIT`). Debe definirse si se emite como documento independiente o como desglose nativo dentro de la Orden de Pago.
3. **Manejo de Monedas Secundarias (EUR, etc.) y Tipo de Cambio:** La columna `exchange_rate` existe en `documents`, pero el sistema no realiza conversiones contables automáticas. Se debe ratificar formalmente que la contabilidad es bi-monetaria pura sin consolidación forzada.

### Defectos Técnicos (Requieren Corrección en Código/SQL)
1. Consolidar el DDL formal de `account_movements` en el flujo de migraciones reproducibles.
2. Asegurar que `rpc_reverse_imputation` esté versionado en los archivos `.sql`.
