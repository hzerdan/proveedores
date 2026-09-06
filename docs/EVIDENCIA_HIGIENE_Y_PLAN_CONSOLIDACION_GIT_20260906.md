# EVIDENCIA DE AUDITORÍA: HIGIENE, INTEGRIDAD Y PLAN DE CONSOLIDACIÓN GIT

**Fecha y hora UTC:** 2026-09-06 17:00:00 UTC  
**Rama:** `staging`  
**Commit Inicial:** `7dac6632c381adabe2a1e0dcb0aaa1086653fb70` (`Actualizacion de cuenta corriente por vendedores`)  
**Versión de Supabase CLI:** `2.84.2` (Scoop)  
**Estado:** Consolidación local ejecutada (5 commits) — Listo para push y convergencia de QA  

---

## 1. Estado Inicial del Repositorio

### 1.1 `git status --short` Previo a la Consolidación
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

### 1.2 Remoto y Configuración de Tracking
* **Remoto:** `origin https://github.com/hzerdan/proveedores.git`
* **Rama `staging`:** Basada inicialmente en el commit `7dac6632`. No posee upstream configurado (`[origin/staging]` no existe de forma remota predeterminada).
* **Archivos sensibles (`.env`):** Verificados con `git check-ignore`. `.env`, `.env.staging` y `.env.local` se encuentran ignorados por `.gitignore` y **no están rastreados**. Únicamente `.env.example` está versionado como plantilla pública neutral.

---

## 2. Inventario de Cambios y Decisiones de Consolidación

