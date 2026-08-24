# León Proveedores - Sistema Integral de Cuentas Corrientes y Facturación

Sistema de gestión operativa de cuentas corrientes de proveedores, ledger inmutable v3.0, control de aging por vencimiento, proyección semanal de pagos y captura multi-canal de comprobantes con extracción estructurada server-side por IA.

---

## 🚀 Características Principales

* **Ledger Inmutable de Cuentas Corrientes (v3.0):**
  - Modelo de movimientos firmados (`account_movements`) y saldos por referencia (`reference_id`).
  - Imputación nativa en órdenes de pago (OP) con gestión de remanentes a cuenta.
  - Transferencia posterior de saldos mediante comprobantes de aplicación (`APL`) y reversiones trazables (`APL-REV` / `REV`).
  - Particionamiento multi-moneda estricto (`supplier_id + currency`) en ARS, USD y EUR.

* **Gestión Financiera y Reportes:**
  - **Saldo General / Aging por Vencimiento:** Cálculo dinámico de saldos abiertos por buckets temporales (Vencidos >60, 31-60, 1-30, A Vencer 1-30, 31-60, >60 días) con drilldown documental.
  - **Proyección Semanal de Pagos:** Agrupación cronológica por semanas calendario (Lunes a Domingo) con vista pivoteada interactiva.

* **Sistema de Captura Multi-Canal (v4.1):**
  1. 📝 Carga Manual con validación en tiempo real.
  2. 📄 Carga de Facturas en PDF desde la PC con extracción IA.
  3. 🖼️ Carga de Imágenes (JPG, PNG, WEBP) desde la PC.
  4. 📱 Captura Fotográfica desde Celular mediante Código QR y sesiones temporales criptográficas con `token_hash` (SHA-256).
  - Detección de duplicados fiscales con autorización por excepción auditada.
  - Alta rápida de proveedores "on the fly" con validación de CUIT (Módulo 11).

---

## 🛠️ Tecnologías

* **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons.
* **Backend / Base de Datos:** PostgreSQL en Supabase, PL/pgSQL, Row-Level Security (RLS), Storage Privado.
* **Procesamiento IA:** Supabase Edge Functions (`extract-invoice`), OpenAI Structured Outputs (`gpt-4o-mini` configurable).

---

## 📦 Instalación y Configuración

### 1. Clonar el repositorio
```bash
git clone https://github.com/hzerdan/proveedores.git
cd proveedores
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Variables de entorno
Copiar el archivo de plantilla:
```bash
cp .env.example .env
```
Configurar en `.env`:
```env
VITE_SUPABASE_URL=https://<TU-PROYECTO>.supabase.co
VITE_SUPABASE_ANON_KEY=<TU-ANON-KEY>
```

> [!WARNING]
> **Seguridad:** Nunca colocar secretos como `OPENAI_API_KEY`, claves de base de datos ni `SUPABASE_SERVICE_ROLE_KEY` en `.env` o en el repositorio. Los secretos server-side se configuran exclusivamente en Supabase Edge Functions:
> ```bash
> supabase secrets set OPENAI_API_KEY=sk-... OPENAI_DOCUMENT_MODEL=gpt-4o-mini
> ```

### 4. Ejecución en desarrollo
```bash
npm run dev
```

### 5. Compilación para producción
```bash
npm run build
```

---

## 🗄️ Migraciones de Base de Datos
Las migraciones reproducibles se encuentran en [`supabase/migrations/`](./supabase/migrations):
* `20260824000001_supplier_accounts_schema.sql` - Estructura base de proveedores, documentos y movimientos.
* `20260824000002_fix_views.sql` - Vistas iniciales de balance y estado de cuenta.
* `20260824000003_storage_and_ai_extractions.sql` - Infraestructura de Storage y logs de IA.
* `20260824000004_ledger_v2_refactor.sql` - Refactorización de Ledger con importes firmados, remanentes y APL.
* `20260824000005_aging_and_payment_projection.sql` - Vista canónica `v_open_reference_balances`, RPCs de Aging y Proyección.
* `20260824000006_document_intake_and_qr_sessions.sql` - Sesiones QR con token_hash, CUIT mod 11, alta on-the-fly y RLS.
