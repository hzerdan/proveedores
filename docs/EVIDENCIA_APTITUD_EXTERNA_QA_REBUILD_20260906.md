# EVIDENCIA DE AUDITORÍA FINAL DE APTITUD EXTERNA — QA VS REBUILD

**Fecha y hora UTC:** 2026-09-06 16:15:00 UTC  
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

## 1. Verificación de Identidad de la Línea Base PostgreSQL (`00014`)

Antes de realizar cualquier consulta a los entornos, se comprobó la inmutabilidad y autenticidad del archivo de convergencia:

* **Ruta:** `supabase/migrations/20260905000014_converge_rebuild_to_qa.sql`
* **Tamaño:** `83,145` bytes
* **SHA-256 fresco:** `B688DB479A05006C0339B835F16929F3DB4FB21A9CE77A3DF9564ED7DFAD6853`
* **Antecedente:** `b688db479a05006c0339b835f16929f3db4fb21a9ce77a3df9564ed7dfad6853`
* **Coincidencia:** **EXACTA (100% IDÉNTICO)**. Línea base intacta.

---

## 2. Herramientas y Versiones Utilizadas

* **Supabase CLI:** `2.84.2` (Scoop)
* **Git:** `2.53.0.windows.1`
* **Python:** `3.12.7` (procesamiento de consultas y cálculos de solo lectura)
* **PowerShell:** `5.1.26100.2161`
* **Modo de auditoría:** Estrictamente solo lectura (`read-only`), sin mutaciones, sin llamadas a servicios pagos ni consumo de OpenAI.

---

## 3. Comandos de Solo Lectura Ejecutados (Sanitizados)

1. `git status --short; git branch --show-current; git rev-parse HEAD`
2. `powershell -Command "Get-FileHash -Algorithm SHA256 'supabase\migrations\20260905000014_converge_rebuild_to_qa.sql'"`
3. `supabase secrets list --project-ref hdkfeonbmhxkagdrbdio -o json` (procesado en memoria, extrayendo exclusivamente nombres de claves)
4. `supabase secrets list --project-ref kbvhwizxpfkzrjxsulsk -o json` (procesado en memoria, extrayendo exclusivamente nombres de claves)
5. `supabase db query --linked "SELECT id, name, public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'supplier-documents';"` sobre QA y REBUILD en carpetas temporales aisladas.
6. `supabase db query --linked "SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'storage' ORDER BY tablename, policyname;"` sobre QA y REBUILD.
7. `supabase db query --linked "SELECT (SELECT count(*) FROM auth.users)..."` sobre QA y REBUILD.
8. `supabase db query --linked "SELECT count(*) FROM auth.users WHERE confirmed_at IS NOT NULL;"` y `SELECT DISTINCT provider FROM auth.identities;` sobre QA.
9. `supabase sso list --project-ref <REF>` sobre QA y REBUILD.
10. `supabase db query --linked "SELECT (SELECT count(*) FROM public.suppliers)..."` sobre las 15 tablas operativas de REBUILD.

---

## 4. Parte A — Auditoría de Secretos y Variables de Edge Functions

Del análisis estático del código fuente de `supabase/functions/extract-invoice/index.ts` y de la consulta de nombres a través de `supabase secrets list --project-ref <REF>`:

| Variable | Requerimiento en código | QA (`hdkfeonbmhxkagdrbdio`) | REBUILD (`kbvhwizxpfkzrjxsulsk`) | Evaluación |
| :--- | :--- | :--- | :--- | :--- |
| `SUPABASE_URL` | Obligatoria funcionalmente (cliente admin) | **GESTIONADA POR SUPABASE** (Presente) | **GESTIONADA POR SUPABASE** (Presente) | Cobertura total por la plataforma. |
| `SUPABASE_SERVICE_ROLE_KEY` | Obligatoria funcionalmente (bypass RLS) | **GESTIONADA POR SUPABASE** (Presente) | **GESTIONADA POR SUPABASE** (Presente) | Cobertura total por la plataforma. |
| `OPENAI_API_KEY` | **Obligatoria** (throws error si falta) | **PRESENTE** (Secreto personalizado) | **AUSENTE** | **PENDIENTE DE CONFIGURACIÓN**. En REBUILD la función `extract-invoice` fallará con HTTP 500 si es invocada hasta que este secreto sea cargado. |
| `OPENAI_DOCUMENT_MODEL` | Opcional (fallback `"gpt-4o-mini"`) | **OPCIONAL AUSENTE** | **OPCIONAL AUSENTE** | Comportamiento idéntico en ambos entornos (toma fallback por defecto). |

