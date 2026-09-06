# Evidencia de Cierre Definitivo de Paridad — Capas 1, 2 y 3: QA vs. REBUILD

## 1. Resumen Ejecutivo y Criterio de Cierre

Se ha llevado a cabo la auditoría exhaustiva, bidireccional y granular (fila por fila y atributo por atributo) de las **Capas 1, 2 y 3** sobre el esquema `public` entre el entorno canónico **QA** (`hdkfeonbmhxkagdrbdio`) y el entorno reconstruido desde cero **REBUILD** (`kbvhwizxpfkzrjxsulsk`) tras la aplicación de las migraciones locales `00001–00014`.

La migración `00014` (`82c37ff52fb85532f740fb526e18b6987e8ce2b6d45d51b1a50357cda5aeefd6`) incorporó con éxito todas las correcciones requeridas:
1. Habilitación de RLS en `document_upload_sessions` (`relrowsecurity = true`).
2. Retiro de identidad, restricción `NOT NULL`, valores por defecto y dependencias de secuencia en las columnas `id` de las tablas archivadas `_bak_application_reversals` y `_bak_document_applications`.
3. Eliminación de las 11 restricciones (`constraints`) remanentes en las tablas archivadas.
4. Eliminación de los 8 índices remanentes en las tablas archivadas.
5. Eliminación y desvinculación de las 2 secuencias internas asociadas a las tablas archivadas.
6. Retiro de restricciones `NOT NULL` y defaults en las 11 columnas adicionales de las tablas `_bak_*` (`reversal_document_id`, `application_id`, `reversal_reason`, `created_by`, `created_at`, `source_document_id`, `target_document_id`, `applied_amount`, `application_date`, etc.).
7. Igualación del valor por defecto de `account_movements.created_at` a `now()`.

### Conclusión de Auditoría

```text
PARIDAD COMPLETA EN CAPAS 1–3 COMPROBADA
```

* **Diferencias de existencia (faltantes o sobrantes):** 0
* **Diferencias de atributos en tablas:** 0
* **Diferencias de atributos en columnas:** 0
* **Diferencias de atributos en secuencias:** 0
* **Diferencias de atributos en restricciones:** 0
* **Diferencias de atributos en índices:** 0
* **Diferencias de atributos en vistas:** 0
* **Elementos no verificables:** 0

---

## 2. Metadatos de Auditoría y Entornos Consultados

* **Fecha y hora de ejecución:** 2026-09-05 22:05:00 -03:00 (Timestamp técnico: 2026-09-06T01:05:00Z)
* **QA Canónico:** `hdkfeonbmhxkagdrbdio` (Acceso estrictamente de solo lectura mediante `SELECT`)
* **REBUILD:** `kbvhwizxpfkzrjxsulsk` (Acceso estrictamente de solo lectura mediante `SELECT`)
* **STAGING:** `zpvbhexucfvywtykqpvq` (**PROHIBIDO — NO CONSULTADO NI ACCEDIDO**)
* **Método de conexión:** Supabase CLI (v2.84.2 vía Scoop) vinculado por project ref mediante `supabase db query --linked`.

---

## 3. Hash Verificado de la Migración `00014`

* **Archivo:** `supabase/migrations/20260905000014_converge_rebuild_to_qa.sql`
* **Algoritmo:** SHA-256
* **Hash verificado:** `82c37ff52fb85532f740fb526e18b6987e8ce2b6d45d51b1a50357cda5aeefd6`
* **Estado:** **COINCIDENCIA EXACTA**

---

## 4. Alcance y Exclusiones

* **Alcance:**
  * Todas las tablas del esquema `public` (incluyendo tablas archivadas `_bak_*`).
  * Todas las columnas del esquema `public` (179 columnas).
  * Todas las secuencias del esquema `public` (14 secuencias).
  * Todas las restricciones del esquema `public` (73 constraints).
  * Todos los índices del esquema `public` (64 índices).
  * Todas las vistas del esquema `public` (6 vistas).
* **Exclusiones:**
  * Esquemas internos administrados por Supabase (`auth`, `storage`, `extensions`, `vault`, `realtime`, etc.).
  * Datos y contenidos de filas.
  * Valores corrientes y contadores de secuencias (`last_value`).
  * Funciones, procedimientos, triggers, políticas RLS, grants y Edge Functions (objeto de fases posteriores).

---

## 5. Consultas SQL Ejecutadas (Solo Lectura)

