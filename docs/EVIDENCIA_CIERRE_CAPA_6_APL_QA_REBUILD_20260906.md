# Evidencia de Cierre de Capa 6: Convergencia de APL en Document Types — QA vs. REBUILD

**Fecha y hora:** 2026-09-06T14:35:00Z (Local: 2026-09-06T11:35:00-03:00)  
**Entornos evaluados:**
* **QA canónico:** `hdkfeonbmhxkagdrbdio`
* **REBUILD reconstruido:** `kbvhwizxpfkzrjxsulsk`
* **STAGING prohibido:** `zpvbhexucfvywtykqpvq` (**NO ACCEDIDO / NO CONSULTADO**)

---

## 1. Valores de `APL` Leídos Inicialmente en QA

Antes de realizar cualquier modificación sobre el archivo de migración `00014`, se consultó el catálogo de QA (`hdkfeonbmhxkagdrbdio`) mediante `SELECT` directo para confirmar los valores exactos y vigentes del tipo documental `code = 'APL'`:

```json
{
  "affects_account_balance": false,
  "balance_nature": "NEUTRAL",
  "can_be_source_application": true,
  "can_be_target_application": true,
  "code": "APL",
  "description": "Documento de transferencia de saldos preexistentes entre referencias (Suma Cero).",
  "is_system_internal": false,
  "name": "Aplicación de Saldos",
  "requires_due_date": false
}
```

* **`description` comprobada en QA:** `Documento de transferencia de saldos preexistentes entre referencias (Suma Cero).`
* **`can_be_source_application` comprobada en QA:** `true`
* **`can_be_target_application` comprobada en QA:** `true`

---

## 2. Fragmento Idempotente Incorporado en `00014`

En el archivo `supabase/migrations/20260905000014_converge_rebuild_to_qa.sql` se incorporaron los bloques necesarios dentro de la lógica idempotente:

### 2.1 Actualización Idempotente en `ESTADO_B` (Paso G0):
```sql
        -- Paso G0: Convergencia declarativa de tipos de comprobante (APL)
        UPDATE public.document_types
        SET
            description = 'Documento de transferencia de saldos preexistentes entre referencias (Suma Cero).',
            can_be_source_application = true,
            can_be_target_application = true
        WHERE code = 'APL'
          AND (
              description IS DISTINCT FROM 'Documento de transferencia de saldos preexistentes entre referencias (Suma Cero).'
              OR can_be_source_application IS DISTINCT FROM true
              OR can_be_target_application IS DISTINCT FROM true
          );
```

### 2.2 Validación en `ESTADO_A` (Regla 15) y Post-validación en `ESTADO_B`:
```sql
        SELECT count(*) INTO v_apl_valid
        FROM public.document_types
        WHERE code = 'APL'
          AND description = 'Documento de transferencia de saldos preexistentes entre referencias (Suma Cero).'
          AND can_be_source_application IS TRUE
          AND can_be_target_application IS TRUE;

        IF v_apl_valid <> 1 THEN
            RAISE EXCEPTION 'document_types APL no coincide con los atributos canónicos de QA.';
        END IF;
```

---

## 3. Hash SHA-256 Nuevo de la Migración `00014`

* **Archivo:** `supabase/migrations/20260905000014_converge_rebuild_to_qa.sql`
* **SHA-256 anterior:** `3ed43c7b3b3f1a44c147f59e8a58fa5edfd59b25ff15e64fad863b42c83bfb2b`
* **SHA-256 nuevo:** `b688db479a05006c0339b835f16929f3db4fb21a9ce77a3df9564ed7dfad6853`
* **Control de codificación:** UTF-8 limpio sin BOM, 0 patrones corruptos de Mojibake (`├`, `│`, `Ã`, `Â`, `\uFFFD`).

---

## 4. Resultado Completo de la Reconstrucción de REBUILD

* **Comando ejecutado:**
  ```bash
  supabase db reset --linked --no-seed --yes
  ```
* **Proyecto reconstruido:** `kbvhwizxpfkzrjxsulsk` (REBUILD).
* **Secuencia de migraciones ejecutada desde cero:**
  1. `20260824000001_initial_schema.sql` (OK)
  2. `20260824000002_seed_data.sql` (OK)
  3. `20260824000003_views_and_rpc.sql` (OK)
  4. `20260824000004_rls_and_security.sql` (OK)
  5. `20260824000005_aging_and_payment_projection.sql` (OK)
  6. `20260824000006_storage_bucket.sql` (OK)
  7. `20260824000007_document_intake_and_qr_sessions.sql` (OK)
  8. `20260824000008_sellers_and_analytics.sql` (OK)
  9. `20260824000009_fix_rls_sellers.sql` (OK)
  10. `20260824000010_document_seller_history_and_assignment.sql` (OK)
  11. `20260824000011_update_v_document_summary_and_ledger.sql` (OK)
  12. `20260904000012_atomic_ai_extraction_confirmation.sql` (OK)
  13. `20260904000013_enhance_extraction_audit_and_validation.sql` (OK)
  14. `20260905000014_converge_rebuild_to_qa.sql` (OK)
