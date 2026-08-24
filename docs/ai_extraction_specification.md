# Especificación y Contrato de Extracción Documental con Inteligencia Artificial

---

## 1. Modelo Propuesto y Arquitectura de Inferencia

### A. Modelo Recomendado
- **Modelo Principal:** `gpt-4o-mini` o `gemini-1.5-flash` / `gemini-2.0-flash` (para extracción de alta velocidad y costo ultra bajo).
- **Modelo de Alta Precisión (Fallback):** `gpt-4o` (para comprobantes con caligrafía ilegible o tickets térmicos degradados).

### B. Estimación de Costos
- **Costo Promedio por Documento (Factura / Recibo de 1 a 2 páginas):**
  - Con `gpt-4o-mini` / `gemini-1.5-flash`: **~$0.0005 a $0.0015 USD por comprobante** (menos de 2 pesos argentinos por factura).
  - Con `gpt-4o`: **~$0.015 a $0.025 USD por comprobante**.

---

## 2. Estrategia de Procesamiento para PDFs e Imágenes

1. **Recepción del Archivo:**
   El operador sube el archivo al bucket `supplier-documents` de Supabase Storage mediante una URL firmada generada con permisos de usuario autenticado.
2. **Normalización del Input:**
   - **Imágenes (JPEG, PNG, WebP):** Se envían directamente al LLM en formato base64 con el mime-type correspondiente.
   - **PDFs Digitales (con capa de texto):** Si el PDF es digital nativo, se extrae el texto estructurado y se envía como prompt textual para máxima velocidad y menor consumo de tokens.
   - **PDFs Escaneados:** Se renderizan las primeras páginas a imagen JPEG (150-200 DPI) o se envían como entrada de documento multimodal al modelo.
3. **Invocación Segura (Server-Side Exclusivo):**
   La llamada a la API del modelo de IA se ejecuta en una **Supabase Edge Function** o un servicio backend dedicado. **Nunca se expone la API key de OpenAI/Google en el cliente frontend.**

---

## 3. Formato Estructurado de Respuesta (JSON Schema)

El modelo debe responder con el siguiente esquema estricto (Structured Outputs / JSON Mode):

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "SupplierDocumentExtraction",
  "type": "object",
  "properties": {
    "supplier_tax_id": {
      "type": "string",
      "description": "CUIT o número de identificación fiscal del emisor (ej: '30-71234567-9' o '30712345679')"
    },
    "supplier_name": {
      "type": "string",
      "description": "Razón social o nombre de fantasía del emisor"
    },
    "document_type_code": {
      "type": "string",
      "enum": ["FACTURA", "NOTA_CREDITO", "NOTA_DEBITO", "RECIBO", "ORDEN_PAGO", "RETENCION", "PROFORMA"],
      "description": "Tipo de comprobante identificado"
    },
    "letter": {
      "type": ["string", "null"],
      "enum": ["A", "B", "C", "M", "E", null],
      "description": "Letra del comprobante fiscal argentino"
    },
    "point_of_sale": {
      "type": ["integer", "null"],
      "description": "Punto de venta o terminal (ej: 1, 4, 1234)"
    },
    "document_number": {
      "type": ["integer", "null"],
      "description": "Número de comprobante fiscal (ej: 12345678)"
    },
    "human_reference": {
      "type": "string",
      "description": "Referencia amigable completa (ej: 'FAC A 0004-00012345')"
    },
    "external_reference": {
      "type": ["string", "null"],
      "description": "Número de CAE, CAI, código de barra o identificador externo"
    },
    "issue_date": {
      "type": "string",
      "format": "date",
      "description": "Fecha de emisión en formato YYYY-MM-DD"
    },
    "due_date": {
      "type": ["string", "null"],
      "format": "date",
      "description": "Fecha de vencimiento en formato YYYY-MM-DD"
    },
    "currency": {
      "type": "string",
      "enum": ["ARS", "USD", "EUR"],
      "default": "ARS",
      "description": "Moneda del comprobante"
    },
    "total_amount": {
      "type": "number",
      "minimum": 0.01,
      "description": "Importe total final del comprobante"
    },
    "subtotal_amount": {
      "type": ["number", "null"],
      "description": "Importe neto gravado o subtotal"
    },
    "tax_amount": {
      "type": ["number", "null"],
      "description": "Importe total de IVA / impuestos"
    },
    "concept": {
      "type": ["string", "null"],
      "description": "Concepto principal o descripción de ítems"
    },
    "confidence_score": {
      "type": "number",
      "minimum": 0.0,
      "maximum": 1.0,
      "description": "Nivel de confianza global de la extracción"
    }
  },
  "required": [
    "supplier_tax_id",
    "document_type_code",
    "human_reference",
    "issue_date",
    "currency",
    "total_amount",
    "confidence_score"
  ]
}
```

---

## 4. Prompt de Sistema para el Extractor LLM

```markdown
Eres un asistente experto en auditoría documental y contabilidad administrativa argentina y regional.
Tu tarea es interpretar la imagen o documento adjunto y extraer con precisión quirúrgica todos los datos fiscales y económicos del comprobante del proveedor.

Reglas estrictas:
1. El emisor es el PROVEEDOR (quien emite la factura o recibo). No confundir con el receptor/cliente.
2. Formatea CUIT únicamente con dígitos numéricos o guiones estándar.
3. Distingue con precisión el Punto de Venta (primer bloque de 4 o 5 dígitos) y el Número de Comprobante (bloque de 8 dígitos).
4. Fechas en formato ISO (YYYY-MM-DD). Si el comprobante muestra "10/08/2026", conviértelo a "2026-08-10".
5. El total_amount debe ser el importe final a pagar, como número decimal positivo.
6. Si algún campo no está presente o es ilegible, devuelve null en ese campo y ajusta tu confidence_score.
```

---

## 5. Manejo de Errores y Estrategia de Resiliencia

1. **Comprobante Ilegible / Error de IA:**
   Si el LLM no logra identificar los campos esenciales o el archivo está dañado:
   - Se registra el incidente en `document_ai_extractions` con `status = 'FAILED'` y el mensaje de error.
   - El sistema abre el formulario en modo **Borrador Manual (`DRAFT`)**, permitiendo al operador completar los datos manualmente sin bloquear su trabajo.
2. **CUIT No Encontrado en Base de Datos:**
   Si el CUIT extraído no coincide con ningún registro en `suppliers`:
   - El formulario muestra una advertencia visual amarilla: *"Proveedor nuevo detectado (CUIT XX-XXXXXXXX-X)"* con un botón de un clic para dar de alta el proveedor.
