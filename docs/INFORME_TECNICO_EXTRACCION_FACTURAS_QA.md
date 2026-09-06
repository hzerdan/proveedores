# Informe Técnico Final: Extracción Documental de Facturas (PDF e Imágenes)
**Cierre de Hito y Clasificación Determinística**

---

## 1. Resumen Ejecutivo y Alcance

Se concluye el hito de optimización para la extracción, normalización, auditoría y confirmación atómica de comprobantes de proveedores en el entorno de **QA** (`hdkfeonbmhxkagdrbdio`), respetando estrictamente el principio rector del sistema:
> *«La IA extrae evidencias; el código calcula y compara; el operador decide; el sistema audita.»*

### Decisiones de Cierre del Hito
1. **PDF digital:** Considerado plenamente implementado, probado y verificado en QA mediante OpenAI Files API nativo.
2. **Eliminación de fallback ficticio:** Considerada plenamente implementada; se erradicó la generación de datos inventados y registros ficticios de éxito.
3. **Tratamiento determinístico:** Cálculo de vencimientos, formateo canónico de fechas (`DD/MM/YYYY`) y auditoría server-side implementados y verificados.
4. **Orientación móvil:** Normalización EXIF y botón manual de giro de 90° implementados en código; validación de campo abierta para una etapa posterior con nuevas fotos reales.
5. **Precisión en fotografías:** No homologada en esta etapa por falta de una muestra estadística representativa.
6. **Prompt y Modelo:** Se mantiene `gpt-4o-mini` sin sobreajustar prompts ni preprocesamientos a la única fotografía histórica disponible.

---

## 2. Clasificación Determinística de Extracciones

Se implementó y unificó la lógica de evaluación determinística tanto en la Edge Function (`extract-invoice`) como en el frontend (`src/lib/aiExtractor.ts`), eliminando estados ambiguos:

- **`SUCCESS`**:
  - Emisor con CUIT formalmente válido según algoritmo Módulo 11 de AFIP.
  - Tipo de comprobante y letra fiscal presentes y válidos (`FACTURA`, `NOTA_DEBITO`, `NOTA_CREDITO`, `RECIBO`).
  - Punto de venta numéricamente válido ($1 \le \text{POS} \le 99999$).
  - Número de comprobante válido ($1 \le \text{NUM} \le 99999999$ y longitud $\le 8$ dígitos).
  - Fecha de emisión canónica verificada en calendario gregoriano real (rechaza años bisiestos inválidos y meses de 30 días con día 31).
  - Moneda identificada (`ARS`, `USD`, `EUR`).
  - Importe total positivo ($> 0$) numéricamente coherente.
  - Ausencia de campos críticos en `missing_fields` o `uncertain_fields`.
  - CUIT del emisor distinto al CUIT del receptor.

- **`PARTIAL`**:
  - Existe información aprovechable para precargar el formulario (ej. razón social, total o fecha extraída), pero al menos un campo crítico está ausente, es inválido (ej. CUIT no pasa Módulo 11), anómalo (ej. longitud de número excesiva) o requiere revisión humana obligatoria.
  - **Prueba de regresión histórica:** La muestra de Tecnografic (cuyo CUIT `20-27196491-7` no supera Módulo 11 y cuyo número extraído `1000000030001006` tiene 16 dígitos) clasifica estrictamente como **`PARTIAL`** con motivos explícitos:
    - `"CUIT del emisor inválido (20-27196491-7)"`
    - `"Número de comprobante ausente o con longitud/valor anómalo (1000000030001006)"`
    **Nunca más califica como `SUCCESS`.**

- **`FAILED`**:
  - No existe información mínima utilizable o se produjo una falla técnica irrecuperable en el procesamiento.
  - CERO datos inventados; retorno transparente del error y auditoría del fallo.

> [!NOTE]
> **Integridad Histórica:** No se alteraron retroactivamente los registros históricos de base de datos en QA. Las extracciones existentes quedan intactas como testimonio del comportamiento previo antes de este hito.

