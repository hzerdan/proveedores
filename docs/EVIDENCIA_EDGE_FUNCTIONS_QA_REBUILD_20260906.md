# EVIDENCIA DE AUDITORÍA DE EDGE FUNCTIONS — QA VS REBUILD

**Fecha y hora UTC:** 2026-09-06 15:10:00 UTC  
**Rama examinada:** `staging`  
**Commit HEAD:** `7dac6632c381adabe2a1e0dcb0aaa1086653fb70`  
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
?? docs/EVIDENCIA_CANONICA_QA_REBUILD_20260905.md
?? docs/EVIDENCIA_CAPAS_1_2_3_QA_REBUILD_20260905.md
?? docs/EVIDENCIA_CAPAS_4_5_QA_REBUILD_20260906.md
?? docs/EVIDENCIA_CAPA_6_DATOS_DECLARATIVOS_QA_REBUILD_20260906.md
?? docs/EVIDENCIA_CIERRE_CAPA_6_APL_QA_REBUILD_20260906.md
?? docs/EVIDENCIA_CIERRE_DEFINITIVO_CAPAS_1_2_3_QA_REBUILD_20260906.md
?? docs/EVIDENCIA_CORRECCION_00014_FUNCIONES_QA_REBUILD_20260906.md
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

## 1. Verificación de Identidad de la Línea Base PostgreSQL (`00014`)

Antes de cualquier consulta a los entornos remotos, se recalculó directamente el hash SHA-256 de la migración de convergencia vigente:

* **Ruta exacta:** `supabase/migrations/20260905000014_converge_rebuild_to_qa.sql`
* **Tamaño:** `83,145` bytes
* **Fecha de modificación observada (UTC):** `2026-09-06 14:30:59 UTC`
* **SHA-256 fresco:** `B688DB479A05006C0339B835F16929F3DB4FB21A9CE77A3DF9564ED7DFAD6853`
* **Antecedente:** `b688db479a05006c0339b835f16929f3db4fb21a9ce77a3df9564ed7dfad6853`
* **Coincidencia:** **EXACTA (100% IDÉNTICO)**

---

## 2. Herramientas y Versiones Utilizadas

* **Supabase CLI:** `2.84.2` (instalada vía Scoop)
* **Git:** `2.53.0.windows.1`
* **Python:** `3.12.7` (utilizado para cálculos determinísticos de SHA-256 sobre buffers binarios)
* **PowerShell:** `5.1.26100.2161`
* **Modo de operación:** Estrictamente solo lectura (`read-only`), sin despliegues, sin escrituras y sin ejecución de payloads reales.

---

## 3. Comandos de Solo Lectura Ejecutados (Sanitizados)

1. `git status --short; git branch --show-current; git rev-parse HEAD`
2. `powershell -Command "Get-FileHash -Algorithm SHA256 'supabase\migrations\20260905000014_converge_rebuild_to_qa.sql'"`
3. `supabase --version`
4. `powershell -Command "Get-ChildItem -Path 'supabase\functions' -Recurse"`
5. `supabase functions list --project-ref hdkfeonbmhxkagdrbdio -o json`
6. `supabase functions list --project-ref kbvhwizxpfkzrjxsulsk -o json`
7. `supabase functions download extract-invoice --project-ref hdkfeonbmhxkagdrbdio --use-api` (descarga a `$env:TEMP\supabase_download_test`)
8. `supabase functions download extract-invoice --project-ref kbvhwizxpfkzrjxsulsk --use-api` (descarga a `$env:TEMP\supabase_download_rebuild`)
9. `python -c "import hashlib; data = open(...); print(hashlib.sha256(data).hexdigest())"` (hashes sobre copias descargadas y locales)
10. `powershell -Command "Compare-Object ..."` (comparación byte a byte)
11. `powershell -Command "Remove-Item -Recurse -Force '$env:TEMP\supabase_download_*'"` (limpieza de temporales fuera del repo)

---

## 4. Parte A — Inventario del Código Fuente (Local)