### Variables de Plataforma Adicionales Observadas (Solo Nombres)
Ambos entornos cuentan además con las variables estándar gestionadas por Supabase:
* `SUPABASE_ANON_KEY`
* `SUPABASE_DB_URL`
* `SUPABASE_JWKS`
* `SUPABASE_PUBLISHABLE_KEYS`
* `SUPABASE_SECRET_KEYS`

*(Nota de seguridad: Ningún valor, digest ni prefijo fue extraído o expuesto).*

---

## 5. Parte B — Configuración Funcional de Auth

### 5.1 Distinción entre Configuración Declarativa Local y Configuración Remota
* **Configuración declarativa local (`supabase/config.toml`):**  
  Define parámetros teóricos de desarrollo local (`[auth] enable_signup = true`, `jwt_expiry = 3600`, `enable_confirmations = false`, `site_url = "http://127.0.0.1:3000"`).  
  *Esta configuración local no representa ni garantiza por sí misma el estado de los servicios remotos en Supabase Cloud.*
* **Configuración efectiva en proyectos remotos:**  
  La CLI de Supabase v2.84.2 no expone un comando de solo lectura `supabase auth config get` ni `supabase projects config`. A través de las consultas SQL de solo lectura sobre el catálogo de la base de datos remota (`auth.users`, `auth.identities`, `auth.sessions`, `auth.sso_providers`) y `supabase sso list`, se obtuvo evidencia concreta únicamente de los datos persistidos y proveedores registrados.

### 5.2 Matriz de Controles de Auth

| Control de Auth | Método de Consulta | QA (`hdkfeonbmhxkagdrbdio`) | REBUILD (`kbvhwizxpfkzrjxsulsk`) | Resultado | Nivel de Evidencia |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Total de usuarios (`auth.users`)** | `SELECT count(*) FROM auth.users;` | 3 usuarios | 0 usuarios | **DIFERENCIA LEGÍTIMA POR ENTORNO** (REBUILD limpio) | **HECHO COMPROBADO** |
| **Total de identidades (`auth.identities`)** | `SELECT count(*) FROM auth.identities;` | 3 identidades | 0 identidades | **DIFERENCIA LEGÍTIMA POR ENTORNO** (REBUILD limpio) | **HECHO COMPROBADO** |
| **Total de sesiones activas (`auth.sessions`)** | `SELECT count(*) FROM auth.sessions;` | 0 sesiones | 0 sesiones | **PARIDAD COMPROBADA** (Sin sesiones activas) | **HECHO COMPROBADO** |
| **Proveedor Email / Password** | `SELECT DISTINCT provider FROM auth.identities;` | Activo (proveedor `email` registrado en las 3 identidades) | 0 identidades registradas (servicio base listo) | **PARIDAD COMPROBADA** (en arquitectura) | **HECHO COMPROBADO EN QA / INFERENCIA EN REBUILD** |
| **Proveedores SSO / SAML** | `supabase sso list --project-ref <REF>` | 0 proveedores configurados | 0 proveedores configurados | **PARIDAD COMPROBADA** | **HECHO COMPROBADO** |
| **Confirmación de Email (`email_confirmed_at`)** | `SELECT count(confirmed_at) FROM auth.users;` | 3 usuarios confirmados al 100% | Sin usuarios para evaluar | **NO DETERMINABLE POR AUSENCIA DE USUARIOS** | **HECHO COMPROBADO EN QA / N/A EN REBUILD** |
| **Políticas de Registro (`enable_signup`)** | No expuesto por CLI/API de solo lectura | Configurado en nube | Configurado en nube | **NO VERIFICABLE REMOTAMENTE** | **LIMITACIÓN DE HERRAMIENTA** (Requiere verificación en Dashboard antes de prod) |
| **Expiración de Tokens JWT** | No expuesto por CLI/API de solo lectura | Configurado en nube | Configurado en nube | **NO VERIFICABLE REMOTAMENTE** | **LIMITACIÓN DE HERRAMIENTA** (Requiere verificación en Dashboard antes de prod) |
| **Site URL / Redirect URLs** | No expuesto por CLI/API de solo lectura | Dominio nube QA | Dominio nube REBUILD | **NO VERIFICABLE REMOTAMENTE** | **LIMITACIÓN DE HERRAMIENTA** (Debe configurarse formalmente para el dominio de producción) |

*(Nota de seguridad: No se inspeccionaron ni listaron correos electrónicos, nombres ni UUIDs de personas).*

---