| Archivo | Estado Inicial | Categoría | Decisión Aprobada | Destino / Commit |
| :--- | :---: | :--- | :--- | :--- |
| `supabase/migrations/20260824000001_initial_schema.sql` | `M` | MIGRACIÓN HISTÓRICA MODIFICADA | **Alternativa A:** Versionar working tree | **Commit 1** (`e00bf9d`) |
| `supabase/migrations/20260824000002_seed_data.sql` | `M` | MIGRACIÓN HISTÓRICA MODIFICADA | **Alternativa A:** Versionar working tree | **Commit 1** (`e00bf9d`) |
| `supabase/migrations/20260824000004_rls_and_security.sql` | `M` | MIGRACIÓN HISTÓRICA MODIFICADA | **Alternativa A:** Versionar working tree | **Commit 1** (`e00bf9d`) |
| `supabase/migrations/20260824000011_update_v_document_summary_and_ledger.sql` | `M` | MIGRACIÓN HISTÓRICA MODIFICADA | **Alternativa A:** Versionar working tree | **Commit 1** (`e00bf9d`) |
| `supabase/migrations/20260904000012_atomic_ai_extraction_confirmation.sql` | `??` | MIGRACIÓN NUEVA | Versionar (aplicada en QA/REBUILD) | **Commit 1** (`e00bf9d`) |
| `supabase/migrations/20260904000013_enhance_extraction_audit_and_validation.sql` | `??` | MIGRACIÓN NUEVA | Versionar (aplicada en QA/REBUILD) | **Commit 1** (`e00bf9d`) |
| `supabase/migrations/20260905000014_converge_rebuild_to_qa.sql` | `??` | MIGRACIÓN NUEVA | Versionar (en REBUILD; pendiente en QA) | **Commit 1** (`e00bf9d`) |
| `supabase/functions/extract-invoice/index.ts` | `M` | EDGE FUNCTION | Versionar (idéntico byte a byte a QA/REBUILD) | **Commit 2** (`a2496ed`) |
| `package.json` | `M` | CONFIGURACIÓN | Versionar scripts multi-entorno | **Commit 3** (`5657d92`) |
| `src/App.tsx` | `M` | CÓDIGO FRONTEND | Versionar orquestación modal | **Commit 3** (`5657d92`) |
| `src/lib/supabase.ts` | `M` | CÓDIGO FRONTEND | Versionar compatibilidad Vite/Node | **Commit 3** (`5657d92`) |
| `src/lib/aiExtractor.ts` | `M` | CÓDIGO FRONTEND | Versionar parser PDF y Schema v2.0 | **Commit 3** (`5657d92`) |
| `src/lib/formatters.ts` | `M` | CÓDIGO FRONTEND | Versionar formatters de comprobantes | **Commit 3** (`5657d92`) |
| `src/components/documents/DocumentFormModal.tsx` | `M` | CÓDIGO FRONTEND | Versionar vinculación atómica | **Commit 3** (`5657d92`) |
| `src/components/documents/DocumentIntakeModal.tsx` | `M` | CÓDIGO FRONTEND | Versionar modal de subida | **Commit 3** (`5657d92`) |
| `src/components/documents/MobileCapturePage.tsx` | `M` | CÓDIGO FRONTEND | Versionar captura móvil QR | **Commit 3** (`5657d92`) |
| `src/components/documents/MobileCaptureQRModal.tsx` | `M` | CÓDIGO FRONTEND | Versionar modal de QR | **Commit 3** (`5657d92`) |
| `supabase/test_staging_suite.sql` | `??` | TEST SQL | Renombrar a `test_functional_suite.sql` | **Commit 4** (`69dea64`) |
| `supabase/test_staging_report.sql` | `??` | TEST SQL | Renombrar a `test_functional_report.sql` | **Commit 4** (`69dea64`) |
| `test/smoke_qa.ts` | `??` | TEST INTEGRACIÓN | Versionar suite de integración QA | **Commit 4** (`69dea64`) |
| `test/test_atomic_rpc_suite.sql` | `??` | TEST SQL | Versionar suite de RPC atómico | **Commit 4** (`69dea64`) |
| `test/test_live_edge_function.mjs` | `??` | TEST EDGE FUNCTION | Versionar test de invocación real | **Commit 4** (`69dea64`) |
| `test/unit_suite.ts` | `??` | TEST UNITARIO | Versionar 74 tests unitarios | **Commit 4** (`69dea64`) |
| `docs/PROYECTO_CUENTAS_CORRIENTES_PROVEEDORES.md` | `M` | DOCUMENTACIÓN MAESTRA | Conservar y versionar | **Commit 5** |
| `docs/AUDITORIA_DOCUMENTO_MAESTRO_CC_PROVEEDORES.md` | `M` | AUDITORÍA MAESTRA | Conservar y versionar | **Commit 5** |
| `docs/INFORME_TECNICO_EXTRACCION_FACTURAS_QA.md` | `??` | EVIDENCIA FINAL VIGENTE | Conservar y versionar | **Commit 5** |
| `docs/EVIDENCIA_CIERRE_DEFINITIVO_CAPAS_1_2_3_QA_REBUILD_20260906.md` | `??` | EVIDENCIA FINAL VIGENTE | Conservar y versionar | **Commit 5** |
| `docs/EVIDENCIA_CORRECCION_00014_FUNCIONES_QA_REBUILD_20260906.md` | `??` | EVIDENCIA FINAL VIGENTE | Conservar y versionar | **Commit 5** |
| `docs/EVIDENCIA_RLS_GRANTS_QA_REBUILD_20260906.md` | `??` | EVIDENCIA FINAL VIGENTE | Conservar y versionar | **Commit 5** |
| `docs/EVIDENCIA_CIERRE_CAPA_6_APL_QA_REBUILD_20260906.md` | `??` | EVIDENCIA FINAL VIGENTE | Conservar y versionar | **Commit 5** |
| `docs/EVIDENCIA_EDGE_FUNCTIONS_QA_REBUILD_20260906.md` | `??` | EVIDENCIA FINAL VIGENTE | Conservar y versionar | **Commit 5** |
| `docs/EVIDENCIA_APTITUD_EXTERNA_QA_REBUILD_20260906.md` | `??` | EVIDENCIA FINAL VIGENTE | Conservar y versionar | **Commit 5** |
| `docs/EVIDENCIA_HISTORIAL_MIGRACIONES_QA_REBUILD_20260906.md` | `??` | EVIDENCIA FINAL VIGENTE | Conservar y versionar | **Commit 5** |
| `docs/EVIDENCIA_HIGIENE_Y_PLAN_CONSOLIDACION_GIT_20260906.md` | `??` | EVIDENCIA FINAL VIGENTE | Actualizar y versionar | **Commit 5** |