### 4.1. Funciones encontradas
Se localizó **1 sola función** en el código fuente:
* **Nombre / Directorio:** `extract-invoice`
* **Punto de entrada:** `supabase/functions/extract-invoice/index.ts`
* **Archivos auxiliares / subdirectorios:** Ninguno (no existen archivos bajo `supabase/functions/_shared`, ni import maps específicos en esa carpeta).

### 4.2. Configuración local observable
* **`supabase/config.toml`:**
  * Define la sección `[edge_runtime]`:
    * `enabled = true`
    * `policy = "per_worker"`
    * `inspector_port = 8083`
    * `deno_version = 2`
  * No define entradas individuales por función (ej. `[functions.extract-invoice]`).
  * En `config.toml`, `verify_jwt` no está declarado a nivel por-función (utiliza los defaults de la plataforma o del CLI al desplegar).
* **Archivos Deno en la raíz:** No existen `deno.json`, `deno.jsonc` ni `import_map.json` en el repositorio.

### 4.3. Dependencias e Imports observables en `extract-invoice/index.ts`
* `https://deno.land/std@0.168.0/http/server.ts` (`serve`)
* `https://esm.sh/@supabase/supabase-js@2.38.4` (`createClient`)

### 4.4. Hashes Determinísticos de los Archivos Locales
* **Archivo:** `supabase/functions/extract-invoice/index.ts`
  * **Tamaño en copia de trabajo:** `26,397` bytes
  * **SHA-256 copia de trabajo:** `7129a3035fa216da2167f08e40f3feef684dd32b818eea5daa50575233c7cabc`
  * **Método de cálculo:** SHA-256 directo sobre el stream de bytes binarios del archivo.
  * **Hash determinístico del conjunto de la función:** Al constar de un único archivo fuente, el hash del conjunto de la función es idéntico al hash del archivo: `7129a3035fa216da2167f08e40f3feef684dd32b818eea5daa50575233c7cabc`.

---

## 5. Parte B — Inventario Remoto (QA vs REBUILD)

Consultas ejecutadas mediante Supabase CLI conectando con tokens del entorno en modo de solo lectura (`list`):

### 5.1. QA Canónico (`hdkfeonbmhxkagdrbdio`)
```json
[
  {
    "id": "14f7ac4c-be07-4a1a-977d-a08c1186635e",
    "name": "extract-invoice",
    "slug": "extract-invoice",
    "status": "ACTIVE",
    "version": 10,
    "verify_jwt": true,
    "import_map": false,
    "entrypoint_path": "file:///Antigravity/Leon_Proveedores/supabase/functions/extract-invoice/index.ts",
    "ezbr_sha256": "bfb8b7d7a7582b73ede90982deae83d9be2cfac81955d76a9dd4bb132f0150f7",
    "created_at": 1787598283443,
    "updated_at": 1788563831205
  }
]
```
* **Fecha de Creación (UTC):** `2026-08-24 19:04:43 UTC`
* **Fecha de Última Actualización (UTC):** `2026-09-04 23:17:11 UTC`
* **Versión activa:** `10`
* **Estado:** `ACTIVE`
* **`verify_jwt`:** `true`
* **ezbr_sha256:** `bfb8b7d7a7582b73ede90982deae83d9be2cfac81955d76a9dd4bb132f0150f7`

### 5.2. REBUILD Descartable (`kbvhwizxpfkzrjxsulsk`)
```json
[
  {
    "id": "f0d30e0d-8e58-42dd-a025-9d41012f67e7",
    "name": "extract-invoice",
    "slug": "extract-invoice",
    "status": "ACTIVE",
    "version": 1,
    "verify_jwt": true,
    "entrypoint_path": "file:///Antigravity/Leon_Proveedores/supabase/functions/extract-invoice/index.ts",
    "ezbr_sha256": "bfb8b7d7a7582b73ede90982deae83d9be2cfac81955d76a9dd4bb132f0150f7",
    "created_at": 1788576511314,
    "updated_at": 1788576511314
  }
]
```
* **Fecha de Creación (UTC):** `2026-09-05 02:48:31 UTC`
* **Fecha de Última Actualización (UTC):** `2026-09-05 02:48:31 UTC`
* **Versión activa:** `1`
* **Estado:** `ACTIVE`
* **`verify_jwt`:** `true`
* **ezbr_sha256:** `bfb8b7d7a7582b73ede90982deae83d9be2cfac81955d76a9dd4bb132f0150f7`