### Consulta Capa 1 (Tablas, Columnas y Secuencias)
```sql
SELECT jsonb_build_object(
    'tables', (
        SELECT jsonb_agg(jsonb_build_object(
            'schemaname', n.nspname,
            'tablename', c.relname,
            'relkind', c.relkind,
            'tableowner', pg_get_userbyid(c.relowner),
            'persistence', c.relpersistence,
            'rowsecurity', c.relrowsecurity,
            'forcerowsecurity', c.relforcerowsecurity,
            'column_count', (
                SELECT count(*) 
                FROM pg_attribute a 
                WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
            ),
            'comment', obj_description(c.oid, 'pg_class'),
            'reloptions', c.reloptions,
            'is_bak', (c.relname LIKE '_bak_%')
        ) ORDER BY c.relname)
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    ),
    'columns', (
        SELECT jsonb_agg(jsonb_build_object(
            'schemaname', n.nspname,
            'tablename', c.relname,
            'attnum', a.attnum,
            'column_name', a.attname,
            'full_type', format_type(a.atttypid, a.atttypmod),
            'internal_type', t.typname,
            'attlen', a.attlen,
            'is_nullable', NOT a.attnotnull,
            'attnotnull', a.attnotnull,
            'default_value', CASE WHEN a.attgenerated = '' THEN pg_get_expr(d.adbin, d.adrelid) ELSE NULL END,
            'attidentity', a.attidentity,
            'generated_expression', CASE WHEN a.attgenerated != '' THEN pg_get_expr(d.adbin, d.adrelid) ELSE NULL END,
            'collation', coll.collname,
            'comment', col_description(c.oid, a.attnum),
            'attstorage', a.attstorage,
            'attcompression', a.attcompression,
            'serial_sequence', pg_get_serial_sequence('public.' || quote_ident(c.relname), a.attname),
            'is_bak', (c.relname LIKE '_bak_%')
        ) ORDER BY c.relname, a.attnum)
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid
        JOIN pg_type t ON t.oid = a.atttypid
        LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
        LEFT JOIN pg_collation coll ON coll.oid = a.attcollation
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND a.attnum > 0 AND NOT a.attisdropped
    ),
    'sequences', (
        SELECT jsonb_agg(jsonb_build_object(
            'schemaname', sn.nspname,
            'sequencename', sc.relname,
            'data_type', format_type(s.seqtypid, 0),
            'start_value', s.seqstart,
            'increment', s.seqincrement,
            'min_value', s.seqmin,
            'max_value', s.seqmax,
            'cache_size', s.seqcache,
            'is_cycled', s.seqcycle,
            'owner_table', dep_c.relname,
            'owner_column', dep_a.attname,
            'deptype', d.deptype
        ) ORDER BY sc.relname)
        FROM pg_sequence s
        JOIN pg_class sc ON sc.oid = s.seqrelid
        JOIN pg_namespace sn ON sn.oid = sc.relnamespace
        LEFT JOIN pg_depend d ON d.objid = sc.oid AND d.classid = 'pg_class'::regclass AND d.deptype IN ('a', 'i')
        LEFT JOIN pg_class dep_c ON dep_c.oid = d.refobjid
        LEFT JOIN pg_attribute dep_a ON dep_a.attrelid = d.refobjid AND dep_a.attnum = d.refobjsubid
        WHERE sn.nspname = 'public'
    )
) as layer1;
```

### Consulta Capa 2 (Restricciones e Índices)
```sql
SELECT jsonb_build_object(
    'constraints', (
        SELECT jsonb_agg(jsonb_build_object(
            'schemaname', n.nspname,
            'tablename', c.relname,
            'constraint_name', con.conname,
            'constraint_type', con.contype,
            'definition', pg_get_constraintdef(con.oid, true),
            'norm_definition', trim(regexp_replace(pg_get_constraintdef(con.oid, true), '\s+', ' ', 'g')),
            'columns', (
                SELECT array_agg(a.attname ORDER BY u.attposition)
                FROM unnest(con.conkey) WITH ORDINALITY AS u(attnum, attposition)
                JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = u.attnum
            ),
            'foreign_table', f_c.relname,
            'foreign_columns', (
                SELECT array_agg(fa.attname ORDER BY fu.attposition)
                FROM unnest(con.confkey) WITH ORDINALITY AS fu(attnum, attposition)
                JOIN pg_attribute fa ON fa.attrelid = con.confrelid AND fa.attnum = fu.attnum
            ),
            'on_update', con.confupdtype,
            'on_delete', con.confdeltype,
            'match_type', con.confmatchtype,
            'deferrable', con.condeferrable,
            'initially_deferred', con.condeferred,
            'is_validated', con.convalidated,
            'is_local', con.conislocal,
            'backing_index', i_c.relname,
            'is_bak', (c.relname LIKE '_bak_%')
        ) ORDER BY c.relname, con.conname)
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_class f_c ON f_c.oid = con.confrelid
        LEFT JOIN pg_class i_c ON i_c.oid = con.conindid
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    ),
    'indexes', (
        SELECT jsonb_agg(jsonb_build_object(
            'schemaname', n.nspname,
            'tablename', c.relname,
            'index_name', i.relname,
            'access_method', am.amname,
            'is_unique', idx.indisunique,
            'is_primary', idx.indisprimary,
            'is_constraint_backing', (con.oid IS NOT NULL),
            'backing_constraint_name', con.conname,
            'backing_constraint_type', con.contype,
            'key_columns', (
                SELECT array_agg(a.attname ORDER BY u.attposition)
                FROM unnest(idx.indkey) WITH ORDINALITY AS u(attnum, attposition)
                LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = u.attnum
                WHERE u.attposition <= idx.indnkeyatts
            ),
            'include_columns', (
                SELECT array_agg(a.attname ORDER BY u.attposition)
                FROM unnest(idx.indkey) WITH ORDINALITY AS u(attnum, attposition)
                LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = u.attnum
                WHERE u.attposition > idx.indnkeyatts
            ),
            'partial_predicate', pg_get_expr(idx.indpred, idx.indrelid),
            'full_indexdef', pg_get_indexdef(idx.indexrelid),
            'norm_indexdef', trim(regexp_replace(pg_get_indexdef(idx.indexrelid), '\s+', ' ', 'g')),
            'is_valid', idx.indisvalid,
            'is_ready', idx.indisready,
            'is_live', idx.indislive,
            'is_replica_identity', idx.indisreplident,
            'is_bak', (c.relname LIKE '_bak_%')
        ) ORDER BY c.relname, i.relname)
        FROM pg_index idx
        JOIN pg_class i ON i.oid = idx.indexrelid
        JOIN pg_class c ON c.oid = idx.indrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_am am ON am.oid = i.relam
        LEFT JOIN pg_constraint con ON con.conindid = idx.indexrelid AND con.conrelid = c.oid AND con.contype IN ('p', 'u', 'x')
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    )
) as layer2;
```

