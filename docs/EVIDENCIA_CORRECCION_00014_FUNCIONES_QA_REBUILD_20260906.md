# Evidencia de Corrección de 00014, Reconstrucción de REBUILD y Verificación Focalizada de Funciones y Triggers

**Fecha y hora:** 2026-09-06T01:55:00Z (Local: 2026-09-05T22:55:00-03:00)  
**Entornos evaluados:**
* **QA canónico:** `hdkfeonbmhxkagdrbdio` (extracción: 2026-09-06T01:53:17.827Z)
* **REBUILD reconstruido:** `kbvhwizxpfkzrjxsulsk` (extracción: 2026-09-06T01:53:05.060Z)
* **STAGING prohibido:** `zpvbhexucfvywtykqpvq` (NO ACCEDIDO / NO CONSULTADO)

---

## 1. Estado Inicial de Git (`git status --short`)

```text
 M docs/AUDITORIA_DOCUMENTO_MAESTRO_CC_PROVEEDORES.md
 M docs/PROYECTO_CUENTAS_CORRIENTES_PROVEEDORES.md
 M package.json
 M src/App.tsx
 M src/components/documents/DocumentFormModal.tsx
 M src/components/documents/DocumentIntakeModal.tsx
 M src/components/documents/MobileCapturePage.tsx
 M src/components/documents/MobileCaptureQRModal.tsx
 M src/lib/aiExtractor.ts
 M src/lib/formatters.ts
 M src/lib/supabase.ts
 M supabase/functions/extract-invoice/index.ts
 M supabase/migrations/20260824000001_initial_schema.sql
 M supabase/migrations/20260824000002_seed_data.sql
 M supabase/migrations/20260824000004_rls_and_security.sql
 M supabase/migrations/20260824000011_update_v_document_summary_and_ledger.sql
?? docs/EVIDENCIA_CANONICA_QA_REBUILD_20260905.md
?? docs/EVIDENCIA_CAPAS_1_2_3_QA_REBUILD_20260905.md
?? docs/EVIDENCIA_CAPAS_4_5_QA_REBUILD_20260906.md
?? docs/EVIDENCIA_CIERRE_DEFINITIVO_CAPAS_1_2_3_QA_REBUILD_20260906.md
?? docs/EVIDENCIA_FINAL_CAPAS_1_2_3_QA_REBUILD_20260906.md
?? docs/EVIDENCIA_FINAL_PRIVILEGIOS_QA_REBUILD_20260905.md
?? docs/INFORME_TECNICO_EXTRACCION_FACTURAS_QA.md
?? supabase/migrations/20260904000012_atomic_ai_extraction_confirmation.sql
?? supabase/migrations/20260904000013_enhance_extraction_audit_and_validation.sql
?? supabase/migrations/20260905000014_converge_rebuild_to_qa.sql
?? supabase/test_staging_report.sql
?? supabase/test_staging_suite.sql
?? test/
```

---

## 2. Hash SHA-256 Anterior de la Migración 00014

* **Archivo:** `supabase/migrations/20260905000014_converge_rebuild_to_qa.sql`
* **Hash SHA-256 anterior:** `82c37ff52fb85532f740fb526e18b6987e8ce2b6d45d51b1a50357cda5aeefd6`

---

## 3. Descripción Exacta de la Corrección en 00014

Se modificó exclusivamente el archivo `00014` en dos secciones clave sin alterar ninguna otra parte de su lógica idempotente ni las migraciones históricas `00001–00013`:

1. **Paso F dentro de `ESTADO_B` (Reconstrucción y convergencia):**
   Se reemplazó el bloque dinámico previo para incorporar la definición exacta, canónica y completa obtenida desde QA mediante `pg_get_functiondef` para las siete funciones divergentes:
   * `public.current_app_user_id()`: Se incorporó la definición exacta en `plpgsql` con el fallback a perfiles activos de desarrollo (`COALESCE(v_user_id, 3)`).
   * `public.rpc_quick_create_supplier(...)`: Se incorporó la declaración e inicialización canónica de `v_user_id := current_app_user_id();` previa a la inserción en `suppliers`.
   * `public.rpc_reverse_document(...)`: Se incorporó la definición canónica de QA que asienta en `account_movements` con el literal `'ARS'`.
   * `public.rpc_reverse_imputation(...)`: Se incorporó la definición canónica de QA que asienta en `documents` y `account_movements` con el literal `'ARS'`.
   * `public.rpc_create_upload_session(...)`: Se homologaron textualmente los comentarios internos de la función.
   * `public.rpc_create_and_confirm_document(...)` (12 parámetros): Se corrigió la corrupción de caracteres (Mojibake), reescribiendo los mensajes y comentarios con UTF-8 puro y limpio (`válido`, `excepción`, `económico`, `sí`, `Detección`, `Renglón`).
   * `public.rpc_create_and_confirm_op(...)` (11 parámetros): Se corrigió la corrupción de caracteres (Mojibake), reescribiendo los mensajes y comentarios con UTF-8 puro (`renglón`, `imputación`, `sobrecancelación`).
   * Para cada una de las 7 funciones se añadieron sus sentencias explícitas de asignación de propietario (`ALTER ... OWNER TO postgres`) y privilegios de ejecución (`GRANT EXECUTE ... TO PUBLIC, anon, authenticated, service_role`).

2. **Validaciones en `ESTADO_A` y Paso G (`ESTADO_B`):**
   Se actualizaron los controles de hash para esperar de forma estricta y unívoca los hashes canónicos normalizados de QA (`1697c414dd56f1d8bc1e33340a7a90fde6ea6442f29139ac85b4d9f8bb855756` y `98a9956fa027ff7a55abeea1fa6640a0af96e440130a67340f3c2f1593a430b9`), eliminando la tolerancia a los hashes previos afectados por Mojibake.

---

## 4. Confirmación de Codificación UTF-8 y Búsqueda de Mojibake en 00014

Se auditó exhaustivamente el archivo corregido `00014` en disco antes de la ejecución:
* **Codificación:** UTF-8 limpio y válido sin BOM (100% de coincidencia byte a byte en round-trip).
* **Búsqueda de patrones corruptos:**
  * Patrón `├`: **0 ocurrencias**.
  * Patrón `│`: **0 ocurrencias**.
  * Patrón `Ã`: **0 ocurrencias**.
  * Patrón `Â`: **0 ocurrencias**.
  * Patrón `` (`\uFFFD`): **0 ocurrencias**.

---

## 5. Hash SHA-256 Nuevo de la Migración 00014

* **Archivo:** `supabase/migrations/20260905000014_converge_rebuild_to_qa.sql`
* **Nuevo Hash SHA-256:** `3ed43c7b3b3f1a44c147f59e8a58fa5edfd59b25ff15e64fad863b42c83bfb2b`

---

## 6. Ejecución de la Reconstrucción en REBUILD

* **Project Ref confirmado:** `kbvhwizxpfkzrjxsulsk` (descartable autorizado).
* **Entornos protegidos verificados:** QA (`hdkfeonbmhxkagdrbdio`) y STAGING (`zpvbhexucfvywtykqpvq`) NO fueron reseteados ni modificados.
* **Comando Scoop CLI ejecutado:**
  ```bash
  supabase db reset --linked --no-seed --yes
  ```
* **Resultado del comando:** Salida con código `0` exitoso.
* **Migraciones aplicadas desde cero:**
  1. `20260824000001_initial_schema.sql`
  2. `20260824000002_seed_data.sql`
  3. `20260824000003_views_and_rpc.sql`
  4. `20260824000004_rls_and_security.sql`
  5. `20260824000005_aging_and_payment_projection.sql`
  6. `20260824000006_storage_bucket.sql`
  7. `20260824000007_document_intake_and_qr_sessions.sql`
  8. `20260824000008_sellers_and_analytics.sql`
  9. `20260824000009_fix_rls_sellers.sql`
  10. `20260824000010_document_seller_history_and_assignment.sql`
  11. `20260824000011_update_v_document_summary_and_ledger.sql`
  12. `20260904000012_atomic_ai_extraction_confirmation.sql`
  13. `20260904000013_enhance_extraction_audit_and_validation.sql`
  14. `20260905000014_converge_rebuild_to_qa.sql`