> **Observación clave de metadatos:**  
> Ambos entornos reportan de manera idéntica el `ezbr_sha256` (`bfb8b7d7a7582b73ede90982deae83d9be2cfac81955d76a9dd4bb132f0150f7`) y `verify_jwt: true`.

---

## 6. Parte C — Código Desplegado y Comparación

Utilizando `supabase functions download extract-invoice --project-ref <REF> --use-api`, fue posible descargar de forma no destructiva el código fuente desplegado en ambos proyectos a un directorio temporal aislado (`%TEMP%\supabase_download_*`), sin tocar el repositorio.

### 6.1. Archivo recuperado de QA (`hdkfeonbmhxkagdrbdio`)
* **Archivo:** `supabase/functions/extract-invoice/index.ts`
* **Tamaño:** `26,397` bytes
* **SHA-256 binario:** `7129a3035fa216da2167f08e40f3feef684dd32b818eea5daa50575233c7cabc`

### 6.2. Archivo recuperado de REBUILD (`kbvhwizxpfkzrjxsulsk`)
* **Archivo:** `supabase/functions/extract-invoice/index.ts`
* **Tamaño:** `26,397` bytes
* **SHA-256 binario:** `7129a3035fa216da2167f08e40f3feef684dd32b818eea5daa50575233c7cabc`

### 6.3. Comparación Semántica y Normalización
* **Normalización requerida:** Ninguna. La comparación se realizó de forma directa byte a byte.
* **Resultado entre QA y REBUILD:** **100% IDÉNTICOS** (mismo hash, mismo contenido).
* **Resultado entre copia de trabajo local y remotos:** **100% IDÉNTICOS**.  
  El código actualmente presente en la copia de trabajo local (`7129a3035f...`) coincide en un 100% con lo desplegado en QA y lo desplegado en REBUILD.

---

## 7. Parte D — Variables Requeridas por el Código (Análisis Estático)

Se realizó análisis estático del archivo `supabase/functions/extract-invoice/index.ts` buscando referencias a variables de entorno (`Deno.env.get(...)`):

| Variable de Entorno | Ubicación (Línea) | Finalidad inferida desde el código | Obligatoria / Opcional | Comportamiento si falta |
| :--- | :--- | :--- | :--- | :--- |
| `SUPABASE_URL` | Línea 374 | URL del backend Supabase para inicializar `supabaseAdmin` | Obligatoria funcionalmente | Si falta, toma fallback `""`. `createClient` fallará o las llamadas al storage/DB arrojarán error de red. Provista automáticamente por la plataforma Supabase. |
| `SUPABASE_SERVICE_ROLE_KEY` | Línea 375 | Clave con privilegios de service role para bypass de RLS al persistir en `document_ai_extractions`, leer perfiles y descargar archivos de storage | Obligatoria funcionalmente | Si falta, toma fallback `""`. Toda consulta/inserción administrativa fallará con error 401/403. Provista automáticamente por la plataforma Supabase. |
| `OPENAI_API_KEY` | Línea 376 | Token de autenticación para la API de OpenAI (Files API y Chat Completions con Structured Outputs) | **Obligatoria** | Si falta, la función arroja explícitamente: `throw new Error("OPENAI_API_KEY no está configurada en los secretos de Supabase.")` y retorna HTTP 500. |
| `OPENAI_DOCUMENT_MODEL` | Línea 377 | Especificar el modelo de OpenAI para extracción estructurada | Opcional | Si falta, toma por defecto el valor fallback `"gpt-4o-mini"`. |

*(Nota de seguridad: No se consultaron, verificaron ni mostraron valores de secretos remotos).*

---

## 8. Parte E — Integridad de la Copia de Trabajo (`extract-invoice/index.ts`)

