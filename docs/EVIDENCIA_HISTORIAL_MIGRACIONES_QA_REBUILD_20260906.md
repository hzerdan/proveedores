# EVIDENCIA DE AUDITORÍA: HISTORIAL DE MIGRACIONES — QA VS REBUILD

**Fecha y hora UTC:** 2026-09-06 16:30:00 UTC  
**Rama examinada:** `staging`  
**Commit HEAD:** `7dac6632c381adabe2a1e0dcb0aaa1086653fb70`  
**Versión de Supabase CLI:** `2.84.2` (Scoop)  
**Estado inicial del árbol de trabajo (`git status --short`):**
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
?? docs/EVIDENCIA_APTITUD_EXTERNA_QA_REBUILD_20260906.md
?? docs/EVIDENCIA_CANONICA_QA_REBUILD_20260905.md
?? docs/EVIDENCIA_CAPAS_1_2_3_QA_REBUILD_20260905.md
?? docs/EVIDENCIA_CAPAS_4_5_QA_REBUILD_20260906.md
?? docs/EVIDENCIA_CAPA_6_DATOS_DECLARATIVOS_QA_REBUILD_20260906.md
?? docs/EVIDENCIA_CIERRE_CAPA_6_APL_QA_REBUILD_20260906.md
?? docs/EVIDENCIA_CIERRE_DEFINITIVO_CAPAS_1_2_3_QA_REBUILD_20260906.md
?? docs/EVIDENCIA_CORRECCION_00014_FUNCIONES_QA_REBUILD_20260906.md
?? docs/EVIDENCIA_EDGE_FUNCTIONS_QA_REBUILD_20260906.md
?? docs/EVIDENCIA_FINAL_CAPAS_1_2_3_QA_REBUILD_20260906.md
?? docs/EVIDENCIA_FINAL_PRIVILEGIOS_QA_REBUILD_20260905.md
?? docs/EVIDENCIA_RLS_GRANTS_QA_REBUILD_20260906.md
?? docs/INFORME_TECNICO_EXTRACCION_FACTURAS_QA.md
?? supabase/migrations/20260904000012_atomic_ai_extraction_confirmation.sql
?? supabase/migrations/20260904000013_enhance_extraction_audit_and_validation.sql
?? supabase/migrations/20260905000014_converge_rebuild_to_qa.sql
?? supabase/test_staging_report.sql
?? supabase/test_staging_suite.sql
?? test/
```

---

## 1. Verificación de Identidad de Migraciones Críticas

Se calcularon los hashes SHA-256 frescos directamente sobre los archivos locales:

| Archivo de Migración | Versión Numérica | Tamaño (Bytes) | SHA-256 Fresco | Estado Git |
| :--- | :---: | :---: | :--- | :--- |
| `20260904000012_atomic_ai_extraction_confirmation.sql` | `20260904000012` | 11,279 | `589D92FEFB74B43D318843034AF237AECA55A20ECF16394E481873AF29C831D9` | No versionado (`??`) |
| `20260904000013_enhance_extraction_audit_and_validation.sql` | `20260904000013` | 15,761 | `CD82B1E6560087DE993605AE9182EA098A38FD361EE08C866839F3F72DF651D7` | No versionado (`??`) |
| `20260905000014_converge_rebuild_to_qa.sql` | `20260905000014` | 83,145 | `B688DB479A05006C0339B835F16929F3DB4FB21A9CE77A3DF9564ED7DFAD6853` | No versionado (`??`) |

* **Coincidencia con antecedente de `00014`:** **EXACTA (100% IDÉNTICO)**. Línea base confirmada.

---

## 2. Historial Remoto de Migraciones: QA vs REBUILD

Se consultaron de forma independiente y fresca los historiales mediante `supabase migration list --linked` y mediante consulta SQL directa a la tabla de sistema `supabase_migrations.schema_migrations`:

### Tabla Comparativa de Migraciones Registradas

| Versión | Nombre Local / Remoto | Registrada en QA (`hdkfeonbmhxkagdrbdio`) | Registrada en REBUILD (`kbvhwizxpfkzrjxsulsk`) | Evaluación Fáctica |
| :---: | :--- | :---: | :---: | :--- |
| `20260824000001` | `initial_schema` | **SÍ** | **SÍ** | Registrada en ambos |
| `20260824000002` | `seed_data` | **SÍ** | **SÍ** | Registrada en ambos |
| `20260824000003` | `views_and_rpc` | **SÍ** | **SÍ** | Registrada en ambos |
| `20260824000004` | `rls_and_security` | **SÍ** | **SÍ** | Registrada en ambos |
| `20260824000005` | `aging_and_payment_projection` | **SÍ** | **SÍ** | Registrada en ambos |
| `20260824000006` | `storage_bucket` | **SÍ** | **SÍ** | Registrada en ambos |
| `20260824000007` | `document_intake_and_qr_sessions` | **SÍ** | **SÍ** | Registrada en ambos |
| `20260824000008` | `sellers_and_analytics` | **SÍ** | **SÍ** | Registrada en ambos |
| `20260824000009` | `fix_rls_sellers` | **SÍ** | **SÍ** | Registrada en ambos |
| `20260824000010` | `document_seller_history_and_assignment`| **SÍ** | **SÍ** | Registrada en ambos |
| `20260824000011` | `update_v_document_summary_and_ledger` | **SÍ** | **SÍ** | Registrada en ambos |
| `20260904000012` | `atomic_ai_extraction_confirmation` | **SÍ** | **SÍ** | Registrada en ambos |
| `20260904000013` | `enhance_extraction_audit_and_validation` | **SÍ** | **SÍ** | Registrada en ambos |
| `20260905000014` | `converge_rebuild_to_qa` | **NO** | **SÍ** | **PENDIENTE EN QA** |

### Resumen de Historiales
* **QA:** Posee 13 migraciones registradas (`00001` a `00013`). Última migración aplicada: `20260904000013`.
* **REBUILD:** Posee 14 migraciones registradas (`00001` a `00014`). Última migración aplicada: `20260905000014`.
* **Concordancia entre CLI y tabla de base de datos:** **Total y exacta (100%)**. Ambas fuentes coinciden registro por registro.
* **Estado de `00012` y `00013` en QA:** **Ya figuran aplicadas y registradas en QA**.
* **Estado de `00014` en QA:** **Es la única migración pendiente en QA**.

---

## 3. Simulación de Despliegue sobre QA (`supabase db push --dry-run`)

Se ejecutó la simulación no destructiva oficial de Supabase CLI en un directorio temporal aislado con la configuración de las migraciones locales apuntando a QA:

```text
DRY RUN: migrations will *not* be pushed to the database.
Connecting to remote database...
Would push these migrations:
 • 20260905000014_converge_rebuild_to_qa.sql