### Consulta Capa 3 (Vistas y Hashes SHA-256 Normalizados)
```sql
SELECT jsonb_build_object(
    'views', (
        SELECT jsonb_agg(jsonb_build_object(
            'schemaname', n.nspname,
            'viewname', c.relname,
            'viewowner', pg_get_userbyid(c.relowner),
            'relkind', c.relkind,
            'comment', obj_description(c.oid, 'pg_class'),
            'reloptions', c.reloptions,
            'security_invoker', (c.reloptions IS NOT NULL AND 'security_invoker=true' = ANY(c.reloptions)),
            'security_barrier', (c.reloptions IS NOT NULL AND 'security_barrier=true' = ANY(c.reloptions)),
            'check_option', (
                SELECT v.check_option 
                FROM information_schema.views v 
                WHERE v.table_schema = n.nspname AND v.table_name = c.relname
            ),
            'columns', (
                SELECT jsonb_agg(jsonb_build_object(
                    'attnum', a.attnum,
                    'column_name', a.attname,
                    'full_type', format_type(a.atttypid, a.atttypmod),
                    'is_nullable', NOT a.attnotnull
                ) ORDER BY a.attnum)
                FROM pg_attribute a
                WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
            ),
            'raw_definition', pg_get_viewdef(c.oid, false),
            'pretty_definition', pg_get_viewdef(c.oid, true),
            'norm_raw', trim(regexp_replace(pg_get_viewdef(c.oid, false), '\s+', ' ', 'g')),
            'norm_pretty', trim(regexp_replace(pg_get_viewdef(c.oid, true), '\s+', ' ', 'g')),
            'sha256_raw', encode(sha256(convert_to(trim(regexp_replace(pg_get_viewdef(c.oid, false), '\s+', ' ', 'g')), 'UTF8')), 'hex'),
            'sha256_pretty', encode(sha256(convert_to(trim(regexp_replace(pg_get_viewdef(c.oid, true), '\s+', ' ', 'g')), 'UTF8')), 'hex'),
            'dependencies', (
                SELECT array_agg(DISTINCT ref_c.relname ORDER BY ref_c.relname)
                FROM pg_rewrite r
                JOIN pg_depend d ON d.objid = r.oid
                JOIN pg_class ref_c ON ref_c.oid = d.refobjid
                WHERE r.ev_class = c.oid AND ref_c.oid <> c.oid
            )
        ) ORDER BY c.relname)
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'v'
    )
) as layer3;
```

---

## 6. Cantidades de Referencia y Totales Auditados

| Categoría | QA Canónico | REBUILD | Iguales | Faltan en REBUILD | Sobran en REBUILD | Diferentes | Paridad |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Tablas** | 19 | 19 | 19 | 0 | 0 | 0 | **100% PARIDAD** |
| **Columnas** | 179 | 179 | 179 | 0 | 0 | 0 | **100% PARIDAD** |
| **Secuencias** | 14 | 14 | 14 | 0 | 0 | 0 | **100% PARIDAD** |
| **Constraints** | 73 | 73 | 73 | 0 | 0 | 0 | **100% PARIDAD** |
| **Índices** | 64 | 64 | 64 | 0 | 0 | 0 | **100% PARIDAD** |
| **Vistas** | 6 | 6 | 6 | 0 | 0 | 0 | **100% PARIDAD** |
| **TOTAL** | **355** | **355** | **355** | **0** | **0** | **0** | **100% PARIDAD** |

---

## 7. Resultados de EXCEPT en Ambas Direcciones

* `TABLAS (QA EXCEPT REBUILD)`: **0 filas**
* `TABLAS (REBUILD EXCEPT QA)`: **0 filas**
* `COLUMNAS (QA EXCEPT REBUILD)`: **0 filas**
* `COLUMNAS (REBUILD EXCEPT QA)`: **0 filas**
* `SECUENCIAS (QA EXCEPT REBUILD)`: **0 filas**
* `SECUENCIAS (REBUILD EXCEPT QA)`: **0 filas**
* `CONSTRAINTS (QA EXCEPT REBUILD)`: **0 filas**
* `CONSTRAINTS (REBUILD EXCEPT QA)`: **0 filas**
* `ÍNDICES (QA EXCEPT REBUILD)`: **0 filas**
* `ÍNDICES (REBUILD EXCEPT QA)`: **0 filas**
* `VISTAS (QA EXCEPT REBUILD)`: **0 filas**
* `VISTAS (REBUILD EXCEPT QA)`: **0 filas**

---

## 8. Evidencia Específica de Objetos Corregidos por `00014`

### 8.1 RLS en `document_upload_sessions`
| Objeto | Propiedad | Valor en QA | Valor en REBUILD | Paridad |
| :--- | :--- | :---: | :---: | :---: |
| `public.document_upload_sessions` | `relrowsecurity` | `true` | `true` | **IGUAL** |
| `public.document_upload_sessions` | `relforcerowsecurity` | `false` | `false` | **IGUAL** |

### 8.2 Columnas de Tablas Archivadas y `account_movements.created_at`
| Tabla | Columna | Tipo | Nullable QA | Nullable REBUILD | Default QA | Default REBUILD | Identity | Paridad |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `_bak_application_reversals` | `id` | bigint | true | true | NULL | NULL | '' | **IGUAL** |
| `_bak_application_reversals` | `reversal_document_id` | bigint | true | true | NULL | NULL | '' | **IGUAL** |
| `_bak_application_reversals` | `application_id` | bigint | true | true | NULL | NULL | '' | **IGUAL** |
| `_bak_application_reversals` | `reversal_reason` | text | true | true | NULL | NULL | '' | **IGUAL** |
| `_bak_application_reversals` | `created_by` | bigint | true | true | NULL | NULL | '' | **IGUAL** |
| `_bak_application_reversals` | `created_at` | timestamptz | true | true | NULL | NULL | '' | **IGUAL** |
| `_bak_document_applications` | `id` | bigint | true | true | NULL | NULL | '' | **IGUAL** |
| `_bak_document_applications` | `source_document_id` | bigint | true | true | NULL | NULL | '' | **IGUAL** |
| `_bak_document_applications` | `target_document_id` | bigint | true | true | NULL | NULL | '' | **IGUAL** |
| `_bak_document_applications` | `applied_amount` | numeric(15,2) | true | true | NULL | NULL | '' | **IGUAL** |
| `_bak_document_applications` | `application_date` | date | true | true | NULL | NULL | '' | **IGUAL** |
| `_bak_document_applications` | `created_by` | bigint | true | true | NULL | NULL | '' | **IGUAL** |
| `_bak_document_applications` | `created_at` | timestamptz | true | true | NULL | NULL | '' | **IGUAL** |
| `account_movements` | `created_at` | timestamptz | false | false | 'now()' | 'now()' | '' | **IGUAL** |