---

## 3. Informes Superados Eliminados de Forma Controlada

Conforme a la aprobación humana, se eliminaron los 6 informes de trabajo intermedio que fueron superados por las auditorías finales de cierre. Como eran archivos no versionados (`??`), se documentan sus hashes SHA-256 previos y sus tamaños exactos:

| Archivo Eliminado | Tamaño (Bytes) | SHA-256 Previo | Evidencia Final de Reemplazo |
| :--- | :---: | :--- | :--- |
| `docs/EVIDENCIA_CANONICA_QA_REBUILD_20260905.md` | 71,425 | `3B8B3618010C8503858B98DF690585F5621AC78617FD59BED741F9103311834B` | `EVIDENCIA_CIERRE_DEFINITIVO_CAPAS_1_2_3_QA_REBUILD_20260906.md` |
| `docs/EVIDENCIA_CAPAS_1_2_3_QA_REBUILD_20260905.md` | 29,531 | `B60BD5D7EEB2CF914D89FB85F4617821F64423329AF7770F7A1D466D85AAE7C6` | `EVIDENCIA_CIERRE_DEFINITIVO_CAPAS_1_2_3_QA_REBUILD_20260906.md` |
| `docs/EVIDENCIA_CAPAS_4_5_QA_REBUILD_20260906.md` | 30,841 | `C9463B48DCEF998A04FA11EAAE92F89AD2BB3ACBFB72D80A0B026956F7CBBDB1` | `EVIDENCIA_CORRECCION_00014_FUNCIONES_QA_REBUILD_20260906.md` |
| `docs/EVIDENCIA_CAPA_6_DATOS_DECLARATIVOS_QA_REBUILD_20260906.md` | 21,231 | `FE6B0B0ACDAE7624A903CF2140C2A81FDAF57836B8A4C0BAB0BCC910C679E28F` | `EVIDENCIA_CIERRE_CAPA_6_APL_QA_REBUILD_20260906.md` |
| `docs/EVIDENCIA_FINAL_CAPAS_1_2_3_QA_REBUILD_20260906.md` | 31,488 | `6CD5042C70BC9242E4502BAC6475FC138D5C3FD450A27589D1131C1FFABEE612` | `EVIDENCIA_CIERRE_DEFINITIVO_CAPAS_1_2_3_QA_REBUILD_20260906.md` |
| `docs/EVIDENCIA_FINAL_PRIVILEGIOS_QA_REBUILD_20260905.md` | 28,958 | `489A82A2834969664BF8886A8764042562D10314A6C8414B2B02B16C78174815` | `EVIDENCIA_RLS_GRANTS_QA_REBUILD_20260906.md` |

---

## 4. Congelamiento Estricto de la Línea Base de Migraciones (`00001–00014`)

Mediante la ratificación de la **Alternativa A**:
* Se regularizó el historial histórico (`000001`, `000002`, `000004`, `000011`) para asentar la base que demostró reconstruir REBUILD desde cero con paridad exacta respecto de QA.
* Se incorporaron `00012` y `00013` (aplicadas previamente en QA y REBUILD).
* Se incorporó `00014` (`20260905000014_converge_rebuild_to_qa.sql`), cuyo SHA-256 permanece invariante:
  ```text
  b688db479a05006c0339b835f16929f3db4fb21a9ce77a3df9564ed7dfad6853
  ```

> [!IMPORTANT]
> **REGLA DE INMUTABILIDAD:**  
> A partir del commit `e00bf9d`, **las migraciones 00001–00014 quedan formalmente CONGELADAS**.  
> Cualquier ajuste o desarrollo futuro se realizará pura y exclusivamente mediante una nueva migración incremental versionada (`00015+`). Queda estrictamente prohibido editar retroactivamente las migraciones 00001 a 00014.

---

## 5. Registro de Commits Locales Generados