## 6. Parte C — Configuración Externa y Políticas de Storage

A partir de consultas frescas y directas a `storage.buckets` y `pg_policies`:

### 6.1 Atributos Declarativos de `storage.buckets` (`supplier-documents`)
* **`id` / `name`:** `supplier-documents`
* **`public`:** `false` (bucket privado en ambos entornos).
* **`file_size_limit`:** exactamente **`20,971,520` bytes**, lo que equivale exactamente a:
  $$\frac{20{,}971{,}520\text{ bytes}}{1{,}048{,}576\text{ bytes/MiB}} = \mathbf{20\text{ MiB}}$$
  *(Nota técnica: 20 MiB equivale a 21.99 MB decimales; la cifra anterior de "50MB" provino de una confusión con el default genérico de `supabase/config.toml` en la sección local `[storage] file_size_limit = "50MiB"`, y no del valor efectivo de la base de datos).*
* **`allowed_mime_types`:** `{'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/tiff'}` (idéntico en ambos entornos).
* **Resultado del bucket:** **PARIDAD COMPROBADA (100% IDÉNTICO)** entre QA y REBUILD.

### 6.2 Políticas de Seguridad RLS en Storage (`pg_policies`)
Al consultar exhaustivamente `pg_policies` en el esquema `storage`, existen exactamente **3 políticas** sobre la tabla `storage.objects` (y 0 políticas en `storage.buckets`):

| # | Nombre de la Política | Comando (`cmd`) | Roles Asignados | Expresión `USING` (`qual`) | Expresión `WITH CHECK` | QA | REBUILD |
| -: | :--- | :---: | :--- | :--- | :--- | :---: | :---: |
| 1 | `supplier_docs_insert` | **INSERT** | `{anon,authenticated}` | *(null)* | `(bucket_id = 'supplier-documents'::text)` | **PRESENTE** | **PRESENTE** |
| 2 | `supplier_docs_select` | **SELECT** | `{anon,authenticated}` | `(bucket_id = 'supplier-documents'::text)` | *(null)* | **PRESENTE** | **PRESENTE** |
| 3 | `supplier_docs_update` | **UPDATE** | `{anon,authenticated}` | `(bucket_id = 'supplier-documents'::text)` | `(bucket_id = 'supplier-documents'::text)` | **PRESENTE** | **PRESENTE** |

* **Comandos cubiertos:** `INSERT`, `SELECT`, `UPDATE`.  
* **Comando `DELETE`:** **No posee política** en ninguno de los dos entornos (la supresión de objetos físicos está prohibida o reservada a `service_role`).
* **Origen de la divergencia en el informe anterior:** El informe previo citó "4 políticas" por inferir incorrectamente la existencia de las 4 operaciones CRUD (`SELECT`, `INSERT`, `UPDATE`, `DELETE`), cuando la migración `20260824000007_document_intake_and_qr_sessions.sql` (líneas 313–327) define únicamente 3 políticas explícitas (`supplier_docs_insert`, `supplier_docs_select`, `supplier_docs_update`).
* **Resultado de políticas:** **PARIDAD COMPROBADA (100% IDÉNTICO)**.

### 6.3 Objetos Físicos Almacenados
* **QA (`hdkfeonbmhxkagdrbdio`):** **7 objetos físicos** (archivos de prueba cargados durante el desarrollo).
* **REBUILD (`kbvhwizxpfkzrjxsulsk`):** **0 objetos físicos**. Entorno completamente limpio.

---

## 7. Parte D — Inventario de Datos y Residuos no Promovibles

Se ejecutó un barrido completo sobre las tablas operativas de **REBUILD** (`kbvhwizxpfkzrjxsulsk`) para verificar si existían residuos operacionales que impidieran considerarlo una base limpia:

| Categoría / Tabla | Conteo en REBUILD | Conteo en QA | Clasificación | Observación |
| :--- | :---: | :---: | :--- | :--- |
| **Usuarios de Auth (`auth.users`)** | **0** | 3 | **ENTORNO LIMPIO EN ESTA CATEGORÍA** | Sin usuarios de prueba. |
| **Perfiles vinculados (`public.profiles`)** | **0** | 3 | **ENTORNO LIMPIO EN ESTA CATEGORÍA** | Sin perfiles de prueba. |
| **Roles de usuario (`public.user_roles`)** | **0** | 3 | **ENTORNO LIMPIO EN ESTA CATEGORÍA** | Sin asignaciones de roles residuales. |
| **Proveedores (`public.suppliers`)** | **0** | 6 | **ENTORNO LIMPIO EN ESTA CATEGORÍA** | Sin proveedores ficticios de prueba. |
| **Contactos (`public.supplier_contacts`)** | **0** | 1 | **ENTORNO LIMPIO EN ESTA CATEGORÍA** | Limpio. |
| **Vendedores (`public.sellers`)** | **0** | 2 | **ENTORNO LIMPIO EN ESTA CATEGORÍA** | Sin vendedores de prueba. |
| **Relaciones (`public.supplier_sellers`)** | **0** | 4 | **ENTORNO LIMPIO EN ESTA CATEGORÍA** | Limpio. |
| **Comprobantes (`public.documents`)** | **0** | 61 | **ENTORNO LIMPIO EN ESTA CATEGORÍA** | Sin facturas ni notas de crédito de prueba. |
| **Ledger (`public.account_movements`)** | **0** | 73 | **ENTORNO LIMPIO EN ESTA CATEGORÍA** | Sin movimientos contables residuales. |
| **Metadatos de archivos (`public.document_files`)** | **0** | 7 | **ENTORNO LIMPIO EN ESTA CATEGORÍA** | Limpio. |
| **Objetos binarios (`storage.objects`)** | **0** | 7 | **ENTORNO LIMPIO EN ESTA CATEGORÍA** | Sin archivos físicos PDF/imágenes en storage. |
| **Extracciones IA (`public.document_ai_extractions`)**| **0** | 10 | **ENTORNO LIMPIO EN ESTA CATEGORÍA** | Sin telemetría ni payloads de IA de prueba. |
| **Sesiones móviles QR (`document_upload_sessions`)** | **0** | 16 | **ENTORNO LIMPIO EN ESTA CATEGORÍA** | Sin tokens ni sesiones QR vencidas. |
| **Historial vendedores (`document_seller_history`)** | **0** | 9 | **ENTORNO LIMPIO EN ESTA CATEGORÍA** | Limpio. |
| **Logs de duplicados (`duplicate_override_logs`)** | **0** | 1 | **ENTORNO LIMPIO EN ESTA CATEGORÍA** | Limpio. |
| **Tablas archivadas (`_bak_application_reversals`)** | **0** | 1 | **ENTORNO LIMPIO EN ESTA CATEGORÍA** | Estructura presente pero 0 filas. |
| **Tablas archivadas (`_bak_document_applications`)** | **0** | 5 | **ENTORNO LIMPIO EN ESTA CATEGORÍA** | Estructura presente pero 0 filas. |
| **Semillas declarativas (`document_types`, etc.)** | **Preservadas** | Preservadas | **SEMILLA DECLARATIVA ESPERADA** | 12 tipos doc, 3 roles, 18 permisos, 44 relaciones. |

**Conclusión de Limpieza:** En todas las categorías transaccionales y operativas evaluadas, REBUILD no contiene filas ni archivos residuales provenientes de pruebas en QA.

---

## 8. Diferencias Legítimas Propias del Entorno

1. **Número de versión de Edge Function (`version: 1` en REBUILD vs `version: 10` en QA):**  
   Diferencia histórica de despliegue, no de configuración ni de código.
2. **Ausencia de datos transaccionales en REBUILD:**  
   QA contiene el historial de pruebas previas; REBUILD fue inicializado únicamente con las migraciones.
3. **Ausencia de usuarios en Auth en REBUILD:**  
   Los usuarios de Auth se crean por invocación al servicio de autenticación y no mediante migraciones DDL.
4. **Project References y URLs asociadas:**  
   `hdkfeonbmhxkagdrbdio` (QA) vs `kbvhwizxpfkzrjxsulsk` (REBUILD).

---

## 9. Hallazgos Clasificados por Materialidad

### 1. Bloqueantes (para operación inmediata de IA)
* Ninguno a nivel estructural de base de datos.
* A nivel funcional de Edge Functions: La ausencia de `OPENAI_API_KEY` en los secretos de REBUILD impedirá el uso del servicio de extracción asistida si se intenta invocar `extract-invoice`.

### 2. Previos a Puesta en Producción
* **Carga de Secreto `OPENAI_API_KEY`:** Debe aprovisionarse el secreto en Supabase antes de habilitar la extracción de comprobantes para usuarios reales.
* **Aprovisionamiento del Administrador Inicial:** Al estar Auth vacío en REBUILD, debe registrarse el usuario inicial mediante el procedimiento administrativo correspondiente y asignarle el rol en `profiles`/`user_roles`.
* **Configuración Remota de Auth:** Validar y configurar formalmente en Supabase Cloud las directivas de Auth (`Site URL`, `Redirect URLs`, registro de usuarios y expiración de sesiones) para el dominio definitivo de producción.
* **Higiene y Consolidación del Repositorio Git:** Llevar a cabo la tarea planificada de consolidación del repositorio respecto al estado del commit `HEAD`.

