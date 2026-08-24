# Módulo de Cuentas Corrientes de Proveedores
### Documentación y Arquitectura del Sistema

Este repositorio contiene la arquitectura, modelo de base de datos, backend y frontend para la gestión operativa y trazable de cuentas corrientes de proveedores con Supabase, PostgreSQL y extracción documental asistida por IA.

---

## Índice de Documentación Técnica

1. **[Estado del Backend y Base de Datos](file:///c:/Antigravity/Leon_Proveedores/docs/SUPPLIER_ACCOUNTS_BACKEND_STATUS.md):**
   Documento de referencia principal que detalla el esquema relacional desplegado, tablas, claves foráneas `RESTRICT`, catálogo de tipos de comprobantes, funciones RPC transaccionales, vistas de saldos y políticas de seguridad RLS.

2. **[Especificación de Extracción con IA](file:///c:/Antigravity/Leon_Proveedores/docs/ai_extraction_specification.md):**
   Contrato estructurado JSON, prompt de sistema para LLM, estimación de costos (~$0.001 USD/comprobante) y estrategia de procesamiento multimodal para PDFs e imágenes.

3. **[Migraciones PostgreSQL](file:///c:/Antigravity/Leon_Proveedores/supabase/migrations/):**
   - [`20260824000001_initial_schema.sql`](file:///c:/Antigravity/Leon_Proveedores/supabase/migrations/20260824000001_initial_schema.sql): Esquema DDL con las 11 tablas del sistema.
   - [`20260824000002_seed_data.sql`](file:///c:/Antigravity/Leon_Proveedores/supabase/migrations/20260824000002_seed_data.sql): Tipos de comprobante, roles y permisos RBAC.
   - [`20260824000003_views_and_rpc.sql`](file:///c:/Antigravity/Leon_Proveedores/supabase/migrations/20260824000003_views_and_rpc.sql): Vistas de saldos y funciones almacenadas transaccionales.
   - [`20260824000004_rls_and_security.sql`](file:///c:/Antigravity/Leon_Proveedores/supabase/migrations/20260824000004_rls_and_security.sql): Políticas de Row Level Security.
   - [`20260824000005_storage_bucket.sql`](file:///c:/Antigravity/Leon_Proveedores/supabase/migrations/20260824000005_storage_bucket.sql): Configuración del bucket de Supabase Storage.

4. **[Suite de Pruebas Automatizadas](file:///c:/Antigravity/Leon_Proveedores/supabase/tests/verify_account_payable.sql):**
   Script SQL integral de verificación de todos los flujos de negocio (aplicaciones M:N, desimputaciones, reversiones, duplicados y consistencia matemática de saldos).

---

## Principios Fundamentales del Sistema

- **Inmutabilidad Absoluta:** No se borran ni reescriben comprobantes confirmados ni aplicaciones. Todo error se corrige mediante hechos compensatorios vinculados.
- **Dualidad de Identidad:** `id bigint` para la integridad relacional del sistema y `human_reference` (`FAC A 0001-00012345 / ID 77777`) para la operación humana.
- **Parametrización:** Facturas, Notas de Crédito, Órdenes de Pago, Anticipos y Desimputaciones son todos tipos de una misma entidad `documents`.
- **Independencia del Saldo Global:** Las aplicaciones distribuyen imputaciones entre comprobantes, pero el saldo global surge exclusivamente de los documentos económicos.