---

## 3. Verificación de Estructuras para Estadísticas Futuras

Se constató que las tablas existentes (`document_ai_extractions`, `document_files` y `documents`) ya capturan la totalidad de las dimensiones necesarias para análisis estadístico y benchmarking, **sin necesidad de agregar tablas accesorias ni inventar métricas porcentuales artificiales de confianza**:

| Dimensión Requerida | Campo / Tabla Existente | Observación |
|---|---|---|
| Archivo original | `document_files.storage_path`, `file_name`, `mime_type`, `file_size_bytes` | Referencia física e inmutable |
| Modo de ingreso | `document_files.file_category`, `documents.intake_source` | WEB_DROP vs MOBILE_QR |
| Respuesta cruda de IA | `document_ai_extractions.extracted_raw_payload` | JSONB íntegro devuelto por OpenAI |
| Payload normalizado | `document_ai_extractions.confirmed_payload_diff` | Comparativa estructurada |
| Modelo y Proveedor | `document_ai_extractions.model_name`, `model_provider` | `gpt-4o-mini`, `OPENAI` |
| Duración técnica | `document_ai_extractions.extraction_duration_ms` | Milisegundos de procesamiento |
| Versión de esquema | `extracted_raw_payload->'schema_version'` | `'2.0'` |
| Estado de extracción | `document_ai_extractions.status` | `'SUCCESS'`, `'PARTIAL'`, `'FAILED'` |
| Advertencias y campos dudosos | `extracted_raw_payload->'warnings'`, `uncertain_fields`, `missing_fields` | Listas de discrepancias |
| Diff humano vs IA | `document_ai_extractions.confirmed_payload_diff` | Captura cambios realizados por el operador |
| Auditoría de confirmación | `document_ai_extractions.confirmed_by`, `confirmed_at` | Usuario y fecha real de aprobación |
| Documento final | `document_ai_extractions.document_id` -> `documents.id` | Vínculo 1 a 1 con comprobante contable |

---

## 4. Muestra Recomendada para Homologación Futura de Fotografías

Para la futura etapa de homologación de fotografías móviles, se recomienda no evaluar casos individuales aislados sino recopilar un lote de **15 a 20 comprobantes reales**, cubriendo la siguiente matriz de variabilidad:

1. **Tipos y Diseños Fiscales (mínimo 4 variantes):**
   - Facturas A de grandes proveedores (formato corporativo estándar).
   - Facturas B / C de pequeños proveedores o prestadores de servicios.
   - Tickets fiscales térmicos (papel continuo con degradación de contraste).
   - Facturas impresas en formularios continuos o matriz de punto.
2. **Orientación y Encuadre (mínimo 3 variantes):**
   - Capturas verticales directas (0°).
   - Capturas horizontales (90° / 270°) para validar el normalizador EXIF y botón manual.
   - Encuadres con fondo externo (mesa, teclado, escritorio) y recorte irregular.
3. **Condiciones de Iluminación y Captura (mínimo 3 variantes):**
   - Iluminación difusa de oficina.
   - Reflejos puntuales de flash o luz directa sobre papel satinado.
   - Comprobantes arrugados, doblados o con sombras de la mano/celular.
4. **Condiciones Comerciales y Vencimientos:**
   - Comprobantes con condición contado.
   - Comprobantes con condición a plazo (ej. "30 días fecha factura").
   - Comprobantes sin fecha de vencimiento explícita impresa.

---

## 5. Resultados de las Verificaciones Técnicas Finales

Todas las compuertas de calidad pasaron de forma limpia y concluyente:

1. **Suite de Pruebas Unitarias (`test/unit_suite.ts`):**
   - Comando: `npx tsx test/unit_suite.ts`
   - Resultado: **51 pruebas pasadas, 0 fallidas**.
   - Cobertura: Validadores de calendario inverso, Módulo 11 de CUIT, cálculo determinístico de vencimientos, Schema v1/v2 y clasificación determinística (`SUCCESS`, `PARTIAL`, `FAILED`).