* **Mensaje de confirmación de 00014 emitido en consola:**
  ```text
  NOTICE (00000): Deteccion preliminar: Forma general clasificada como candidato ESTADO_B
  NOTICE (00000): Iniciando transformacion desde ESTADO_B (REBUILD POST-00013) hacia ESTADO_A (QA CANONICO)...
  NOTICE (00000): Transformacion estructural hacia ESTADO_A completada exitosamente.
  ```

---

## 7. Inventario y Comparación Focalizada de las 7 Funciones

Extracción fresca post-rebuild ejecutada a las 2026-09-06T01:53:17.827Z (QA) y 2026-09-06T01:53:05.060Z (REBUILD).

| Función y Firma | Hash QA (SHA-256) | Hash REBUILD (SHA-256) | Atributos | Definición | Bytes / Chars | Resultado |
| --------------- | ----------------- | ---------------------- | :-------: | :--------: | :-----------: | :-------: |
| `current_app_user_id()` | `e8912570a0ad...` | `e8912570a0ad...` | IDÉNTICOS | IDÉNTICA | 780 B / 780 C | **PARIDAD EXACTA** |
| `rpc_create_and_confirm_document(p_supplier_id bigint, p_document_type_id smallint, p_letter character varying, p_point_of_sale integer, p_document_number integer, p_human_reference character varying, p_issue_date date, p_due_date date, p_total_amount numeric, p_concept text, p_notes text, p_override_reason text)` | `ee20c8dd85b3...` | `ee20c8dd85b3...` | IDÉNTICOS | IDÉNTICA | 4489 B / 4481 C | **PARIDAD EXACTA** |
| `rpc_create_and_confirm_op(p_supplier_id bigint, p_document_type_id smallint, p_point_of_sale integer, p_document_number integer, p_human_reference character varying, p_issue_date date, p_total_amount numeric, p_concept text, p_notes text, p_imputations jsonb, p_override_reason text)` | `a44a245f94c4...` | `a44a245f94c4...` | IDÉNTICOS | IDÉNTICA | 5116 B / 5109 C | **PARIDAD EXACTA** |
| `rpc_create_upload_session(p_expires_in_minutes integer)` | `5321f51c16d3...` | `5321f51c16d3...` | IDÉNTICOS | IDÉNTICA | 1113 B / 1113 C | **PARIDAD EXACTA** |
| `rpc_quick_create_supplier(p_tax_id character varying, p_trade_name character varying, p_legal_name character varying)` | `e03044e819e5...` | `e03044e819e5...` | IDÉNTICOS | IDÉNTICA | 2124 B / 2120 C | **PARIDAD EXACTA** |
| `rpc_reverse_document(p_document_id bigint, p_reason text)` | `e674319ef5f4...` | `e674319ef5f4...` | IDÉNTICOS | IDÉNTICA | 3415 B / 3407 C | **PARIDAD EXACTA** |
| `rpc_reverse_imputation(p_movement_id bigint, p_reason text)` | `038e2801f0dd...` | `038e2801f0dd...` | IDÉNTICOS | IDÉNTICA | 3413 B / 3402 C | **PARIDAD EXACTA** |

### 7.1 Detalle Completo de Hashes de las 7 Funciones
1. `public.current_app_user_id()`
   * **Hash QA:** `e8912570a0ad30b31c502460d3c8f90ce2c434233383e869b7a5790e6e581dd7`
   * **Hash REBUILD:** `e8912570a0ad30b31c502460d3c8f90ce2c434233383e869b7a5790e6e581dd7`
   * **Coincidencia:** **100% EXACTA**
2. `public.rpc_create_and_confirm_document(12 params)`
   * **Hash QA:** `ee20c8dd85b39377f6ce712833e34636044f068c9617963fdaaf625f71c88e9f`
   * **Hash REBUILD:** `ee20c8dd85b39377f6ce712833e34636044f068c9617963fdaaf625f71c88e9f`
   * **Coincidencia:** **100% EXACTA**
3. `public.rpc_create_and_confirm_op(11 params)`
   * **Hash QA:** `a44a245f94c4509ae5e058822fd838157b1cdedbac61b6ae54d12f915cb25de1`
   * **Hash REBUILD:** `a44a245f94c4509ae5e058822fd838157b1cdedbac61b6ae54d12f915cb25de1`
   * **Coincidencia:** **100% EXACTA**