| Commit | Hash Corto | Hash Completo | Mensaje de Commit | Cantidad Archivos | Verificaciones Ejecutadas |
| :---: | :---: | :--- | :--- | :---: | :--- |
| **1** | `e00bf9d` | `e00bf9db5c4a7297b3464cfe4ab922b6fcc658c5` | `fix(migrations): consolidar linea base reproducible 00001 a 00014` | 7 | Hashes SHA-256 verificados; `git diff --cached --stat` |
| **2** | `a2496ed` | `a2496ed6d62d535f3048713c8a57e5f65310d4f1` | `feat(edge-functions): actualizar extract-invoice a schema v2 y pdf nativo` | 1 | SHA-256 verificado (`7129a3035f...`); paridad con QA/REBUILD |
| **3** | `5657d92` | `5657d92ce82cd20c7bec6edb7662bc51227d4d42` | `feat(frontend): integrar intake multimodal y confirmacion atomica` | 9 | `npx tsc --noEmit` (0 err), `eslint .` (0 err), `vite build` (OK) |
| **4** | `69dea64` | `69dea64737084ed4e4f7eecf4a98f6fd4a0f73e3` | `test: versionar suites funcionales de ledger e ingesta` | 6 | `npx tsx test/unit_suite.ts` (74 PASS, 0 FAIL) |
| **5** | *Pendiente* | *Por generar* | `docs(audit): registrar linea base reproducible qa-rebuild` | 11 | Revisión de coherencia documental y trazabilidad |

---

## 6. Verificaciones de Calidad y Pruebas Ejecutadas

1. **Compilación TypeScript (`npx tsc --noEmit`):**
   * Resultado: **Cero errores** de tipos.
2. **Linter (`npm run lint`):**
   * Resultado: **Cero advertencias y cero errores**.
3. **Build de Producción (`npm run build`):**
   * Resultado: Compilación exitosa en 3.38s con Vite (`dist/index.html`, `dist/assets/*`).
4. **Tests Unitarios (`npx tsx test/unit_suite.ts`):**
   * Suite 1 (Fechas canónicas y calendario): 16 tests PASS.
   * Suite 2 (Validación CUIT Módulo 11): 5 tests PASS.
   * Suite 3 (Cálculo determinístico vencimiento): 4 tests PASS.
   * Suite 4 (Reconciliación y coexistencia v1/v2): 16 tests PASS.
   * Suite 5 (Clasificación SUCCESS / PARTIAL / FAILED): 22 tests PASS.
   * Suite 6 (Paridad contractual Edge Function vs Evaluador): 11 tests PASS.
   * **Total: 74 tests ejecutados — 74 PASS, 0 FAIL.**

---

## 7. Plan Seguro de Aplicación de `00014` en QA

### 7.1 Estado Actual de QA
* QA (`hdkfeonbmhxkagdrbdio`) tiene registradas las migraciones `00001` a `00013`.
* La migración `20260905000014_converge_rebuild_to_qa.sql` **continúa pendiente** de aplicación en QA.
* La migración fue verificada en auditorías previas mediante análisis estático y `dry-run`:
  * Detecta el entorno como `ESTADO_A`.
  * Realiza 15 validaciones estructurales de solo lectura.
  * Ejecuta un `RETURN` directo sin alterar datos ni esquema DDL.

### 7.2 Pasos para la Aplicación Futura (Siguiente Tarea)
Una vez completado el Commit 5 y con el repositorio en un estado 100% limpio:
1. Revalidar el comando Supabase CLI con `--help`:
   ```powershell
   supabase db push --help
   ```
2. Ejecutar un `dry-run` fresco contra QA:
   ```powershell
   supabase db push --project-ref hdkfeonbmhxkagdrbdio --dry-run
   ```
   *Debe confirmar que la única migración por aplicar es `00014`.*
3. Con autorización humana expresa, aplicar la migración:
   ```powershell
   supabase db push --project-ref hdkfeonbmhxkagdrbdio
   ```
4. Verificar que `supabase_migrations.schema_migrations` en QA registre las 14 versiones y que las funciones operativas permanezcan intactas.

---

## 8. Dictamen Final

```text
APTO PARA CONSOLIDAR Y FINALIZAR COMMIT 5
```

La línea base del proyecto queda debidamente regularizada, congelada, respaldada por evidencia forense exhaustiva y validada por 74 tests unitarios y build de producción.