2. **Chequeo de Tipos TypeScript:**
   - Comando: `npx tsc --noEmit`
   - Resultado: **0 errores**.
3. **Linter:**
   - Comando: `npm run lint`
   - Resultado: **0 errores, 0 advertencias**.
4. **Compilación de Producción:**
   - Comando: `npm run build`
   - Resultado: **Exitoso en 3.50s** (`dist/` generado correctamente).
5. **Despliegue de Edge Function a QA:**
   - CLI: Supabase CLI (Scoop v2.84.2).
   - Comando: `supabase functions deploy extract-invoice --project-ref hdkfeonbmhxkagdrbdio`
   - Resultado: **Despliegue exitoso (script size: 145.4 kB)**.

---

## 7. Adenda: Clasificación Semántica Definitiva (`SUCCESS` | `PARTIAL` | `FAILED`)

### 7.1. Separación Conceptual: Éxito Técnico vs. Calidad Semántica

| Resultado Técnico | Resultado Semántico | Estado Definitivo | Comportamiento en Formulario |
|---|---|---|---|
| **Error técnico** (descarga, timeout, storage, mime, JSON roto) | No aplica | **`FAILED`** | Muestra error real; ofrece formulario vacío o reintentar; cero datos inventados. |
| **Correcto (HTTP 200)** | Sin información mínima aprovechable (< 2 campos clave) | **`FAILED`** | Informa documento ilegible o sin datos mínimos fiscales. |
| **Correcto (HTTP 200)** | Aprovechable pero con campos críticos ausentes, inválidos o inciertos | **`PARTIAL`** | Precarga valores útiles; destaca campos observados; exige revisión humana obligatoria. |
| **Correcto (HTTP 200)** | Completo y formalmente consistente según matriz fiscal | **`SUCCESS`** | Precarga formulario; muestra "Extracción completa"; confirmación humana obligatoria. |

### 7.2. Matriz de Campos Críticos por Tipo Documental

| Campo | Factura (`FACTURA`) | Nota de Débito (`NOTA_DEBITO`) | Nota de Crédito (`NOTA_CREDITO`) | Recibo (`RECIBO`) | Otro (`OTRO`) |
|---|:---:|:---:|:---:|:---:|:---:|
| **CUIT Emisor** (Módulo 11) | **CRÍTICO** | **CRÍTICO** | **CRÍTICO** | **CRÍTICO** | Opcional (si existe, válido) |
| **Tipo de Comprobante** | **CRÍTICO** | **CRÍTICO** | **CRÍTICO** | **CRÍTICO** | **CRÍTICO** |
| **Letra Fiscal** (A, B, C, M) | **CRÍTICO** | **CRÍTICO** | **CRÍTICO** | No aplica | No aplica |
| **Punto de Venta** ($1..99999$) | **CRÍTICO** | **CRÍTICO** | **CRÍTICO** | Opcional | Opcional |
| **Número** ($1..99999999, \le 8$ d) | **CRÍTICO** | **CRÍTICO** | **CRÍTICO** | **CRÍTICO** | Opcional |
| **Fecha de Emisión** (Canónica) | **CRÍTICO** | **CRÍTICO** | **CRÍTICO** | **CRÍTICO** | **CRÍTICO** |
| **Moneda** (`ARS`, `USD`, `EUR`) | **CRÍTICO** | **CRÍTICO** | **CRÍTICO** | **CRÍTICO** | **CRÍTICO** |
| **Importe Total** ($> 0$) | **CRÍTICO** | **CRÍTICO** | **CRÍTICO** | **CRÍTICO** | **CRÍTICO** |
| **Fecha de Vencimiento** | Permite ausencia | Permite ausencia | No aplica | No aplica | No aplica |