* **Salida y avisos de convergencia emitidos:**
  ```text
  NOTICE (00000): Deteccion preliminar: Forma general clasificada como candidato ESTADO_B
  NOTICE (00000): Iniciando transformacion desde ESTADO_B (REBUILD POST-00013) hacia ESTADO_A (QA CANONICO)...
  NOTICE (00000): Transformacion estructural hacia ESTADO_A completada exitosamente.
  ```
* **Código de salida:** `0` (Exitoso sin errores).

---

## 5. Valores Finales de las 12 Filas de `public.document_types`

Extracción fresca directa ejecutada sobre QA y REBUILD tras el reset:

| # | Código (`code`) | Nombre | Naturaleza | Afecta Saldo | Source App | Target App | Requiere Vto | Interno Sistema | Resultado |
| -: | --------------- | ------ | :--------: | :----------: | :--------: | :--------: | :----------: | :-------------: | :-------: |
| 1 | `AJUSTE_CREDITO` | Ajuste de Crédito / Reversión | CREDIT | true | true | false | false | false | **IDÉNTICO** |
| 2 | `AJUSTE_DEBITO` | Ajuste de Débito | DEBIT | true | false | true | false | false | **IDÉNTICO** |
| 3 | `ANTICIPO` | Anticipo a Proveedor | CREDIT | true | true | false | false | false | **IDÉNTICO** |
| 4 | `APL` | Aplicación de Saldos | NEUTRAL | false | true | true | false | false | **IDÉNTICO** |
| 5 | `DESIMPUTACION` | Documento de Desimputación | NEUTRAL | false | false | false | false | true | **IDÉNTICO** |
| 6 | `FACTURA` | Factura | DEBIT | true | false | true | true | false | **IDÉNTICO** |
| 7 | `NOTA_CREDITO` | Nota de Crédito | CREDIT | true | true | false | false | false | **IDÉNTICO** |
| 8 | `NOTA_DEBITO` | Nota de Débito | DEBIT | true | false | true | true | false | **IDÉNTICO** |
| 9 | `ORDEN_PAGO` | Orden de Pago | CREDIT | true | true | false | false | false | **IDÉNTICO** |
| 10 | `PROFORMA` | Factura Proforma / Presupuesto | NEUTRAL | false | false | false | false | false | **IDÉNTICO** |
| 11 | `RECIBO` | Recibo de Pago | CREDIT | true | true | false | false | false | **IDÉNTICO** |
| 12 | `RETENCION` | Certificado de Retención | CREDIT | true | true | false | false | false | **IDÉNTICO** |

### 5.1 Comprobación Específica del Registro `APL`:
* **`description` en QA:** `Documento de transferencia de saldos preexistentes entre referencias (Suma Cero).`
* **`description` en REBUILD:** `Documento de transferencia de saldos preexistentes entre referencias (Suma Cero).`
* **`can_be_source_application` en QA y REBUILD:** `true`
* **`can_be_target_application` en QA y REBUILD:** `true`
* **`affects_account_balance`:** `false`
* **`balance_nature`:** `NEUTRAL`
* **`requires_due_date`:** `false`
* **`is_system_internal`:** `false`

---

## 6. Hashes por Fila y del Conjunto Completo

Se calculó el hash SHA-256 canónico por cada fila y para el conjunto completo ordenado por clave funcional:

| Código | Hash SHA-256 QA | Hash SHA-256 REBUILD | Coincidencia Fila |
| ------ | --------------- | -------------------- | :----------------: |
| `AJUSTE_CREDITO` | `2c85527206b1508c5b7e6211650f8f9595c1c51184170c15a783a1c74e4a1789` | `2c85527206b1508c5b7e6211650f8f9595c1c51184170c15a783a1c74e4a1789` | **EXACTA** |
| `AJUSTE_DEBITO` | `b52d43a698fa15cfe4fea1a7b23df725a935f6bec404df58286ed9aac7e11756` | `b52d43a698fa15cfe4fea1a7b23df725a935f6bec404df58286ed9aac7e11756` | **EXACTA** |
| `ANTICIPO` | `f5a44f0e4ad94346dfcb4bf8c2250f40e5c5711acee9c2789d262c96c7775d3e` | `f5a44f0e4ad94346dfcb4bf8c2250f40e5c5711acee9c2789d262c96c7775d3e` | **EXACTA** |
| `APL` | `eaddcea6581e428d91c9c5b041cfa3799889c27f69fb76b6664d52043905a887` | `eaddcea6581e428d91c9c5b041cfa3799889c27f69fb76b6664d52043905a887` | **EXACTA** |
| `DESIMPUTACION` | `41078a226c98d0e751bbf2ec632b6abf32922fcda5fdea77baec7bc8bd784965` | `41078a226c98d0e751bbf2ec632b6abf32922fcda5fdea77baec7bc8bd784965` | **EXACTA** |
| `FACTURA` | `a03a43d1e1fd930dee125c6171b5c069b6e858056ebd932f6b3d1adade8166fc` | `a03a43d1e1fd930dee125c6171b5c069b6e858056ebd932f6b3d1adade8166fc` | **EXACTA** |
| `NOTA_CREDITO` | `a113fec83ad03425b862e7e3c60e964aff74f8d76cc5a890a1fd30f80e7e949c` | `a113fec83ad03425b862e7e3c60e964aff74f8d76cc5a890a1fd30f80e7e949c` | **EXACTA** |
| `NOTA_DEBITO` | `fdfdd7e2b6625d74a04f1d4de184096c550316896b8ec803476873ebc64e0a22` | `fdfdd7e2b6625d74a04f1d4de184096c550316896b8ec803476873ebc64e0a22` | **EXACTA** |
| `ORDEN_PAGO` | `805321f8899cc7fdf569a866cd80711c1e19a4014db7ee9a66ce73e89da9724b` | `805321f8899cc7fdf569a866cd80711c1e19a4014db7ee9a66ce73e89da9724b` | **EXACTA** |
| `PROFORMA` | `7a163dbb6a76ee7fee4afefa25c8f74547dbc2fbd5f03589662cbb6c9ff09fd2` | `7a163dbb6a76ee7fee4afefa25c8f74547dbc2fbd5f03589662cbb6c9ff09fd2` | **EXACTA** |
| `RECIBO` | `c2e2f8d1c6b73add4812f27cff121a9a71ddce2be91e7b0a9b447f10f9190086` | `c2e2f8d1c6b73add4812f27cff121a9a71ddce2be91e7b0a9b447f10f9190086` | **EXACTA** |
| `RETENCION` | `857ad91166ebf8edc5fe323385603a715639c4024ec72b1014820605dbb26215` | `857ad91166ebf8edc5fe323385603a715639c4024ec72b1014820605dbb26215` | **EXACTA** |

* **Hash Normalizado del Conjunto QA:**
  `b7bd12788ea089f00e8ae7a7f18d4308a11b965b2c354558b583338bfcbb2ffb`
* **Hash Normalizado del Conjunto REBUILD:**
  `b7bd12788ea089f00e8ae7a7f18d4308a11b965b2c354558b583338bfcbb2ffb`
* **Coincidencia de Hash de Conjunto:** **100% IDÉNTICA** (`true`).

---

## 7. Comparación Bidireccional (`EXCEPT`) y Diferencias

* **Total de filas en QA:** `12` (12 claves únicas).
* **Total de filas en REBUILD:** `12` (12 claves únicas).
* **Duplicados por clave funcional (`code`):** `0` en QA, `0` en REBUILD.
* **`QA EXCEPT REBUILD`:** `0 filas`.
* **`REBUILD EXCEPT QA`:** `0 filas`.
* **Cantidad exacta de diferencias detectadas:** **0 diferencias**.

---

## 8. Confirmación de Guardrails

1. **Inmutabilidad de migraciones históricas:** Verificado mediante `git diff --name-only`. Las migraciones `00001` a `00013` permanecen intactas e inmutables.
2. **Sin creación de `00015`:** Toda la convergencia se implementó estrictamente dentro de `00014`.
3. **QA no modificado:** Confirmado. En QA sólo se ejecutaron consultas `SELECT` de lectura. No se ejecutó DDL ni DML.
4. **STAGING no accedido:** Confirmado. El proyecto `zpvbhexucfvywtykqpvq` no fue vinculado ni consultado.
5. **Sin datos operativos en REBUILD:** El proyecto REBUILD contiene exclusivamente los datos generados por las migraciones `00001–00014`.

---

## 9. Estado de Git (`git status --short`)

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

## 10. Conclusión Técnica Obligatoria

```text
PARIDAD DE CAPA 6 COMPROBADA
```

El registro `public.document_types.code = 'APL'` ha convergido con exactitud en descripción y banderas booleanas (`can_be_source_application = true`, `can_be_target_application = true`), alcanzando una coincidencia matemática y funcional del 100% entre QA y REBUILD con paridad total en hashes de fila y hash de conjunto.