4. `public.rpc_create_upload_session(p_expires_in_minutes integer)`
   * **Hash QA:** `5321f51c16d3f6027edea935cdef3c15b0a7036cfd9a43d1fe6ece8a2051e525`
   * **Hash REBUILD:** `5321f51c16d3f6027edea935cdef3c15b0a7036cfd9a43d1fe6ece8a2051e525`
   * **Coincidencia:** **100% EXACTA**
5. `public.rpc_quick_create_supplier(...)`
   * **Hash QA:** `e03044e819e5828f627338b4c0888baa22e115b88634bfc0b2db289fdefa450c`
   * **Hash REBUILD:** `e03044e819e5828f627338b4c0888baa22e115b88634bfc0b2db289fdefa450c`
   * **Coincidencia:** **100% EXACTA**
6. `public.rpc_reverse_document(p_document_id bigint, p_reason text)`
   * **Hash QA:** `e674319ef5f41d6355a130757443466185c925eddc3703f91da08d7b9904ee08`
   * **Hash REBUILD:** `e674319ef5f41d6355a130757443466185c925eddc3703f91da08d7b9904ee08`
   * **Coincidencia:** **100% EXACTA**
7. `public.rpc_reverse_imputation(p_movement_id bigint, p_reason text)`
   * **Hash QA:** `038e2801f0ddc9248ce741d36ce8188623be3e0de13ad75eb883d1398d1b23a8`
   * **Hash REBUILD:** `038e2801f0ddc9248ce741d36ce8188623be3e0de13ad75eb883d1398d1b23a8`
   * **Coincidencia:** **100% EXACTA**

---

## 8. Evidencia Hexadecimal de Caracteres Acentuados en REBUILD

Se extrajeron directamente desde el catálogo de PostgreSQL en REBUILD los fragmentos y palabras clave con tildes de las funciones reconstruidas:

| Palabra / Fragmento | Presente en QA | Presente en REBUILD | Representación Hexadecimal UTF-8 | Diagnóstico |
| ------------------- | :------------: | :-----------------: | -------------------------------- | ----------- |
| `válido` | SÍ | SÍ | `76 c3 a1 6c 69 64 6f` | Canónico UTF-8 (`á` = `c3 a1`) |
| `excepción` | SÍ | SÍ | `65 78 63 65 70 63 69 c3 b3 6e` | Canónico UTF-8 (`ó` = `c3 b3`) |
| `económico` | SÍ | SÍ | `65 63 6f 6e c3 b3 6d 69 63 6f` | Canónico UTF-8 (`ó` = `c3 b3`) |
| `sí` | SÍ | SÍ | `73 c3 ad` | Canónico UTF-8 (`í` = `c3 ad`) |
| `Detección` | SÍ | SÍ | `44 65 74 65 63 63 69 c3 b3 6e` | Canónico UTF-8 (`ó` = `c3 b3`) |
| `Renglón` | SÍ | SÍ | `52 65 6e 67 6c c3 b3 6e` | Canónico UTF-8 (`ó` = `c3 b3`) |
| `imputación` | SÍ | SÍ | `69 6d 70 75 74 61 63 69 c3 b3 6e` | Canónico UTF-8 (`ó` = `c3 b3`) |
| `sobrecancelación` | SÍ | SÍ | `73 6f 62 72 65 63 61 6e 63 65 6c 61 63 69 c3 b3 6e` | Canónico UTF-8 (`ó` = `c3 b3`) |

* **Presencia de caracteres Mojibake (`├`, `│`, `Ã`, `Â`, ``) en REBUILD:** **0 ocurrencias**.

---

## 9. Control de los Tres Triggers y Funciones Asociadas

Se comprobó la paridad total e inalterabilidad de los triggers de la Capa 5 tras la reconstrucción:

| Tabla | Trigger | Eventos | Momento | Nivel | Habilitado | Función Asociada | Resultado |
| ----- | ------- | ------- | ------- | ----- | :--------: | ---------------- | :-------: |
| `public.account_movements` | `trg_immutability_account_movements` | DELETE, UPDATE | BEFORE | ROW | O (habilitado) | `public.trg_enforce_movement_immutability()` | **PARIDAD TOTAL** |
| `public.document_seller_history` | `trg_seller_history_immutability` | DELETE, UPDATE | BEFORE | ROW | O (habilitado) | `public.trg_enforce_seller_history_immutability()` | **PARIDAD TOTAL** |
| `public.documents` | `trg_document_immutability` | UPDATE | BEFORE | ROW | O (habilitado) | `public.trg_enforce_document_immutability()` | **PARIDAD TOTAL** |

