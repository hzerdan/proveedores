# Directrices de Desarrollo - León Proveedores

Este documento contiene las reglas de operación y arquitectura que todo asistente/agente debe seguir al trabajar en este repositorio.

---

## 1. Gestión de Base de Datos y Supabase

### A. Supabase CLI (Única vía para cambios estructurales y versionado)
- **Alcance:** Todo cambio estructural de base de datos (DDL) y lógica de servidor.
- **Herramienta:** `supabase` CLI (instalada vía Scoop en Windows).
- **Reglas obligatorias:**
  1. **Migraciones:** Cualquier modificación de esquema (`CREATE TABLE`, `ALTER TABLE`, `DROP TABLE`), funciones PostgreSQL, triggers y políticas RLS **DEBE** realizarse mediante un archivo de migración versionado en `supabase/migrations/` usando `supabase db migration new <nombre>`.
  2. **Prohibido DDL en caliente:** Jamás aplicar sentencias DDL directamente en producción o QA sin su respectivo archivo `.sql` en el repositorio.
  3. **Aplicación:** Aplicar migraciones con `supabase db push` asegurándose previamente del entorno enlazado (`supabase link`).
  4. **Edge Functions:** El desarrollo y despliegue de Edge Functions se realiza exclusivamente con `supabase functions deploy <nombre>`.
  5. **Tipos TypeScript:** Tras aplicar cambios de esquema, regenerar inmediatamente los tipos con `supabase gen types typescript --project-id <ref> > src/types/database.types.ts`.

### B. Supabase MCP (Herramienta de diagnóstico, observabilidad y datos de prueba)
- **Alcance:** Inspección en tiempo real, diagnóstico de incidentes y manipulación puntual de datos para pruebas.
- **Reglas de uso:**
  1. **Diagnóstico y Observabilidad:** Utilizar las herramientas MCP (`list_tables`, `execute_sql` con `SELECT`, `get_advisors`, `query_logs`) para entender el estado real de la base de datos, validar índices y revisar seguridad.
  2. **Datos de prueba (DML):** En entornos de desarrollo/staging está permitido usar MCP para insertar, actualizar o limpiar registros de prueba (`INSERT`, `UPDATE`, `DELETE`) con el fin de reproducir o verificar flujos.
  3. **PROHIBICIÓN ESTRICTA:** Queda terminantemente prohibido ejecutar sentencias DDL (`CREATE`, `ALTER`, `DROP`) a través de MCP `execute_sql`. Todo cambio de esquema debe pasar por Supabase CLI.

---

## 2. Entornos y Credenciales
- **Variables de Entorno:**
  - Archivo principal: `.env` (Producción / Local activo).
  - Archivo staging/QA: `.env.staging`.
- **Token de Acceso:** El `SUPABASE_ACCESS_TOKEN` en `.env` debe pertenecer a la cuenta administradora del proyecto (`hdkfeonbmhxkagdrbdio` para producción o `zpvbhexucfvywtykqpvq` para staging).