### 3. Deuda Técnica
* **Procedimiento Reproducible de Edge Functions:** El despliegue de Edge Functions depende del valor predeterminado implícito de la CLI para `verify_jwt = true`. Conviene establecer un procedimiento explícito y formalizado (declarativo en `config.toml` o script de despliegue controlado).

### 4. Informativos
* Contador incremental de versión de función diferente (v1 vs v10), sin impacto técnico.

---

## 10. Matriz de Aptitud Técnica, Limpieza y Reproducibilidad

| Dimensión | Evaluación | Justificación Fáctica |
| :--- | :---: | :--- |
| **A. Aptitud técnica actual** | **APTO CON PENDIENTES NO BLOQUEANTES** | El esquema PostgreSQL, RLS, vistas, funciones, triggers, bucket de Storage y código descargado de Edge Function son idénticos a QA. La pieza faltante para paridad operativa de IA es la carga del secreto `OPENAI_API_KEY`. |
| **B. Limpieza para futura producción** | **APTO** | El entorno REBUILD no contiene registros transaccionales ni archivos de prueba residuales en ninguna de las tablas y buckets examinados. |
| **C.1 Reproducibilidad PostgreSQL** | **APTO** | El esquema de base de datos fue reconstruido exitosamente desde cero ejecutando las migraciones `00001` a `00014` en secuencia limpia con código de salida `0`. |
| **C.2 Reproducibilidad de Componentes Externos** | **APTO CON PENDIENTES NO BLOQUEANTES** | El código fuente de la función está disponible localmente e idéntico al desplegado, pero el comando exacto de despliegue no está formalizado en un script versionado, `verify_jwt = true` se basa en un default implícito, el secreto `OPENAI_API_KEY` no ha sido inyectado en REBUILD y ciertas directivas de Auth de Supabase Cloud no son configurables vía migraciones. |
| **C.3 Reproducibilidad Global** | **APTO CON PENDIENTES NO BLOQUEANTES** | La base de datos es plenamente reproducible por código; los componentes externos requieren completar la formalización de su procedimiento de despliegue y aprovisionamiento. |

---

## 11. Dictamen Global

```text
REBUILD APTO CON ACCIONES PREVIAS A PRODUCCIÓN
```

**Fundamentación:**  
REBUILD (`kbvhwizxpfkzrjxsulsk`) constituye una base técnica sólida, reproducible en su capa de datos y libre de residuos transaccionales para ser considerada candidata a producción. Sin embargo, no puede habilitarse productivamente de forma inmediata: requiere ejecutar previamente las configuraciones externas indispensables detalladas en la Sección 12.

---

## 12. Lista Concreta de Acciones Necesarias Antes de Producción

1. **Secretos:** Configurar el secreto `OPENAI_API_KEY` en el proyecto mediante `supabase secrets set OPENAI_API_KEY=...`.
2. **Aprovisionamiento Inicial de Usuario:** Dar de alta el usuario administrador inicial siguiendo el procedimiento seguro y autoritativo que se defina para el sistema.
3. **Configuración de Auth en Supabase Cloud:** Establecer `Site URL` y `Redirect URLs` con el dominio productivo oficial y verificar las políticas de registro y confirmación en el panel de control.
4. **Formalización de Despliegue de Funciones:** Estandarizar el procedimiento de despliegue de Edge Functions para garantizar explícitamente `verify_jwt = true`.
5. **Consolidación del Repositorio:** Realizar la auditoría de higiene e integridad histórica de Git sobre las migraciones y código fuente.

---

## 13. Declaraciones Expresas de Guardrails

1. **QA y REBUILD no fueron modificados:** Ningún comando de escritura, alteración, reset o mutación fue ejecutado durante esta auditoría.
2. **STAGING no fue consultado:** El proyecto STAGING (`zpvbhexucfvywtykqpvq`) no fue vinculado, leído ni accedido en ningún momento.
3. **No se mostraron valores de secretos:** Se auditó exclusivamente la existencia nominal de variables y secretos sin exponer valores, hashes ni tokens.
4. **No se invocaron Edge Functions ni servicios pagos:** No se realizaron pruebas funcionales que consumieran créditos de la API de OpenAI.

---

## 14. Estado Final del Repositorio (`git status --short`)

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