* **¿Está versionado en Git?:** Sí.
* **¿Tiene cambios respecto de `HEAD` (`7dac6632`):** **Sí**, está modificado en el working tree (`M supabase/functions/extract-invoice/index.ts`).
* **Hash SHA-256 de la versión en `HEAD`:** `26efb8f95e4042c97141cb2c89febbf5476983a1a5a0c6c1902d68233024ba64` (tamaño: `8,226` bytes, 228 líneas).
* **Hash SHA-256 de la versión en Working Tree:** `7129a3035fa216da2167f08e40f3feef684dd32b818eea5daa50575233c7cabc` (tamaño: `26,397` bytes, 670 líneas).
* **Resumen técnico del diff (`git diff --stat`):** `606 líneas alteradas (+524 inserciones, -82 supresiones)`.
* **Aspectos afectados por el cambio:**
  1. **Lógica y Validación Fiscal:** Migración del esquema JSON de Structured Outputs a `JSON_SCHEMA_INVOICE_V2` (soporta extracción de CAE, punto de venta preservando ceros, condición de venta/pago, base de cálculo `ISSUE_DATE`/`RECEIPT_DATE`, desglose impositivo y moneda).
  2. **Soporte Nativo de PDFs:** Incorpora integración con OpenAI Files API para subir PDFs temporalmente y procesarlos nativamente sin requerir rasterización previa a imágenes en el cliente.
  3. **Ciclo de Vida y Limpieza:** Incorpora bloque `finally` para borrado garantizado del archivo temporal en OpenAI (`DELETE https://api.openai.com/v1/files/${openaiFileId}`).
  4. **Persistencia y Auditoría:** Función determinística `evaluateExtractionStatus` clasificando en `SUCCESS`, `PARTIAL` o `FAILED` con motivos estructurados en `document_ai_extractions`.
  5. **Seguridad e Identidad:** Detección dinámica del usuario creador autenticado a través del token Bearer / perfiles (`profiles`), eliminando el hardcodeo previo (`created_by: 3`).
* **Relación con los entornos desplegados:**  
  Tanto **QA** como **REBUILD** tienen actualmente desplegada **la versión modificada de la copia de trabajo** (`7129a3035f...`), y **no** la versión antigua registrada en `HEAD` (`26efb8f95e...`).

---

## 9. Matriz de Resultados

| Control | Repositorio (`HEAD`) | Copia de Trabajo | QA (`hdkfeonbmhxkagdrbdio`) | REBUILD (`kbvhwizxpfkzrjxsulsk`) | Resultado |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Existencia de `extract-invoice`** | Presente | Presente | Presente | Presente | **PARIDAD COMPROBADA** |
| **Código verificable** | Verificable | Verificable | Verificable (`download --use-api`) | Verificable (`download --use-api`) | **PARIDAD COMPROBADA** |
| **Hash del código (SHA-256)** | `26efb8f95e...` | `7129a3035f...` | `7129a3035f...` | `7129a3035f...` | **PARIDAD COMPROBADA** (QA == REBUILD == Copia de Trabajo; difiere de HEAD) |
| **Versión desplegada** | N/A | N/A | Versión `10` | Versión `1` | **DIFERENCIA DE CONFIGURACIÓN** (Historial de despliegues: QA tuvo 10 iteraciones, REBUILD fue desplegado 1 vez en su reconstrucción) |
| **Estado** | N/A | N/A | `ACTIVE` | `ACTIVE` | **PARIDAD COMPROBADA** |
| **`verify_jwt`** | No fijado en `config.toml` | No fijado en `config.toml` | `true` | `true` | **PARIDAD COMPROBADA** |
| **Dependencias observables** | `std@0.168.0`, `supabase-js@2.38.4` | `std@0.168.0`, `supabase-js@2.38.4` | Idénticas a copia de trabajo | Idénticas a copia de trabajo | **PARIDAD COMPROBADA** |
| **Variables requeridas identificadas** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `OPENAI_DOCUMENT_MODEL` | N/E (auditoría de secretos separada) | N/E (auditoría de secretos separada) | **EVALUADO EN CÓDIGO** |

---

## 10. Limitaciones y Elementos no Verificables