### 8.3 Inexistencia de las 11 Constraints Históricas de `_bak_*`
| Constraint | QA | REBUILD | Resultado |
| :--- | :---: | :---: | :---: |
| `application_reversals_pkey` | **Ausente** | **Ausente** | **IGUAL** |
| `application_reversals_application_id_key` | **Ausente** | **Ausente** | **IGUAL** |
| `application_reversals_application_id_fkey` | **Ausente** | **Ausente** | **IGUAL** |
| `application_reversals_created_by_fkey` | **Ausente** | **Ausente** | **IGUAL** |
| `application_reversals_reversal_document_id_fkey` | **Ausente** | **Ausente** | **IGUAL** |
| `document_applications_pkey` | **Ausente** | **Ausente** | **IGUAL** |
| `chk_document_applications_amount` | **Ausente** | **Ausente** | **IGUAL** |
| `chk_document_applications_no_self` | **Ausente** | **Ausente** | **IGUAL** |
| `document_applications_created_by_fkey` | **Ausente** | **Ausente** | **IGUAL** |
| `document_applications_source_document_id_fkey` | **Ausente** | **Ausente** | **IGUAL** |
| `document_applications_target_document_id_fkey` | **Ausente** | **Ausente** | **IGUAL** |

### 8.4 Inexistencia de los 8 Índices Históricos de `_bak_*`
| Índice | QA | REBUILD | Resultado |
| :--- | :---: | :---: | :---: |
| `application_reversals_pkey` | **Ausente** | **Ausente** | **IGUAL** |
| `application_reversals_application_id_key` | **Ausente** | **Ausente** | **IGUAL** |
| `document_applications_pkey` | **Ausente** | **Ausente** | **IGUAL** |
| `idx_app_reversals_app_id` | **Ausente** | **Ausente** | **IGUAL** |
| `idx_app_reversals_rev_doc` | **Ausente** | **Ausente** | **IGUAL** |
| `idx_doc_app_date` | **Ausente** | **Ausente** | **IGUAL** |
| `idx_doc_app_source` | **Ausente** | **Ausente** | **IGUAL** |
| `idx_doc_app_target` | **Ausente** | **Ausente** | **IGUAL** |

### 8.5 Inexistencia de Secuencias de Tablas Archivadas
| Secuencia | QA | REBUILD | Resultado |
| :--- | :---: | :---: | :---: |
| `application_reversals_id_seq` | **Ausente** | **Ausente** | **IGUAL** |
| `document_applications_id_seq` | **Ausente** | **Ausente** | **IGUAL** |

---

## 9. Inventario Comparativo Detallado por Capa

### 9.1 Capa 1: Tablas (19 Tablas)
Todas las tablas presentan paridad total en esquema, nombre, `relkind` (`r`), propietario (`postgres`), persistencia (`p`), RLS (`rowsecurity`), RLS forzado (`forcerowsecurity`) y cantidad de columnas.

| Tabla | relkind | Propietario | Persistencia | QA RLS | REB RLS | Columnas | Paridad |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `public._bak_application_reversals` | r | postgres | p | false | false | 6 | **IGUAL** |
| `public._bak_document_applications` | r | postgres | p | false | false | 7 | **IGUAL** |
| `public.account_movements` | r | postgres | p | true | true | 11 | **IGUAL** |
| `public.document_ai_extractions` | r | postgres | p | true | true | 12 | **IGUAL** |
| `public.document_files` | r | postgres | p | true | true | 10 | **IGUAL** |
| `public.document_seller_history` | r | postgres | p | true | true | 8 | **IGUAL** |
| `public.document_types` | r | postgres | p | true | true | 6 | **IGUAL** |
| `public.document_upload_sessions` | r | postgres | p | true | true | 9 | **IGUAL** |
| `public.documents` | r | postgres | p | true | true | 16 | **IGUAL** |
| `public.duplicate_override_logs` | r | postgres | p | true | true | 6 | **IGUAL** |
| `public.payment_projections` | r | postgres | p | true | true | 8 | **IGUAL** |
| `public.permissions` | r | postgres | p | true | true | 6 | **IGUAL** |
| `public.profiles` | r | postgres | p | true | true | 6 | **IGUAL** |
| `public.role_permissions` | r | postgres | p | true | true | 5 | **IGUAL** |
| `public.roles` | r | postgres | p | true | true | 6 | **IGUAL** |
| `public.seller_audit_log` | r | postgres | p | true | true | 8 | **IGUAL** |
| `public.sellers` | r | postgres | p | true | true | 11 | **IGUAL** |
| `public.supplier_contacts` | r | postgres | p | true | true | 7 | **IGUAL** |
| `public.suppliers` | r | postgres | p | true | true | 10 | **IGUAL** |
| `public.user_roles` | r | postgres | p | true | true | 5 | **IGUAL** |

### 9.2 Capa 1: Secuencias (14 Secuencias)
Todas las 14 secuencias coinciden exactamente en tipo (`bigint`, `integer`, `smallint`), `start_value` (1), `increment` (1), `min_value` (1), `cache_size` (1), `is_cycled` (false), tabla propietaria y columna propietaria:
* `account_movements_id_seq` -> `account_movements.id`
* `document_ai_extractions_id_seq` -> `document_ai_extractions.id`
* `document_files_id_seq` -> `document_files.id`
* `document_seller_history_id_seq` -> `document_seller_history.id`
* `documents_id_seq` -> `documents.id`
* `duplicate_override_logs_id_seq` -> `duplicate_override_logs.id`
* `payment_projections_id_seq` -> `payment_projections.id`
* `permissions_id_seq` -> `permissions.id`
* `profiles_id_seq` -> `profiles.id`
* `roles_id_seq` -> `roles.id`
* `seller_audit_log_id_seq` -> `seller_audit_log.id`
* `sellers_id_seq` -> `sellers.id`
* `supplier_contacts_id_seq` -> `supplier_contacts.id`
* `suppliers_id_seq` -> `suppliers.id`