> **Regla de Vencimiento:** La ausencia de fecha de vencimiento es válida para `SUCCESS` (e.g. operaciones al contado). Si existe contradicción flagrante (vencimiento anterior a la fecha de emisión o discrepancia entre fecha impresa y condición calculada `due_date_inconsistency === true`), califica obligatoriamente como **`PARTIAL`**.

### 7.3. Ubicación Exacta del Clasificador Server-Side y Client-Side
1. **Edge Function Server-Side:** [`supabase/functions/extract-invoice/index.ts`](file:///c:/Antigravity/Leon_Proveedores/supabase/functions/extract-invoice/index.ts) (función `evaluateExtractionStatus`).
   - Se ejecuta en backend antes de persistir en `document_ai_extractions`. El cliente no puede forzar un `SUCCESS` artificial.
2. **Frontend Mirror:** [`src/lib/aiExtractor.ts`](file:///c:/Antigravity/Leon_Proveedores/src/lib/aiExtractor.ts) (función `evaluateExtractionStatus` exportada y enlazada en `reconcileInvoiceEvidence`).
3. **UI Formulario:** [`src/components/documents/DocumentFormModal.tsx`](file:///c:/Antigravity/Leon_Proveedores/src/components/documents/DocumentFormModal.tsx) (banners semánticos reactivos con renderizado condicional según estado).

### 7.4. Resultado del Fixture de Regresión Tecnografic
- **Payload evaluado:** CUIT `20-27196491-7`, POS `00003`, Número `1000000030001006` (16 dígitos), Total `$36.000,00`.
- **Clasificación:** **`PARTIAL` (Nunca `SUCCESS`)**.
- **Motivos concretos de degradación:**
  1. `"CUIT del emisor inválido (20-27196491-7)"`: Falla algoritmo Módulo 11 de AFIP.
  2. `"Número de comprobante ausente o con longitud/valor anómalo (1000000030001006)"`: Longitud de 16 caracteres excede el límite legal argentino de 8 dígitos.
- **Aclaración sobre registros históricos:** El registro histórico en QA (`document_ai_extractions` ID 6) **NO fue modificado retroactivamente**. Permanece con su valor histórico como testimonio previo. La evaluación `PARTIAL` proviene del clasificador activo en código y tests.

### 7.5. Verificación de Integridad del Ledger (Documentos 84 y 85)
- **Consulta ejecutada:** `SELECT * FROM documents WHERE id >= 75` y `account_movements WHERE document_id >= 75`.
- **Resultado:**
  - El documento con mayor ID en la base de datos de QA es el **ID 76**.
  - **Los documentos 84 y 85 NO existen en la base de datos.**
  - Fueron ejecutados dentro de una transacción de prueba con `ROLLBACK` explícito en `test_atomic_rpc_suite.sql`.
  - Ningún movimiento contable de prueba quedó persistido en el Ledger.

### 7.6. Resultado de Compuertas de Calidad y Suite Contractual
- **Pruebas Unitarias y Contractuales:** `npx tsx test/unit_suite.ts` -> **74 / 74 PASS (100% aprobados, 0 fallos)**.
  - Test Suite 1: `parseCanonicalDate` y restricciones estrictas de calendario gregoriano (16 tests).
  - Test Suite 2: Validación y normalización de CUIT Módulo 11 (5 tests).
  - Test Suite 3: Cálculo determinístico de vencimiento (4 tests).
  - Test Suite 4: `reconcileInvoiceEvidence` y coexistencia Schema v1 vs v2 (16 tests).
  - Test Suite 5: Clasificación semántica de estado `SUCCESS | PARTIAL | FAILED` (22 tests).
  - Test Suite 6 (Contractual): Paridad estricta entre Edge Function compilada y evaluador de frontend sobre 11 fixtures heterogéneos (11 tests).
- **Chequeo de Tipos Estricto:** `npx tsc --noEmit` -> **0 errores**.
- **Linter de Código:** `npm run lint` -> **0 errores, 0 warnings**.
- **Compilación de Producción:** `npm run build` -> **Exitoso en 3.46s** (`dist/assets/index-B_YYh_aE.js`).
- **Despliegue Scoop CLI:** `supabase functions deploy extract-invoice --project-ref hdkfeonbmhxkagdrbdio` -> **Exitoso en QA**.

---

## 8. Cierre Técnico y Auditoría de Certificación en QA

### 8.1. Registro de Migraciones Estructurales Aplicadas en QA
Para dar soporte a la ingesta documental, evidencias fiscales y trazabilidad de confirmación, se crearon y aplicaron en QA las siguientes migraciones inmutables:
1. **`20260904000012_document_files_and_ai_extractions_schema_v2.sql`:**
   - Creación de tabla `document_files` para preservación de archivos en Storage con hashes, metadatos y categorías documentales (`INVOICE_PDF`, `INVOICE_IMAGE`).
   - Expansión de `document_ai_extractions` para Schema v2.0 (`model_provider`, `extraction_duration_ms`, `error_message`, `status`, `confirmed_payload_diff`, `confirmed_by`, `confirmed_at`).
   - Creación de la RPC `rpc_register_document_file` para vinculación segura de archivos cargados.
2. **`20260904000013_strengthen_atomic_document_confirmation.sql`:**
   - Fortalecimiento de la RPC atómica `rpc_create_and_confirm_document`.
   - Validaciones server-side: correspondencia estricta entre `file_id` y `ai_extraction_id`, verificación de pertenencia a la sesión/usuario autenticado, prohibición de reconfirmación de extracciones ya vinculadas a otros documentos.
   - Saneamiento y validación estricta de `p_confirmed_payload_diff`, exigiendo justificación obligatoria si la fecha de vencimiento es manual (`MANUAL`).

### 8.2. Semántica y Arquitectura de `extracted_raw_payload`
Para evitar confusiones entre las distintas capas de datos, la estructura persistida en `document_ai_extractions.extracted_raw_payload` opera bajo definiciones rigurosas:
- **1. Salida Original de OpenAI:**
  - Corresponde a la evidencia textual y visual devuelta por el modelo (`gpt-4o-mini`) bajo Schema v2.0:
    - `supplier`: `{ tax_id, legal_name, trade_name }`
    - `receiver`: `{ tax_id, name }`
    - `document`: `{ type_code, letter, point_of_sale, document_number, issue_date, printed_due_date, payment_condition_text, payment_term_days, payment_term_basis, currency, net_amount, tax_amount, total_amount, cae, cae_due_date, concept }`
    - Listas de control: `uncertain_fields`, `warnings`, `missing_fields`.
- **2. Contenido Incorporado por el Clasificador Determinístico:**
  - La Edge Function ejecuta `evaluateExtractionStatus` y anexa metadatos evaluativos sin mutar ni sobrescribir los valores textuales reconocidos por el modelo:
    - `status`: Clasificación formal (`SUCCESS | PARTIAL | FAILED`).
    - `status_reasons`: Array de strings legibles para visualización en frontend.
    - `structured_reasons`: Array estructurado de objetos `{ code: string, field: string, message: string }` para explotación estadística futura mediante SQL (ej: `INVALID_ISSUER_CUIT`, `INVALID_DOCUMENT_NUMBER`, `DUE_DATE_PRIOR_TO_ISSUE`, `ARITHMETIC_UNBALANCED`).
- **3. Preservación sin Sobrescritura:**
  - Las claves originales devueltas por la IA se mantienen intactas en su formato exacto (incluyendo strings de ceros a la izquierda y valores null).
  - La normalización de tipos y el cálculo de vencimientos (`calculated_due_date`) operan en capas superiores de presentación y confirmación; no alteran la evidencia archivada en `extracted_raw_payload`.

### 8.3. Prueba Contractual de Paridad (Backend vs Frontend Mirror)
En el Test Suite 5 de [`test/unit_suite.ts`](file:///c:/Antigravity/Leon_Proveedores/test/unit_suite.ts), el pipeline de pruebas extrae dinámicamente el código fuente de [`supabase/functions/extract-invoice/index.ts`](file:///c:/Antigravity/Leon_Proveedores/supabase/functions/extract-invoice/index.ts) y lo transpila en tiempo de ejecución.
- Se ejecutan 11 fixtures heterogéneos (facturas válidas A y B, recibos sin letra/POS, CUITs con dígito verificador inválido, fechas inexistentes como 31/04, vencimientos contradictorios, inconsistencias aritméticas y payloads vacíos).
- Se comprueba paridad de byte en `status` y en los códigos de `structured_reasons`, garantizando que el espejo de cliente jamás difiera de la fuente autoritativa de la Edge Function.

### 8.4. Evidencia del Smoke Test en Vivo en QA (Fotografía Histórica)
Se ejecutó la prueba en vivo contra la Edge Function desplegada en el entorno de QA (`hdkfeonbmhxkagdrbdio`) procesando la fotografía histórica real (File ID 6, `1788222682892_image.jpg`):
```text
======================================================
QA LIVE SMOKE TEST: extract-invoice (Historical Photo)
======================================================
Historical Extraction ID 6 BEFORE test: {
  id: 6,
  file_id: 6,
  status: 'SUCCESS',
  created_by: 3,
  extracted_at: '2026-09-01T00:31:30.922+00:00'
}
Financial Records BEFORE test -> Documents: 61, Account Movements: 73

Invoking deployed Edge Function on QA...
Edge Function responded in 4497ms

--- Edge Function Response ---
Success: true
Status: PARTIAL
Extracted Supplier: { tax_id: '20-27196493-7', legal_name: 'Tecnograf S.R.L.', trade_name: 'Tecnograf' }
Extracted Document: {
  type_code: 'FACTURA',
  letter: 'A',
  point_of_sale: '00008',
  document_number: '00000003',
  issue_date: '2023-03-26',
  printed_due_date: 'null',
  payment_condition_text: 'RC CIBAD 30',
  payment_term_days: 30,
  payment_term_basis: 'UNKNOWN',
  currency: 'ARS',
  net_amount: 36000,
  tax_amount: 7200,
  total_amount: 43200,
  cae: 'null',
  cae_due_date: 'null',
  concept: 'null'
}
Status Reasons: [ 'CUIT del emisor inválido (20-27196493-7)' ]
Structured Reasons: [
  { "code": "INVALID_ISSUER_CUIT", "field": "supplier.tax_id", "message": "CUIT del emisor inválido (20-27196493-7)" }
]
New Extraction ID: 19

Assert Status is PARTIAL: ✓ PASS
Assert has structured reasons: ✓ PASS (INVALID_ISSUER_CUIT)
Assert has INVALID_ISSUER_CUIT: ✓ PASS

Newly created extraction in DB ID: 19
Persisted status: PARTIAL
Persisted structured reasons count: 1

Assert Historical Extraction ID 6 is 100% UNTOUCHED: ✓ PASS
Financial Records AFTER test -> Documents: 61, Account Movements: 73
Assert 0 documents created: ✓ PASS
Assert 0 account_movements created: ✓ PASS
======================================================
SMOKE TEST RESULT: ALL CHECKS PASSED PERFECTLY (100%)
```

### 8.5. Certificación de Invariantes del Sistema
1. **Extracción Histórica ID 6 Intacta:** El registro previo `document_ai_extractions.id = 6` permanece inalterado con sus valores y timestamps originales de fecha 2026-09-01.
2. **Cero Impacto en Contabilidad:** El smoke test no creó ningún registro en `documents` (conteo se mantuvo en 61) ni en `account_movements` (conteo se mantuvo en 73).
3. **STAGING Inalterado:** No se aplicó ninguna migración, cambio de esquema, función RPC ni despliegue de Edge Function en el proyecto STAGING (`zpvbhexucfvywtykqpvq`). Toda la intervención fue confinada y certificada exclusivamente en QA (`hdkfeonbmhxkagdrbdio`).