* Las definiciones DDL de los tres triggers coinciden exactamente.
* Las tres funciones trigger se encuentran resolubles y activas en ambos entornos.

---

## 10. Confirmación de Guardrails

1. **Inmutabilidad de `00001–00013`:** Confirmado mediante `git diff --name-only`. Ninguna migración previa fue tocada, reformateada ni restaurada.
2. **QA no modificado:** Confirmado. Sólo se ejecutaron consultas `SELECT` de solo lectura sobre QA (`hdkfeonbmhxkagdrbdio`).
3. **STAGING no accedido:** Confirmado. El proyecto `zpvbhexucfvywtykqpvq` no fue consultado ni vinculado.
4. **Reconstrucción integral:** REBUILD fue recreado desde cero aplicando limpiamente la secuencia `00001–00014`.
5. **Scoop Supabase CLI:** Utilizada exclusivamente la CLI instalada en el sistema.

---

## 11. Estado Final de Git (`git status --short`)

```text
 M docs/AUDITORIA_DOCUMENTO_MAESTRO_CC_PROVEEDORES.md
 M docs/PROYECTO_CUENTAS_CORRIENTES_PROVEEDORES.md
 M package.json
 M src/App.tsx
 M src/components/documents/DocumentFormModal.tsx
 M src/components/documents/DocumentIntakeModal.tsx
 M src/components/documents/MobileCapturePage.tsx
 M src/components/documents/MobileCaptureQRModal.tsx
 M src/lib/aiExtractor.ts
 M src/lib/formatters.ts
 M src/lib/supabase.ts
 M supabase/functions/extract-invoice/index.ts
 M supabase/migrations/20260824000001_initial_schema.sql
 M supabase/migrations/20260824000002_seed_data.sql
 M supabase/migrations/20260824000004_rls_and_security.sql
 M supabase/migrations/20260824000011_update_v_document_summary_and_ledger.sql
?? docs/EVIDENCIA_CANONICA_QA_REBUILD_20260905.md
?? docs/EVIDENCIA_CAPAS_1_2_3_QA_REBUILD_20260905.md
?? docs/EVIDENCIA_CAPAS_4_5_QA_REBUILD_20260906.md
?? docs/EVIDENCIA_CIERRE_DEFINITIVO_CAPAS_1_2_3_QA_REBUILD_20260906.md
?? docs/EVIDENCIA_CORRECCION_00014_FUNCIONES_QA_REBUILD_20260906.md
?? docs/EVIDENCIA_FINAL_CAPAS_1_2_3_QA_REBUILD_20260906.md
?? docs/EVIDENCIA_FINAL_PRIVILEGIOS_QA_REBUILD_20260905.md
?? docs/INFORME_TECNICO_EXTRACCION_FACTURAS_QA.md
?? supabase/migrations/20260904000012_atomic_ai_extraction_confirmation.sql
?? supabase/migrations/20260904000013_enhance_extraction_audit_and_validation.sql
?? supabase/migrations/20260905000014_converge_rebuild_to_qa.sql
?? supabase/test_staging_report.sql
?? supabase/test_staging_suite.sql
?? test/
```

* **Único archivo nuevo agregado:** `docs/EVIDENCIA_CORRECCION_00014_FUNCIONES_QA_REBUILD_20260906.md`.
* **Único archivo modificado autorizado:** `supabase/migrations/20260905000014_converge_rebuild_to_qa.sql`.

---

## 12. Conclusión Técnica Obligatoria

```text
PARIDAD FOCALIZADA DE LAS 7 FUNCIONES Y 3 TRIGGERS COMPROBADA
```

Todas las firmas, definiciones, hashes SHA-256 nativos, atributos de ejecución, representación hexadecimal de caracteres especiales y disparadores presentan **100% de paridad estricta entre QA y REBUILD**.