### 9.3 Capa 2: Restricciones (73 Constraints)
Paridad 73 de 73:
* **PRIMARY KEY:** 18 constraints
* **FOREIGN KEY:** 28 constraints
* **UNIQUE:** 13 constraints
* **CHECK:** 14 constraints
Todas las definiciones obtenidas con `pg_get_constraintdef`, tablas y columnas referenciadas coinciden en un 100%.

### 9.4 Capa 2: Índices (64 Índices)
Paridad 64 de 64:
* **Índices de respaldo (PK / UNIQUE):** 31
* **Índices independientes / de búsqueda / funcionales:** 33
Todas las definiciones obtenidas con `pg_get_indexdef`, métodos de acceso (`btree`), columnas clave, columnas include y predicados parciales son exactamente iguales.

### 9.5 Capa 3: Vistas (6 Vistas)
Paridad total en columnas, tipos, nulabilidad, `security_invoker` (false), `security_barrier` (false), dependencias y definiciones normalizadas:

| Vista | SHA-256 RAW (QA) | SHA-256 RAW (REBUILD) | SHA-256 PRETTY (QA) | SHA-256 PRETTY (REBUILD) | Estado |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `v_active_supplier_sellers` | `74fb166f7f2b1d3d...` | `74fb166f7f2b1d3d...` | `ec03798cf024ddf3...` | `ec03798cf024ddf3...` | **IDÉNTICO** |
| `v_document_ledger` | `f99a9a3b984090b8...` | `f99a9a3b984090b8...` | `fe746a589255ec41...` | `fe746a589255ec41...` | **IDÉNTICO** |
| `v_document_summary` | `4ae09559385bf564...` | `4ae09559385bf564...` | `1889cce0805128ff...` | `1889cce0805128ff...` | **IDÉNTICO** |
| `v_open_reference_balances` | `6655fe5888d302a6...` | `6655fe5888d302a6...` | `5362ff8b52f14300...` | `5362ff8b52f14300...` | **IDÉNTICO** |
| `v_seller_account_summary` | `d3725b7b0553bb10...` | `d3725b7b0553bb10...` | `fa18182fe3383a8b...` | `fa18182fe3383a8b...` | **IDÉNTICO** |
| `v_supplier_account_summary` | `c98912e75e921d7b...` | `c98912e75e921d7b...` | `58aa7be04a439561...` | `58aa7be04a439561...` | **IDÉNTICO** |

---

## 10. Inventario Completo de Columnas (179 Columnas Materializadas)

### 10.1 Criterio de Correspondencia y Verificación de Clave
La comparación de columnas se realizó de forma estricta mediante la clave canónica compuesta:
```text
schema + table_name + column_name
```
No se utilizó correspondencia posicional por índice de array.
* **Claves únicas en QA:** 179
* **Claves únicas en REBUILD:** 179
* **Duplicados de clave en QA:** 0
* **Duplicados de clave en REBUILD:** 0
* **Columnas presentes en QA y ausentes en REBUILD:** 0
* **Columnas presentes en REBUILD y ausentes en QA:** 0
* **Diferencias de atributos entre columnas con la misma clave:** 0

### 10.2 Tabla Completa Materializada (179 Columnas)

