# Estado del Backend y Frontend: Cuentas Corrientes, Aging, Proyección y Captura de Comprobantes v4.1

## 1. Arquitectura de Ingreso de Comprobantes

El sistema dispone de **4 modalidades de ingreso** que convergen estrictamente en el formulario canónico `DocumentFormModal` $\rightarrow$ validación de CUIT y proveedor $\rightarrow$ detección de duplicados con override $\rightarrow$ confirmación $\rightarrow$ `account_movements` (Ledger v3.0 inmutable):

1. **Carga Manual:** Ingreso directo de comprobantes comerciales y fiscales.
2. **Carga de Archivos PDF desde la PC:** Almacenamiento en bucket privado y extracción server-side con IA.
3. **Carga de Imágenes (JPG, PNG, WEBP) desde la PC:** Extracción estructurada y precompletado.
4. **Captura Fotográfica desde Celular mediante Código QR:** Generación de token efímero con almacenamiento seguro de `token_hash` (SHA-256), sin credenciales permanentes ni necesidad de iniciar sesión en el móvil.

---

## 2. Base de Datos y Backend (Supabase PostgreSQL)

### 2.1 Tablas Incorporadas
* **`document_upload_sessions`:**
  - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `token_hash VARCHAR(64) UNIQUE NOT NULL` (hash SHA-256 del token efímero)
  - `status VARCHAR(20) NOT NULL DEFAULT 'PENDING'` (`PENDING`, `UPLOADED`, `PROCESSING`, `COMPLETED`, `EXPIRED`, `CANCELLED`, `FAILED`)
  - `created_by BIGINT REFERENCES profiles(id)`
  - `file_id BIGINT REFERENCES document_files(id)`
  - `document_id BIGINT REFERENCES documents(id)`
  - `expires_at TIMESTAMPTZ NOT NULL`
  - `created_at TIMESTAMPTZ DEFAULT now()`
  - `completed_at TIMESTAMPTZ`

### 2.2 Funciones y RPCs Creadas
* **`fn_validate_cuit(p_cuit VARCHAR) RETURNS BOOLEAN`:** Validador algorítmico Módulo 11 de CUIT/CUIL argentino.
* **`rpc_create_upload_session(p_expires_in_minutes INT DEFAULT 15) RETURNS JSONB`:** Genera un token criptográfico de 64 caracteres hex, almacena su hash y retorna el token solo una vez al cliente PC.
* **`rpc_get_upload_session_status(p_session_token VARCHAR) RETURNS JSONB`:** Endpoint público de alcance mínimo que verifica la validez de la sesión sin exponer datos de negocio.
* **`rpc_submit_mobile_upload(p_session_token, p_storage_path, p_file_name, p_mime_type, p_file_size) RETURNS JSONB`:** Registra el archivo subido en `document_files` y actualiza la sesión a `UPLOADED`.
* **`rpc_quick_create_supplier(p_tax_id, p_trade_name, p_legal_name) RETURNS JSONB`:** Crea un proveedor nuevo con CUIT validado, garantizando unicidad fiscal y evitando duplicados.

---

## 3. Servicio Server-Side de IA (Edge Function)

* **`supabase/functions/extract-invoice/index.ts`:**
  - **Modelo Configurable:** Variable de entorno `OPENAI_DOCUMENT_MODEL` (por defecto `gpt-4o-mini`).
  - **Secreto:** `OPENAI_API_KEY` configurada en los secretos de Supabase (`supabase secrets set OPENAI_API_KEY=...`).
  - **Contrato JSON Schema:** Salida estructurada con `uncertain_fields`, `warnings` y `missing_fields`.
  - **Modo Fallback:** Permite el funcionamiento con simulación inteligente cuando la clave de OpenAI no está presente, garantizando cero interrupciones.

---

## 4. Componentes Frontend React

* **[`DocumentIntakeModal.tsx`](file:///c:/Antigravity/Leon_Proveedores/src/components/documents/DocumentIntakeModal.tsx):** Selector visual con las 4 modalidades de carga.
* **[`MobileCaptureQRModal.tsx`](file:///c:/Antigravity/Leon_Proveedores/src/components/documents/MobileCaptureQRModal.tsx):** Modal en PC con código QR y escucha en tiempo real.
* **[`MobileCapturePage.tsx`](file:///c:/Antigravity/Leon_Proveedores/src/components/documents/MobileCapturePage.tsx):** Vista móvil optimizada para cámara (`capture="environment"`), previsualización y subida directa.
* **[`SupplierQuickCreateModal.tsx`](file:///c:/Antigravity/Leon_Proveedores/src/components/suppliers/SupplierQuickCreateModal.tsx):** Modal de alta rápida de proveedores sin perder datos cargados.
* **[`DocumentFormModal.tsx`](file:///c:/Antigravity/Leon_Proveedores/src/components/documents/DocumentFormModal.tsx):** Formulario canónico de revisión con soporte para datos de IA, marcado de campos dudosos y vinculación documental.
* **[`cuitValidator.ts`](file:///c:/Antigravity/Leon_Proveedores/src/lib/cuitValidator.ts):** Utilidad de validación y formateo de CUITs en el frontend.
* **[`aiExtractor.ts`](file:///c:/Antigravity/Leon_Proveedores/src/lib/aiExtractor.ts):** Cliente de extracción estructurada y fallback.

---

## 5. Validación Técnica

* **`npx tsc --noEmit`:** 0 errores.
* **`npm run lint`:** 0 errores, 0 warnings.
* **`npm run build`:** Compilado exitosamente.