1. **Valores de Variables de Entorno y Secretos:**  
   Por estricto cumplimiento de los guardrails de seguridad y alcance de esta tarea, no se consultaron, verificaron ni mostraron los valores ni la presencia efectiva de secretos remotos (`OPENAI_API_KEY`, etc.). Esta comprobación corresponderá a una auditoría específica de secretos.
2. **Historial de Versiones Anteriores en Remoto:**  
   La API de Supabase solo expone la versión activa actual (v10 en QA, v1 en REBUILD) y su metadata. No es posible descargar versiones intermedias anteriores desde la plataforma sin alterar el entorno.

---

## 11. Hallazgos Clasificados por Severidad

### Severidad Media
* **[MED] Desalineación entre `HEAD` de Git y el código desplegado en QA y REBUILD:**  
  El archivo `supabase/functions/extract-invoice/index.ts` está modificado en la copia de trabajo respecto al commit `HEAD` (`7dac6632`). Los entornos remotos (tanto QA como REBUILD) tienen desplegada la versión evolucionada presente en el working tree (v2 con soporte PDF nativo y schema estricto). La versión en `HEAD` está desactualizada respecto a lo que está en producción/QA.  
  *Acción recomendada para tareas futuras:* No revertir; incorporar este archivo al commit correspondiente en la fase planificada de consolidación del repositorio.

### Severidad Baja / Informativo
* **[INFO] Diferencia en número secuencial de versión (`version: 10` vs `version: 1`):**  
  QA posee número de versión 10 debido a sucesivos despliegues históricos durante su desarrollo, mientras que REBUILD posee versión 1 al haber sido aprovisionado recientemente. Dado que el código descargado y el hash de bundle (`ezbr_sha256`) son 100% idénticos, esta discrepancia es meramente un contador incremental de la plataforma sin impacto técnico.
* **[INFO] Ausencia de `[functions.extract-invoice]` en `supabase/config.toml`:**  
  No existe configuración explícita declarada para la función en `supabase/config.toml`. Aunque los entornos remotos tienen `verify_jwt = true`, declarar explícitamente `verify_jwt = true` en `config.toml` asegurará consistencia declarativa en futuros despliegues locales o automatizados.

---

## 12. Conclusión Estrictamente Respaldada por la Evidencia

1. **Existe paridad total de código entre QA y REBUILD:**  
   La función `extract-invoice` desplegada en QA (`hdkfeonbmhxkagdrbdio`) y en REBUILD (`kbvhwizxpfkzrjxsulsk`) es **estrictamente idéntica** byte a byte (`SHA256: 7129a3035fa216da2167f08e40f3feef684dd32b818eea5daa50575233c7cabc`).
2. **Existe paridad total de configuración de seguridad observada:**  
   Ambos entornos tienen la función en estado `ACTIVE`, con `verify_jwt: true` y el mismo hash de bundle empaquetado (`ezbr_sha256: bfb8b7d7a7582b73ede90982deae83d9be2cfac81955d76a9dd4bb132f0150f7`).
3. **El código desplegado coincide al 100% con la copia de trabajo local:**  
   La versión local en el working tree corresponde exactamente a la versión desplegada en ambos entornos. La divergencia detectada es exclusivamente frente al commit histórico `HEAD`.

---

## 13. Declaraciones de Cumplimiento de Guardrails

1. **No se modificaron QA, REBUILD ni STAGING:** Ninguna operación de escritura, mutación, reset, push o despliegue fue ejecutada en ningún proyecto.
2. **STAGING no fue consultado:** En ningún momento se ejecutaron comandos, peticiones ni consultas hacia el proyecto STAGING (`zpvbhexucfvywtykqpvq`).
3. **No se desplegaron funciones ni se consumieron secretos:** No se invocó `supabase functions deploy`, no se ejecutaron llamadas con payloads reales a OpenAI y no se solicitaron valores confidenciales de secretos.
4. **Estado final del repositorio:** Se mantuvo estrictamente intacto el working tree previo. El único archivo creado fue este informe de evidencia.

---

## 14. Estado Final del Árbol de Trabajo (`git status --short`)

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
