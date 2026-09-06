# EVIDENCIA DE AUDITORÍA: REGISTRO DE APLICACIÓN DE MIGRACIÓN 00014 EN QA

**Fecha y hora UTC:** 2026-09-06 17:35:00 UTC  
**Proyecto Verificado:** `QA — hdkfeonbmhxkagdrbdio`  
**Rama:** `main`  
**Commit Base:** `99808fe8abd839bf9c7c0852b029c2cf61d34ccf` (`docs(audit): registrar linea base reproducible qa-rebuild`)  
**Versión de Supabase CLI:** `2.84.2` (Scoop)  

---

## 1. Identificación de la Migración `00014`

* **Nombre de Archivo:** `supabase/migrations/20260905000014_converge_rebuild_to_qa.sql`
* **Hash SHA-256 (Canónico/LF):** `b688db479a05006c0339b835f16929f3db4fb21a9ce77a3df9564ed7dfad6853`
* **Hash Git Blob (Object):** `01efd5c23ebe9f6214a69738adb5c741a9459f8d`
* **Estado en Git:** Invariable y congelado desde el commit `e00bf9d`.

---

## 2. Constancia de Aplicación Previa en QA

La migración `20260905000014_converge_rebuild_to_qa.sql` fue aplicada exitosamente en el entorno de QA mediante ejecución directa de `supabase db push --linked`.

El motor PL/pgSQL de la migración ejecutó la ruta `ESTADO_A`:
```text
NOTICE (00000): Deteccion preliminar: Forma general clasificada como candidato ESTADO_A
NOTICE (00000): Iniciando validacion exhaustiva de definiciones para ESTADO_A...
NOTICE (00000): CONFIRMACION ESTADO_A: Entorno 100% homologado con QA canonico. Cero modificaciones DDL/DML ejecutadas.
Finished supabase db push.
```

---

## 3. Verificación de Historial de Migraciones (`migration list`)

Ejecución fresca de `supabase migration list --linked`:

| Migración Local | Migración Remota (QA) | Time (UTC) | Estado |
| :--- | :--- | :--- | :---: |
| `20260824000001` | `20260824000001` | 2026-08-24 00:00:01 | APLICADA |
| `20260824000002` | `20260824000002` | 2026-08-24 00:00:02 | APLICADA |
| `20260824000003` | `20260824000003` | 2026-08-24 00:00:03 | APLICADA |
| `20260824000004` | `20260824000004` | 2026-08-24 00:00:04 | APLICADA |
| `20260824000005` | `20260824000005` | 2026-08-24 00:00:05 | APLICADA |
| `20260824000006` | `20260824000006` | 2026-08-24 00:00:06 | APLICADA |
| `20260824000007` | `20260824000007` | 2026-08-24 00:00:07 | APLICADA |
| `20260824000008` | `20260824000008` | 2026-08-24 00:00:08 | APLICADA |
| `20260824000009` | `20260824000009` | 2026-08-24 00:00:09 | APLICADA |
| `20260824000010` | `20260824000010` | 2026-08-24 00:00:10 | APLICADA |
| `20260824000011` | `20260824000011` | 2026-08-24 00:00:11 | APLICADA |
| `20260904000012` | `20260904000012` | 2026-09-04 00:00:12 | APLICADA |
| `20260904000013` | `20260904000013` | 2026-09-04 00:00:13 | APLICADA |
| `20260905000014` | `20260905000014` | 2026-09-05 00:00:14 | APLICADA |

El historial local y el historial remoto de QA se encuentran 100% sincronizados en 14 de 14 migraciones.

---

## 4. Verificación de `dry-run`

Ejecución de `supabase db push --linked --dry-run`:
```text
Connecting to remote database...
Remote database is up to date.
```
* **Resultado:** Ninguna migración pendiente de aplicar. Cero operaciones DDL o DML requeridas.

---

## 5. Declaraciones de Seguridad y Alcance

1. **No repetición de migraciones:** Esta tarea de registro no aplicó ni intentó volver a aplicar ninguna migración en ningún entorno.
2. **Entornos no alterados:** El entorno QA (`hdkfeonbmhxkagdrbdio`) permaneció estrictamente en modo de solo lectura durante esta verificación.
3. **Entornos fuera de alcance:** Los entornos REBUILD (`kbvhwizxpfkzrjxsulsk`) y STAGING (`zpvbhexucfvywtykqpvq`) no fueron consultados ni modificados.

---

## 6. Conclusión

```text
QA Y REPOSITORIO ALINEADOS EN MIGRACIONES 00001–00014
```