Finished supabase db push.
```

* **Resultado comprobado:** La CLI intentaría aplicar **únicamente una migración**: `20260905000014_converge_rebuild_to_qa.sql`.
* Las migraciones `00012` y `00013` son ignoradas por la CLI para QA porque ya se encuentran debidamente asentadas en `supabase_migrations.schema_migrations`.

---

## 4. Revisión Estática de las Migraciones `00012`, `00013` y `00014`

### 4.1 Migración `20260904000012_atomic_ai_extraction_confirmation.sql`
* **Objetivo:** Vinculación atómica y auditoría server-side en `rpc_create_and_confirm_document`.
* **Operaciones DDL:** `CREATE OR REPLACE FUNCTION rpc_create_and_confirm_document(...)` (reemplazo de la función RPC con nuevos parámetros de vinculación: `p_ai_extraction_id`, `p_file_id`, `p_confirmed_payload_diff`).
* **Operaciones DML:** Cero DML directo en la migración (el DML ocurre dentro de la ejecución de la función cuando es invocada por usuarios).
* **Defensas e idempotencia:** Utiliza `CREATE OR REPLACE FUNCTION`.
* **Estado en QA:** **Ya aplicada**. Figura registrada en `supabase_migrations` y QA ya posee la función en su catálogo.
* **Clasificación respecto de QA:** **NO APLICABLE PORQUE YA FIGURA REGISTRADA**.

### 4.2 Migración `20260904000013_enhance_extraction_audit_and_validation.sql`
* **Objetivo:** Agregar columnas de auditoría separada en `document_ai_extractions`, función canónica de fechas `fn_parse_canonical_date`, y validaciones estrictas en `rpc_create_and_confirm_document`.
* **Operaciones DDL:**
  * `ALTER TABLE document_ai_extractions ADD COLUMN IF NOT EXISTS confirmed_by ...`
  * `ALTER TABLE document_ai_extractions ADD COLUMN IF NOT EXISTS confirmed_at ...`
  * `CREATE OR REPLACE FUNCTION fn_parse_canonical_date(...)`
  * `CREATE OR REPLACE FUNCTION rpc_create_and_confirm_document(...)`
* **Operaciones DML:** Cero DML.
* **Defensas e idempotencia:** Utiliza `ADD COLUMN IF NOT EXISTS` y `CREATE OR REPLACE FUNCTION`.
* **Estado en QA:** **Ya aplicada**. Las columnas existen en QA y la función está activa.
* **Clasificación respecto de QA:** **NO APLICABLE PORQUE YA FIGURA REGISTRADA**.

### 4.3 Migración `20260905000014_converge_rebuild_to_qa.sql`
* **Objetivo:** Convergencia estructural exacta e idempotente entre REBUILD y QA.
* **Arquitectura de Estados:**
  * Bloque procedural `DO $migration$ DECLARE ... BEGIN ... END;`
  * **FASE 1 (Detección preliminar):** Evalúa el estado del catálogo determinando si el entorno objetivo corresponde a `ESTADO_A` (QA canónico), `ESTADO_B` (REBUILD post-00013 que necesita transformarse) o `ESTADO_C` (estado desconocido / colisión, que aborta con `RAISE EXCEPTION`).
  * **FASE 2 (Ruta ESTADO_A — QA Canónico):**
    * Ejecuta **15 comprobaciones exhaustivas de solo lectura** (presencia de las 6 vistas, columnas exactas, hash de `v_supplier_account_summary`, validación de sobrecargas de funciones históricas en `pg_proc`, verificación estricta de las 63 políticas RLS de QA, verificación de ausencia de índices/constraints en tablas `_bak_*`, y confirmación del registro `APL` en `document_types`).
    * Emite el aviso: `CONFIRMACION ESTADO_A: Entorno 100% homologado con QA canonico. Cero modificaciones DDL/DML ejecutadas.`
    * Ejecuta un **`RETURN` directo**.
    * **Operaciones DDL/DML ejecutadas en ESTADO_A:** **CERO (0)**. Neutralidad física absoluta.
  * **FASE 3 (Ruta ESTADO_B — REBUILD):**
    * Diseñada específicamente para aplicar la convergencia cuando se ejecuta sobre un entorno que proviene de `00013` (como ocurrió en REBUILD).
* **Comportamiento esperado al ejecutarse sobre QA:**
  * QA clasifica inequívocamente en **`ESTADO_A`**.
  * Se ejecutan las validaciones de consistencia.
  * La migración finaliza de inmediato con éxito (`RETURN`), sin alterar ninguna tabla, columna, vista, función, trigger, RLS ni dato existente.
  * Supabase CLI inserta la fila de versión `20260905000014` en `supabase_migrations.schema_migrations`.
* **Clasificación respecto de QA:** **IDEMPOTENTE RESPECTO DEL QA ACTUAL**.

---

## 5. Matriz de Resultados y Evaluación

| Migración | Estado en Historial QA | Estado Físico en QA | Clasificación de Idempotencia | ¿Apta para Aplicarse en QA? |
| :---: | :---: | :---: | :--- | :--- |
| `00012` | Registrada | Implementado | NO APLICABLE PORQUE YA FIGURA REGISTRADA | N/A (CLI la saltea) |
| `00013` | Registrada | Implementado | NO APLICABLE PORQUE YA FIGURA REGISTRADA | N/A (CLI la saltea) |
| `00014` | **Pendiente** | Implementado (ESTADO_A) | **IDEMPOTENTE RESPECTO DEL QA ACTUAL** | **SÍ (Apta, ruta ESTADO_A neutral)** |

---

## 6. Respuestas a los Puntos Clave

1. **¿Qué migraciones están pendientes en QA?**  
   Únicamente **`20260905000014_converge_rebuild_to_qa.sql`**. Las migraciones `00012` y `00013` ya están formalmente registradas en QA.
2. **¿En qué orden deberían aplicarse si se autoriza?**  
   Únicamente se aplicaría la migración `00014` como siguiente paso secuencial.
3. **¿QA y REBUILD tienen actualmente el mismo estado efectivo pero distinto historial?**  
   **Sí.** Ambas bases de datos poseen paridad comprobada en todas sus capas, pero REBUILD tiene 14 migraciones registradas en su historial y QA tiene 13.
4. **¿Es seguro aplicar la pendiente (`00014`) en QA?**  
   **Sí, es técnicamente seguro.** La migración `00014` detecta que QA se encuentra en `ESTADO_A`, valida exhaustivamente la integridad del catálogo y ejecuta un `RETURN` sin realizar operaciones DDL ni DML, logrando la convergencia del historial de Supabase sin alterar el estado funcional de QA.
5. **¿Hace falta alguna verificación adicional antes de autorizar el push?**  
   No se requieren verificaciones estructurales adicionales. La verificación de `db push --dry-run` confirmó que la CLI no tocará migraciones anteriores.
6. **¿Qué comando exacto se propondría para una tarea posterior?**  
   *(Marcado estrictamente como no ejecutado y para ejecución futura bajo autorización expresa)*:
   ```bash
   # [RECOMENDACIÓN FUTURA — NO EJECUTADO]
   supabase db push --project-ref hdkfeonbmhxkagdrbdio
   ```

---

## 7. Dictamen Global

```text
APTO PARA AUTORIZAR APLICACIÓN EN QA
```

**Fundamentación:**  
La única migración pendiente en QA es `00014`. Su diseño arquitectónico contempla expresamente la neutralidad absoluta frente a QA canónico (`ESTADO_A`). Su aplicación permitirá cerrar la brecha de historial entre QA y el repositorio sin introducir ningún cambio funcional ni estructural en la base de datos de QA.

---

## 8. Confirmación de Guardrails

1. **Historial de migraciones verificado post-auditoría:**  
   Se constató que QA conserva exactamente sus 13 migraciones originales y REBUILD sus 14 migraciones. Esta auditoría no aplicó ni modificó registros de migración.
2. **Inalterabilidad de entornos:** Ni QA ni REBUILD sufrieron escrituras, DDL, DML o cambios de configuración.
3. **STAGING no consultado:** El proyecto `zpvbhexucfvywtykqpvq` no fue vinculado ni accedido.

---

## 9. Estado Final del Árbol de Trabajo (`git status --short`)

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
?? docs/EVIDENCIA_APTITUD_EXTERNA_QA_REBUILD_20260906.md
?? docs/EVIDENCIA_CANONICA_QA_REBUILD_20260905.md
?? docs/EVIDENCIA_CAPAS_1_2_3_QA_REBUILD_20260905.md
?? docs/EVIDENCIA_CAPAS_4_5_QA_REBUILD_20260906.md
?? docs/EVIDENCIA_CAPA_6_DATOS_DECLARATIVOS_QA_REBUILD_20260906.md
?? docs/EVIDENCIA_CIERRE_CAPA_6_APL_QA_REBUILD_20260906.md
?? docs/EVIDENCIA_CIERRE_DEFINITIVO_CAPAS_1_2_3_QA_REBUILD_20260906.md
?? docs/EVIDENCIA_CORRECCION_00014_FUNCIONES_QA_REBUILD_20260906.md
?? docs/EVIDENCIA_EDGE_FUNCTIONS_QA_REBUILD_20260906.md
?? docs/EVIDENCIA_FINAL_CAPAS_1_2_3_QA_REBUILD_20260906.md
?? docs/EVIDENCIA_FINAL_PRIVILEGIOS_QA_REBUILD_20260905.md
?? docs/EVIDENCIA_HISTORIAL_MIGRACIONES_QA_REBUILD_20260906.md
?? docs/EVIDENCIA_RLS_GRANTS_QA_REBUILD_20260906.md
?? docs/INFORME_TECNICO_EXTRACCION_FACTURAS_QA.md
?? supabase/migrations/20260904000012_atomic_ai_extraction_confirmation.sql
?? supabase/migrations/20260904000013_enhance_extraction_audit_and_validation.sql
?? supabase/migrations/20260905000014_converge_rebuild_to_qa.sql
?? supabase/test_staging_report.sql
?? supabase/test_staging_suite.sql
?? test/
```