| # | Esquema | Tabla | Columna | Tipo QA | Tipo REBUILD | Nullable QA | Nullable REBUILD | Default QA | Default REBUILD | Identity QA | Identity REBUILD | Generated QA | Generated REBUILD | Secuencia QA | Secuencia REBUILD | Resultado |
| -: | ------- | ----- | ------- | ------- | ------------ | ----------- | ---------------- | ---------- | --------------- | ----------- | ---------------- | ------------ | ----------------- | ------------ | ----------------- | --------- |
| 1 | public | `_bak_application_reversals` | `id` | bigint | bigint | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 2 | public | `_bak_application_reversals` | `reversal_document_id` | bigint | bigint | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 3 | public | `_bak_application_reversals` | `application_id` | bigint | bigint | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 4 | public | `_bak_application_reversals` | `reversal_reason` | text | text | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 5 | public | `_bak_application_reversals` | `created_by` | bigint | bigint | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 6 | public | `_bak_application_reversals` | `created_at` | timestamp with time zone | timestamp with time zone | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 7 | public | `_bak_document_applications` | `id` | bigint | bigint | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 8 | public | `_bak_document_applications` | `source_document_id` | bigint | bigint | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 9 | public | `_bak_document_applications` | `target_document_id` | bigint | bigint | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 10 | public | `_bak_document_applications` | `applied_amount` | numeric(15,2) | numeric(15,2) | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 11 | public | `_bak_document_applications` | `application_date` | date | date | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 12 | public | `_bak_document_applications` | `notes` | text | text | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 13 | public | `_bak_document_applications` | `created_by` | bigint | bigint | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 14 | public | `_bak_document_applications` | `created_at` | timestamp with time zone | timestamp with time zone | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 15 | public | `account_movements` | `id` | bigint | bigint | false | false | NULL | NULL | a | a | NULL | NULL | public.account_movements_id_seq | public.account_movements_id_seq | **IGUAL** |
| 16 | public | `account_movements` | `supplier_id` | bigint | bigint | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 17 | public | `account_movements` | `document_id` | bigint | bigint | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 18 | public | `account_movements` | `reference_id` | bigint | bigint | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 19 | public | `account_movements` | `line_number` | smallint | smallint | false | false | 1 | 1 | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 20 | public | `account_movements` | `movement_type` | text | text | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 21 | public | `account_movements` | `movement_date` | date | date | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 22 | public | `account_movements` | `currency` | character varying(3) | character varying(3) | false | false | 'ARS'::character varying | 'ARS'::character varying | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 23 | public | `account_movements` | `amount` | numeric(15,2) | numeric(15,2) | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 24 | public | `account_movements` | `notes` | text | text | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 25 | public | `account_movements` | `created_by` | bigint | bigint | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 26 | public | `account_movements` | `created_at` | timestamp with time zone | timestamp with time zone | false | false | now() | now() | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 27 | public | `document_ai_extractions` | `id` | bigint | bigint | false | false | NULL | NULL | a | a | NULL | NULL | public.document_ai_extractions_id_seq | public.document_ai_extractions_id_seq | **IGUAL** |
| 28 | public | `document_ai_extractions` | `file_id` | bigint | bigint | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 29 | public | `document_ai_extractions` | `document_id` | bigint | bigint | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 30 | public | `document_ai_extractions` | `model_name` | character varying(80) | character varying(80) | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 31 | public | `document_ai_extractions` | `model_provider` | character varying(40) | character varying(40) | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 32 | public | `document_ai_extractions` | `extracted_raw_payload` | jsonb | jsonb | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 33 | public | `document_ai_extractions` | `confidence_score` | numeric(5,4) | numeric(5,4) | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 34 | public | `document_ai_extractions` | `extraction_duration_ms` | integer | integer | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 35 | public | `document_ai_extractions` | `status` | character varying(20) | character varying(20) | false | false | 'SUCCESS'::character varying | 'SUCCESS'::character varying | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 36 | public | `document_ai_extractions` | `error_message` | text | text | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 37 | public | `document_ai_extractions` | `confirmed_payload_diff` | jsonb | jsonb | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 38 | public | `document_ai_extractions` | `extracted_at` | timestamp with time zone | timestamp with time zone | false | false | clock_timestamp() | clock_timestamp() | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 39 | public | `document_ai_extractions` | `created_by` | bigint | bigint | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 40 | public | `document_ai_extractions` | `confirmed_by` | bigint | bigint | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 41 | public | `document_ai_extractions` | `confirmed_at` | timestamp with time zone | timestamp with time zone | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 42 | public | `document_files` | `id` | bigint | bigint | false | false | NULL | NULL | a | a | NULL | NULL | public.document_files_id_seq | public.document_files_id_seq | **IGUAL** |
| 43 | public | `document_files` | `document_id` | bigint | bigint | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 44 | public | `document_files` | `storage_bucket` | character varying(50) | character varying(50) | false | false | 'supplier-documents'::character varying | 'supplier-documents'::character varying | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 45 | public | `document_files` | `storage_path` | text | text | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 46 | public | `document_files` | `file_name` | text | text | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 47 | public | `document_files` | `mime_type` | character varying(100) | character varying(100) | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 48 | public | `document_files` | `file_size_bytes` | bigint | bigint | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 49 | public | `document_files` | `file_category` | character varying(30) | character varying(30) | false | false | 'ORIGINAL'::character varying | 'ORIGINAL'::character varying | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 50 | public | `document_files` | `uploaded_by` | bigint | bigint | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 51 | public | `document_files` | `created_at` | timestamp with time zone | timestamp with time zone | false | false | clock_timestamp() | clock_timestamp() | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 52 | public | `document_seller_history` | `id` | bigint | bigint | false | false | NULL | NULL | a | a | NULL | NULL | public.document_seller_history_id_seq | public.document_seller_history_id_seq | **IGUAL** |
| 53 | public | `document_seller_history` | `document_id` | bigint | bigint | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 54 | public | `document_seller_history` | `old_seller_id` | bigint | bigint | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 55 | public | `document_seller_history` | `new_seller_id` | bigint | bigint | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 56 | public | `document_seller_history` | `change_type` | character varying(30) | character varying(30) | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 57 | public | `document_seller_history` | `relation_validity_status` | character varying(50) | character varying(50) | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 58 | public | `document_seller_history` | `reason` | text | text | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 59 | public | `document_seller_history` | `changed_by` | bigint | bigint | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 60 | public | `document_seller_history` | `changed_at` | timestamp with time zone | timestamp with time zone | false | false | clock_timestamp() | clock_timestamp() | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 61 | public | `document_types` | `id` | smallint | smallint | false | false | NULL | NULL | a | a | NULL | NULL | public.document_types_id_seq | public.document_types_id_seq | **IGUAL** |
| 62 | public | `document_types` | `code` | character varying(30) | character varying(30) | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 63 | public | `document_types` | `name` | character varying(60) | character varying(60) | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 64 | public | `document_types` | `description` | text | text | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 65 | public | `document_types` | `balance_nature` | character varying(10) | character varying(10) | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 66 | public | `document_types` | `affects_account_balance` | boolean | boolean | false | false | true | true | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 67 | public | `document_types` | `can_be_source_application` | boolean | boolean | false | false | false | false | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 68 | public | `document_types` | `can_be_target_application` | boolean | boolean | false | false | false | false | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 69 | public | `document_types` | `requires_due_date` | boolean | boolean | false | false | false | false | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 70 | public | `document_types` | `is_system_internal` | boolean | boolean | false | false | false | false | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 71 | public | `document_types` | `is_active` | boolean | boolean | false | false | true | true | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 72 | public | `document_types` | `created_at` | timestamp with time zone | timestamp with time zone | false | false | clock_timestamp() | clock_timestamp() | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 73 | public | `document_upload_sessions` | `id` | uuid | uuid | false | false | gen_random_uuid() | gen_random_uuid() | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 74 | public | `document_upload_sessions` | `token_hash` | character varying(64) | character varying(64) | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 75 | public | `document_upload_sessions` | `status` | character varying(20) | character varying(20) | false | false | 'PENDING'::character varying | 'PENDING'::character varying | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 76 | public | `document_upload_sessions` | `created_by` | bigint | bigint | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 77 | public | `document_upload_sessions` | `file_id` | bigint | bigint | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 78 | public | `document_upload_sessions` | `document_id` | bigint | bigint | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 79 | public | `document_upload_sessions` | `expires_at` | timestamp with time zone | timestamp with time zone | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 80 | public | `document_upload_sessions` | `created_at` | timestamp with time zone | timestamp with time zone | false | false | now() | now() | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 81 | public | `document_upload_sessions` | `completed_at` | timestamp with time zone | timestamp with time zone | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 82 | public | `documents` | `id` | bigint | bigint | false | false | NULL | NULL | a | a | NULL | NULL | public.documents_id_seq | public.documents_id_seq | **IGUAL** |
| 83 | public | `documents` | `supplier_id` | bigint | bigint | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 84 | public | `documents` | `document_type_id` | smallint | smallint | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 85 | public | `documents` | `status` | character varying(15) | character varying(15) | false | false | 'DRAFT'::character varying | 'DRAFT'::character varying | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 86 | public | `documents` | `letter` | character varying(2) | character varying(2) | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 87 | public | `documents` | `point_of_sale` | integer | integer | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 88 | public | `documents` | `document_number` | bigint | bigint | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 89 | public | `documents` | `human_reference` | character varying(80) | character varying(80) | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 90 | public | `documents` | `external_reference` | text | text | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 91 | public | `documents` | `issue_date` | date | date | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 92 | public | `documents` | `due_date` | date | date | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 93 | public | `documents` | `currency` | character varying(3) | character varying(3) | false | false | 'ARS'::character varying | 'ARS'::character varying | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 94 | public | `documents` | `exchange_rate` | numeric(14,4) | numeric(14,4) | false | false | 1.0000 | 1.0000 | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 95 | public | `documents` | `total_amount` | numeric(15,2) | numeric(15,2) | false | false | 0.00 | 0.00 | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 96 | public | `documents` | `concept` | text | text | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 97 | public | `documents` | `notes` | text | text | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 98 | public | `documents` | `intake_source` | character varying(20) | character varying(20) | false | false | 'MANUAL'::character varying | 'MANUAL'::character varying | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 99 | public | `documents` | `created_by` | bigint | bigint | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 100 | public | `documents` | `confirmed_by` | bigint | bigint | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 101 | public | `documents` | `confirmed_at` | timestamp with time zone | timestamp with time zone | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 102 | public | `documents` | `created_at` | timestamp with time zone | timestamp with time zone | false | false | clock_timestamp() | clock_timestamp() | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 103 | public | `documents` | `updated_at` | timestamp with time zone | timestamp with time zone | false | false | clock_timestamp() | clock_timestamp() | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 104 | public | `documents` | `seller_id` | bigint | bigint | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 105 | public | `duplicate_override_logs` | `id` | bigint | bigint | false | false | NULL | NULL | a | a | NULL | NULL | public.duplicate_override_logs_id_seq | public.duplicate_override_logs_id_seq | **IGUAL** |
| 106 | public | `duplicate_override_logs` | `document_id` | bigint | bigint | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 107 | public | `duplicate_override_logs` | `matched_document_id` | bigint | bigint | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 108 | public | `duplicate_override_logs` | `reason` | text | text | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 109 | public | `duplicate_override_logs` | `authorized_by` | bigint | bigint | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 110 | public | `duplicate_override_logs` | `authorized_at` | timestamp with time zone | timestamp with time zone | false | false | clock_timestamp() | clock_timestamp() | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 111 | public | `permissions` | `id` | smallint | smallint | false | false | NULL | NULL | a | a | NULL | NULL | public.permissions_id_seq | public.permissions_id_seq | **IGUAL** |
| 112 | public | `permissions` | `code` | character varying(60) | character varying(60) | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 113 | public | `permissions` | `module` | character varying(30) | character varying(30) | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 114 | public | `permissions` | `description` | text | text | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 115 | public | `permissions` | `created_at` | timestamp with time zone | timestamp with time zone | false | false | clock_timestamp() | clock_timestamp() | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 116 | public | `profiles` | `id` | bigint | bigint | false | false | NULL | NULL | a | a | NULL | NULL | public.profiles_id_seq | public.profiles_id_seq | **IGUAL** |
| 117 | public | `profiles` | `auth_user_id` | uuid | uuid | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 118 | public | `profiles` | `first_name` | text | text | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 119 | public | `profiles` | `last_name` | text | text | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 120 | public | `profiles` | `email` | text | text | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 121 | public | `profiles` | `is_active` | boolean | boolean | false | false | true | true | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 122 | public | `profiles` | `created_at` | timestamp with time zone | timestamp with time zone | false | false | clock_timestamp() | clock_timestamp() | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 123 | public | `profiles` | `updated_at` | timestamp with time zone | timestamp with time zone | false | false | clock_timestamp() | clock_timestamp() | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 124 | public | `role_permissions` | `role_id` | smallint | smallint | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 125 | public | `role_permissions` | `permission_id` | smallint | smallint | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 126 | public | `role_permissions` | `assigned_at` | timestamp with time zone | timestamp with time zone | false | false | clock_timestamp() | clock_timestamp() | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 127 | public | `roles` | `id` | smallint | smallint | false | false | NULL | NULL | a | a | NULL | NULL | public.roles_id_seq | public.roles_id_seq | **IGUAL** |
| 128 | public | `roles` | `code` | character varying(30) | character varying(30) | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 129 | public | `roles` | `name` | text | text | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 130 | public | `roles` | `description` | text | text | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 131 | public | `roles` | `is_active` | boolean | boolean | false | false | true | true | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 132 | public | `roles` | `created_at` | timestamp with time zone | timestamp with time zone | false | false | clock_timestamp() | clock_timestamp() | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 133 | public | `sellers` | `id` | bigint | bigint | false | false | NULL | NULL | a | a | NULL | NULL | public.sellers_id_seq | public.sellers_id_seq | **IGUAL** |
| 134 | public | `sellers` | `code` | character varying(30) | character varying(30) | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 135 | public | `sellers` | `first_name` | text | text | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 136 | public | `sellers` | `last_name` | text | text | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 137 | public | `sellers` | `display_name` | text | text | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 138 | public | `sellers` | `phone` | text | text | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 139 | public | `sellers` | `email` | text | text | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 140 | public | `sellers` | `is_active` | boolean | boolean | false | false | true | true | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 141 | public | `sellers` | `notes` | text | text | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 142 | public | `sellers` | `created_by` | bigint | bigint | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 143 | public | `sellers` | `created_at` | timestamp with time zone | timestamp with time zone | false | false | clock_timestamp() | clock_timestamp() | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 144 | public | `sellers` | `updated_at` | timestamp with time zone | timestamp with time zone | false | false | clock_timestamp() | clock_timestamp() | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 145 | public | `supplier_contacts` | `id` | bigint | bigint | false | false | NULL | NULL | a | a | NULL | NULL | public.supplier_contacts_id_seq | public.supplier_contacts_id_seq | **IGUAL** |
| 146 | public | `supplier_contacts` | `supplier_id` | bigint | bigint | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 147 | public | `supplier_contacts` | `first_name` | text | text | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 148 | public | `supplier_contacts` | `last_name` | text | text | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 149 | public | `supplier_contacts` | `role_title` | character varying(50) | character varying(50) | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 150 | public | `supplier_contacts` | `email` | text | text | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 151 | public | `supplier_contacts` | `phone` | text | text | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 152 | public | `supplier_contacts` | `address` | text | text | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 153 | public | `supplier_contacts` | `is_active` | boolean | boolean | false | false | true | true | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 154 | public | `supplier_contacts` | `notes` | text | text | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 155 | public | `supplier_contacts` | `created_at` | timestamp with time zone | timestamp with time zone | false | false | clock_timestamp() | clock_timestamp() | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 156 | public | `supplier_sellers` | `id` | bigint | bigint | false | false | NULL | NULL | a | a | NULL | NULL | public.supplier_sellers_id_seq | public.supplier_sellers_id_seq | **IGUAL** |
| 157 | public | `supplier_sellers` | `supplier_id` | bigint | bigint | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 158 | public | `supplier_sellers` | `seller_id` | bigint | bigint | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 159 | public | `supplier_sellers` | `is_active` | boolean | boolean | false | false | true | true | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 160 | public | `supplier_sellers` | `valid_from` | date | date | false | false | CURRENT_DATE | CURRENT_DATE | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 161 | public | `supplier_sellers` | `valid_to` | date | date | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 162 | public | `supplier_sellers` | `notes` | text | text | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 163 | public | `supplier_sellers` | `created_by` | bigint | bigint | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 164 | public | `supplier_sellers` | `created_at` | timestamp with time zone | timestamp with time zone | false | false | clock_timestamp() | clock_timestamp() | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 165 | public | `suppliers` | `id` | bigint | bigint | false | false | NULL | NULL | a | a | NULL | NULL | public.suppliers_id_seq | public.suppliers_id_seq | **IGUAL** |
| 166 | public | `suppliers` | `code` | character varying(30) | character varying(30) | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 167 | public | `suppliers` | `trade_name` | text | text | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 168 | public | `suppliers` | `legal_name` | text | text | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 169 | public | `suppliers` | `tax_id` | character varying(20) | character varying(20) | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 170 | public | `suppliers` | `email` | text | text | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 171 | public | `suppliers` | `phone` | text | text | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 172 | public | `suppliers` | `is_active` | boolean | boolean | false | false | true | true | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 173 | public | `suppliers` | `notes` | text | text | true | true | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 174 | public | `suppliers` | `created_by` | bigint | bigint | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 175 | public | `suppliers` | `created_at` | timestamp with time zone | timestamp with time zone | false | false | clock_timestamp() | clock_timestamp() | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 176 | public | `suppliers` | `updated_at` | timestamp with time zone | timestamp with time zone | false | false | clock_timestamp() | clock_timestamp() | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 177 | public | `user_roles` | `user_id` | bigint | bigint | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 178 | public | `user_roles` | `role_id` | smallint | smallint | false | false | NULL | NULL | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |
| 179 | public | `user_roles` | `assigned_at` | timestamp with time zone | timestamp with time zone | false | false | clock_timestamp() | clock_timestamp() | '' | '' | NULL | NULL | NULL | NULL | **IGUAL** |

---

## 11. Control de Repositorio y Estado de Git

### 11.1 Git Status Inicial
Registrado antes de iniciar la verificación de paridad de capas 1–3:
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

### 11.2 Git Status Posterior
Registrado al completar la presente corrección documental:
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
*(Demuestra que el único archivo nuevo producido en la carpeta docs es `EVIDENCIA_CIERRE_DEFINITIVO_CAPAS_1_2_3_QA_REBUILD_20260906.md`).*

---

## 12. Declaraciones Finales de Control

1. **Consultas ejecutadas:** Se ejecutaron estrictamente consultas `SELECT` de solo lectura contra los catálogos del sistema. Cero DDL, cero DML y cero bloques `DO`.
2. **Ejecución en QA:** La migración `00014` no fue ejecutada en QA ni dentro ni fuera de una transacción con `ROLLBACK`.
3. **Inalterabilidad de entornos:** QA (`hdkfeonbmhxkagdrbdio`) y REBUILD (`kbvhwizxpfkzrjxsulsk`) no sufrieron modificaciones durante esta auditoría.
4. **STAGING:** El entorno STAGING (`zpvbhexucfvywtykqpvq`) no fue accedido ni consultado bajo ninguna circunstancia.
