# Plan de Refactorización v2.0: Ledger de Cuenta Corriente con Movimientos Firmados y Documentos APL

## 1. Resumen Ejecutivo y Nuevos Principios Funcionales

El objetivo de esta refactorización es dotar al sistema de una estructura contable **directa, transparente y legible para una persona**, donde los saldos puedan auditarse y explicarse de forma inmediata mediante sumas algebraicas:

$$\text{Saldo Global Proveedor} = \sum_{\text{supplier\_id} = P} \text{amount}$$
$$\text{Saldo de una Factura / Referencia } R = \sum_{\text{reference\_id} = R} \text{amount}$$

### Principios Rectores:
1. **Importes Firmados:** Los importes se almacenan directamente con su signo económico (`+` para Débitos / Facturas / Reversión de Pagos; `-` para Créditos / Pagos / Reversión de Facturas).
2. **Imputación Nativa al Nacer:** Cuando una Orden de Pago (o Nota de Crédito) se emite conociendo qué facturas cancela, **nace directamente con tantos renglones como documentos afecte** (`reference_id = FAC_ID`). No necesita un documento intermedio.
3. **Remanente Propio:** Si una OP de `$1.000` solo cancela `$700` en facturas, el remanente de `$300` genera un renglón referenciado a la propia OP (`reference_id = OP_ID`, `amount = -$300`), quedando como saldo a favor listo para usar.
4. **Documento Especial APL (`APLICACIÓN`):**  
   - Su función exclusiva es **transferir saldo preexistente entre referencias** (ej. aplicar posteriormente un anticipo o corregir imputaciones).
   - **Propiedad Fundamental Inquebrantable:** $\sum \text{amount de APL} = 0$.
   - **Un APL jamás altera el saldo global del proveedor.**
5. **Inmutabilidad Absoluta:** Nada confirmado se edita ni se borra. Toda corrección se realiza mediante contra-asientos con documentos o APLs compensatorios.

---

## 2. Comparativa Arquitectónica: Alternativa A vs Alternativa B

Evaluamos exhaustivamente la estructura de almacenamiento antes de definir el esquema:

| Criterio | Alternativa A: Tabla Única Pura (`account_ledger`) | Alternativa B (Recomendada): Cabecera (`documents`) + Renglones Ledger (`account_movements`) |
| :--- | :--- | :--- |
| **Estructura** | 1 sola tabla donde cada fila repite todos los datos del documento y del movimiento. | 2 tablas: `documents` (entidad comercial/archivo) y `account_movements` (líneas con signo). |
| **Duplicación de Datos** | **Alta:** Si una OP cancela 15 facturas, se repiten 15 veces el proveedor, número, POS, fecha, concepto, usuario y timestamps. | **Cero duplicación:** La cabecera se almacena 1 sola vez; la tabla de movimientos solo guarda importes, referencias y notas. |
| **Archivos Adjuntos e IA** | **Compleja:** Los archivos PDF y extracciones de IA (`document_ai_extractions`) tendrían que vincularse a un `group_id` artificial. | **Natural y Limpia:** `document_files` y `document_ai_extractions` tienen FK directa y estricta a `documents.id`. |
| **Validación de Integridad** | Difícil de validar atómicamente por triggers de fila. | **Sencilla y Robusta:** Triggers y RPCs validan que $\sum \text{movements} = \text{documents.signed\_total}$ y $\sum \text{APL} = 0$. |
| **Consultas Frontend** | Requiere `SELECT DISTINCT` o `GROUP BY` pesados para listar comprobantes. | Consultas inmediatas: `v_document_summary` para la cabecera y `account_movements` para el desglose. |
| **Estándar de la Industria** | Poco escalable en auditoría contable. | **Estándar Universal de ERPs** (SAP, Odoo, NetSuite: Cabecera Documental + Líneas de Asiento). |

### Conclusión y Recomendación:
Se adopta la **Alternativa B**, manteniendo `documents` como cabecera documental lógica y unificando todas las imputaciones, saldos y aplicaciones en `account_movements`.

---

## 3. Modelo de Datos Definitivo

### A. Tabla `documents` (Cabecera Documental Lógica)
```sql
CREATE TABLE documents (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    supplier_id bigint NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    document_type_id smallint NOT NULL REFERENCES document_types(id) ON DELETE RESTRICT,
    status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'CONFIRMED')),
    letter varchar(1),
    point_of_sale integer,
    document_number integer,
    human_reference varchar(100) NOT NULL,
    external_reference varchar(100),
    issue_date date NOT NULL,
    due_date date,
    currency varchar(3) NOT NULL DEFAULT 'ARS',
    exchange_rate numeric(15,6) NOT NULL DEFAULT 1.000000,
    total_amount numeric(15,2) NOT NULL CHECK (total_amount >= 0), -- Importe facial positivo
    concept text,
    notes text,
    intake_source text NOT NULL DEFAULT 'MANUAL' CHECK (intake_source IN ('MANUAL', 'IMAGE', 'PDF', 'API', 'IMPORT')),
    created_by bigint NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    confirmed_by bigint REFERENCES profiles(id) ON DELETE RESTRICT,
    confirmed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
```

### B. Tabla `account_movements` (Ledger de Renglones con Signo)
```sql
CREATE TABLE account_movements (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    supplier_id bigint NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    document_id bigint NOT NULL REFERENCES documents(id) ON DELETE RESTRICT, -- Agrupador / Documento emisor
    reference_id bigint NOT NULL REFERENCES documents(id) ON DELETE RESTRICT, -- Referencia económica cuyo saldo afecta
    line_number smallint NOT NULL DEFAULT 1,
    movement_type text NOT NULL CHECK (movement_type IN ('ORIGIN', 'IMPUTATION', 'REMAINDER', 'APL_TRANSFER', 'REVERSAL', 'DESIMPUTATION')),
    movement_date date NOT NULL,
    currency varchar(3) NOT NULL DEFAULT 'ARS',
    amount numeric(15,2) NOT NULL, -- CON SIGNO (+ Débito, - Crédito)
    notes text,
    created_by bigint NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Índices de máximo rendimiento
CREATE INDEX idx_mov_supplier ON account_movements(supplier_id);
CREATE INDEX idx_mov_reference ON account_movements(reference_id);
CREATE INDEX idx_mov_document ON account_movements(document_id);
CREATE INDEX idx_mov_date ON account_movements(movement_date);
```

---

## 4. Demostración Matemática de los 15 Escenarios de Negocio

### Escenario 1: Factura sin pagar
- Factura A #100 por `$1.000,00`:
  - Renglón 1: `doc_id: 100, ref_id: 100, amount: +1000,00, type: ORIGIN`
- **Saldo Ref #100:** `+1000` (Deuda)
- **Saldo Proveedor:** `+1000`

---

### Escenario 2: Factura pagada totalmente con OP al registrarla (Imputación Nativa)
- Factura A #100 por `$1.000,00`.
- OP #200 nace por `$1.000,00` imputada directamente a Factura #100:
  - Renglón 1: `doc_id: 100, ref_id: 100, amount: +1000,00, type: ORIGIN`
  - Renglón 2: `doc_id: 200, ref_id: 100, amount: -1000,00, type: IMPUTATION`
- **Saldo Ref #100:** `+1000 - 1000 = $0,00` (Saldada)
- **Total OP #200:** `SUM(amount WHERE doc_id = 200) = -$1.000,00`
- **Saldo Proveedor:** `+1000 - 1000 = $0,00`

---

### Escenario 3: Factura parcialmente pagada
- Factura A #100 por `$1.000,00`.
- OP #200 nace por `$400,00` imputada a Factura #100:
  - Renglón 1: `doc_id: 100, ref_id: 100, amount: +1000,00, type: ORIGIN`
  - Renglón 2: `doc_id: 200, ref_id: 100, amount: -400,00, type: IMPUTATION`
- **Saldo Ref #100:** `+1000 - 400 = +$600,00` (Deuda pendiente)
- **Saldo Proveedor:** `+$600,00`

---

### Escenario 4: OP aplicada a varias facturas al nacer
- Factura A #100 por `$400,00` y Factura B #101 por `$600,00`.
- OP #200 nace por `$1.000,00` cancelando ambas:
  - Renglón 1: `doc_id: 100, ref_id: 100, amount: +400,00, type: ORIGIN`
  - Renglón 2: `doc_id: 101, ref_id: 101, amount: +600,00, type: ORIGIN`
  - Renglón 3: `doc_id: 200, ref_id: 100, amount: -400,00, type: IMPUTATION`
  - Renglón 4: `doc_id: 200, ref_id: 101, amount: -600,00, type: IMPUTATION`
- **Saldo Ref #100:** `+400 - 400 = $0,00`
- **Saldo Ref #101:** `+600 - 600 = $0,00`
- **Total OP #200:** `-400 + -600 = -$1.000,00`
- **Saldo Proveedor:** `$0,00`

---

### Escenario 5: OP parcialmente aplicada con remanente propio
- Factura A #100 por `$400,00` y Factura B #101 por `$300,00`.
- OP #200 nace por `$1.000,00`: cancela ambas y deja `$300` libres:
  - Renglón 1: `doc_id: 100, ref_id: 100, amount: +400,00, type: ORIGIN`
  - Renglón 2: `doc_id: 101, ref_id: 101, amount: +300,00, type: ORIGIN`
  - Renglón 3: `doc_id: 200, ref_id: 100, amount: -400,00, type: IMPUTATION`
  - Renglón 4: `doc_id: 200, ref_id: 101, amount: -300,00, type: IMPUTATION`
  - Renglón 5: `doc_id: 200, ref_id: 200, amount: -300,00, type: REMAINDER` (Remanente propio)
- **Saldo Ref #100:** `$0,00`
- **Saldo Ref #101:** `$0,00`
- **Saldo Ref #200 (OP Libre):** `-$300,00` (Crédito disponible para transferir con APL)
- **Total OP #200:** `-400 - 300 - 300 = -$1.000,00`
- **Saldo Proveedor:** `+400 + 300 - 400 - 300 - 300 = -$300,00` (A favor de la empresa)

---

### Escenario 6: OP adelantada sin facturas (Anticipo Puro)
- OP #200 nace por `$1.000,00` como anticipo sin facturas:
  - Renglón 1: `doc_id: 200, ref_id: 200, amount: -1000,00, type: ORIGIN`
- **Saldo Ref #200:** `-$1.000,00` (Crédito a favor de la empresa)
- **Saldo Proveedor:** `-$1.000,00`

---

### Escenario 7: OP adelantada aplicada posteriormente mediante APL
- Continuando del Escenario 6 (Anticipo Doc #200 con `-$1.000,00` en `ref_id = 200`).
- Ingresan Factura #300 (`+$400`) y Factura #301 (`+$600`).
- Se emite **APL #400** para transferir el saldo del anticipo:
  - Renglón 2: `doc_id: 300, ref_id: 300, amount: +400,00, type: ORIGIN`
  - Renglón 3: `doc_id: 301, ref_id: 301, amount: +600,00, type: ORIGIN`
  - Renglón 4: `doc_id: 400 (APL), ref_id: 200, amount: +1000,00, type: APL_TRANSFER` (Libera el crédito de la OP)
  - Renglón 5: `doc_id: 400 (APL), ref_id: 300, amount: -400,00, type: APL_TRANSFER` (Cancela Factura #300)
  - Renglón 6: `doc_id: 400 (APL), ref_id: 301, amount: -600,00, type: APL_TRANSFER` (Cancela Factura #301)
- **Comprobación APL #400:** `+1000 - 400 - 600 = 0` (Suma Cero obligatoria)
- **Saldo Ref #200 (OP):** `-1000 + 1000 = $0,00` (Consumida al 100%)
- **Saldo Ref #300 (FAC):** `+400 - 400 = $0,00` (Saldada)
- **Saldo Ref #301 (FAC):** `+600 - 600 = $0,00` (Saldada)
- **Saldo Proveedor:** `-$1000 + 400 + 600 + 1000 - 400 - 600 = $0,00`

---

### Escenario 8: APL Parcial (Consumo parcial de un anticipo)
- Anticipo Doc #200 por `-$1.000,00` (`ref_id = 200`).
- Ingresa Factura #300 por `$400,00`.
- Se emite **APL #401** por `$400,00`:
  - Renglón 1: `doc_id: 401 (APL), ref_id: 200, amount: +400,00, type: APL_TRANSFER`
  - Renglón 2: `doc_id: 401 (APL), ref_id: 300, amount: -400,00, type: APL_TRANSFER`
- **Comprobación APL #401:** `+400 - 400 = 0`
- **Saldo Ref #200 (Anticipo remanente):** `-1000 + 400 = -$600,00` (Disponible restante)
- **Saldo Ref #300 (Factura):** `+400 - 400 = $0,00` (Saldada)
- **Saldo Proveedor:** `-$600,00`

---

### Escenario 9: Nota de Crédito aplicada directamente al nacer
- Factura A #100 por `$1.000,00`.
- NC #150 nace por `$200,00` imputada directamente a Factura #100:
  - Renglón 1: `doc_id: 100, ref_id: 100, amount: +1000,00, type: ORIGIN`
  - Renglón 2: `doc_id: 150, ref_id: 100, amount: -200,00, type: IMPUTATION`
- **Saldo Ref #100:** `+1000 - 200 = +$800,00`
- **Total NC #150:** `-$200,00`
- **Saldo Proveedor:** `+$800,00`

---

### Escenario 10: Crédito existente (NC libre) aplicado posteriormente mediante APL
- NC #150 por `$200,00` emitida libre sin factura (`ref_id = 150, amount: -200`).
- Luego ingresa Factura #100 por `$1.000,00`.
- Se emite **APL #402**:
  - Renglón 1: `doc_id: 402 (APL), ref_id: 150, amount: +200,00, type: APL_TRANSFER` (Consume la NC)
  - Renglón 2: `doc_id: 402 (APL), ref_id: 100, amount: -200,00, type: APL_TRANSFER` (Aplica a la Factura)
- **Comprobación APL #402:** `+200 - 200 = 0`
- **Saldo Ref #150 (NC):** `-200 + 200 = $0,00`
- **Saldo Ref #100 (Factura):** `+1000 - 200 = +$800,00`
- **Saldo Proveedor:** `+$800,00`

---

### Escenario 11: Imputación incorrecta (Detección de error)
- Factura A #100 (`+$500`) y Factura B #101 (`+$500`).
- OP #200 ($500) se imputó por error a Factura A #100:
  - Renglón 1: `doc_id: 100, ref_id: 100, amount: +500,00, type: ORIGIN`
  - Renglón 2: `doc_id: 101, ref_id: 101, amount: +500,00, type: ORIGIN`
  - Renglón 3: `doc_id: 200, ref_id: 100, amount: -500,00, type: IMPUTATION`
- **Estado con error:** Factura A = `$0`, Factura B = `+$500`.

---

### Escenario 12: Reversión mediante APL Compensatorio (Desimputación Limpia)
- Para corregir la imputación errónea del Escenario 11 sin borrar nada, se emite **APL #405 (Desimputación)**:
  - Renglón 4: `doc_id: 405 (APL), ref_id: 100, amount: +500,00, type: DESIMPUTATION` (Restaura la deuda de Factura A)
  - Renglón 5: `doc_id: 405 (APL), ref_id: 200, amount: -500,00, type: DESIMPUTATION` (Restaura el saldo libre a OP #200)
- **Comprobación APL #405:** `+500 - 500 = 0`
- **Saldo Ref #100 (Factura A):** `+500 - 500 + 500 = +$500,00` (Deuda restaurada)
- **Saldo Ref #200 (OP 200):** `-$500,00` (Crédito a favor restaurado y disponible)
- **Saldo Ref #101 (Factura B):** `+$500,00`
- **Saldo Proveedor:** `+$500,00` (Inmutable)

---

### Escenario 13: Reaplicación correcta tras desimputación
- Continuando del Escenario 12, se emite **APL #406** aplicando el crédito restaurado a la Factura B:
  - Renglón 6: `doc_id: 406 (APL), ref_id: 200, amount: +500,00, type: APL_TRANSFER` (Consume el crédito de OP #200)
  - Renglón 7: `doc_id: 406 (APL), ref_id: 101, amount: -500,00, type: APL_TRANSFER` (Cancela Factura B #101)
- **Comprobación APL #406:** `+500 - 500 = 0`
- **Saldo Ref #100 (Factura A):** `+$500,00` (Pendiente)
- **Saldo Ref #101 (Factura B):** `+500 - 500 = $0,00` (Saldada correctamente)
- **Saldo Ref #200 (OP #200):** `-500 + 500 = $0,00` (Consumida al 100%)
- **Saldo Proveedor:** `+$500,00`

---

### Escenario 14: Reversión completa de documento económico erróneo
- Factura A #100 por `$1.000,00` cargada por error.
- Se genera documento de ajuste `REV-FAC-100` (Doc #105):
  - Renglón 1: `doc_id: 100, ref_id: 100, amount: +1000,00, type: ORIGIN`
  - Renglón 2: `doc_id: 105, ref_id: 100, amount: -1000,00, type: REVERSAL`
- **Saldo Ref #100:** `+1000 - 1000 = $0,00` (Anulada)
- **Saldo Proveedor:** `$0,00`

---

### Escenario 15: Documento duplicado autorizado (Refacturación Corregida)
- Factura A #2001 (Doc #8) por `$400,00` anulada con reversión (Doc #12, `-$400,00`).
- Se autoriza por excepción la nueva Factura A #2001 (Doc #15) por `$450,00`:
  - Renglón 1: `doc_id: 8, ref_id: 8, amount: +400,00, type: ORIGIN`
  - Renglón 2: `doc_id: 12, ref_id: 8, amount: -400,00, type: REVERSAL`
  - Renglón 3: `doc_id: 15, ref_id: 15, amount: +450,00, type: ORIGIN`
- **Saldo Ref #8 (Original Anulada):** `+400 - 400 = $0,00`
- **Saldo Ref #15 (Nueva Vigente):** `+$450,00`
- **Saldo Proveedor:** `+$450,00`
- **Auditoría:** `duplicate_override_logs` mantiene la trazabilidad auditada de la excepción.

---

## 5. Validaciones Matemáticas Obligatorias en Backend

Se implementan constraints y triggers estrictos en PostgreSQL:

1. **Validación de Suma Cero en APL:**
   ```sql
   -- Al confirmar un documento de tipo 'APL':
   IF (SELECT COALESCE(SUM(amount), 0) FROM account_movements WHERE document_id = p_document_id) <> 0 THEN
       RAISE EXCEPTION 'Error de Integridad: Un documento APL debe sumar exactamente 0.00.';
   END IF;
   ```

2. **Validación de Renglones de Documento Económico Normal:**
   ```sql
   -- Al confirmar un documento normal (FAC, OP, NC, ND):
   v_expected_signed_total := CASE WHEN v_nature = 'DEBIT' THEN v_doc.total_amount ELSE -v_doc.total_amount END;
   IF (SELECT COALESCE(SUM(amount), 0) FROM account_movements WHERE document_id = p_document_id) <> v_expected_signed_total THEN
       RAISE EXCEPTION 'Error de Integridad: La suma de los renglones (%) no coincide con el total firmado del documento (%).',
           v_actual_sum, v_expected_signed_total;
   END IF;
   ```

3. **Prevención de Sobrecancelación de Deuda:**
   - La suma de aplicaciones hacia una `reference_id` de débito nunca puede hacer que su saldo sea negativo (`SUM(amount WHERE reference_id = R) >= 0`).

4. **Prevención de Sobreutilización de Crédito:**
   - La suma de aplicaciones desde un crédito nunca puede superar el crédito disponible original.

---

## 6. Estrategia de Migración sin Pérdida de Información

```
[Datos Actuales: documents, document_applications, application_reversals]
                             │
                             ▼
 1. Backup Transaccional (_bak_documents, _bak_applications, _bak_reversals)
                             │
                             ▼
 2. Crear tabla `account_movements` con Constraints e Índices
                             │
                             ▼
 3. Migrar Orígenes (Facturas -> +total, OPs sin aplicar -> -total)
                             │
                             ▼
 4. Migrar Aplicaciones Activas (OP -> -applied a FAC, +applied a OP)
                             │
                             ▼
 5. Migrar Aplicaciones Desimputadas (Generar contra-asientos APL)
                             │
                             ▼
 6. VALIDACIÓN AUTOMÁTICA OBLIGATORIA (ASSERT Saldo_Antes == Saldo_Después)
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
      Saldos Idénticos                Discrepancia > $0.00
       [ COMMIT ]                        [ ROLLBACK ]
```

### Script de Validación Automática:
```sql
DO $$
DECLARE
    v_diff_count integer;
BEGIN
    SELECT COUNT(*) INTO v_diff_count
    FROM (
        SELECT s.id, 
               (SELECT COALESCE(SUM(CASE WHEN dt.balance_nature = 'DEBIT' THEN d.total_amount ELSE -d.total_amount END), 0)
                FROM documents d JOIN document_types dt ON dt.id = d.document_type_id 
                WHERE d.supplier_id = s.id AND d.status = 'CONFIRMED' AND dt.affects_account_balance = true) as saldo_viejo,
               (SELECT COALESCE(SUM(amount), 0) FROM account_movements WHERE supplier_id = s.id) as saldo_nuevo
        FROM suppliers s
    ) bal
    WHERE round(bal.saldo_viejo, 2) <> round(bal.saldo_nuevo, 2);

    IF v_diff_count > 0 THEN
        RAISE EXCEPTION 'MIGRACIÓN ABORTADA: Se detectaron % proveedores con discrepancia de saldo.', v_diff_count;
    END IF;
END $$;
```

---

## 7. Cambios en Frontend y Experiencia de Usuario

1. **Grilla Principal de Cuenta Corriente:**
   - **Vista Ledger (Cronológica con Saldo Acumulado):**
     Columnas: Fecha (`DD-MM-YYYY`), Comprobante (`document_id`), Referencia Afectada (`reference_id`), Tipo, Débito (+), Crédito (-), Saldo Acumulado.
   - **Vista por Documentos Agrupados:**
     Muestra una fila por comprobante comercial (`document_id`) con su Total Facial y Saldo de Referencia.
2. **Botón "Detalle del Documento":**
   - Muestra todos los renglones con `document_id = X` (cómo nació y se distribuyó la OP o Factura).
3. **Botón "Movimientos Relacionados":**
   - Muestra todos los renglones con `reference_id = X` (toda la historia de pagos, ajustes y APLs que afectaron a esa factura).
4. **Modal de Carga de Comprobante / OP:**
   - Al cargar una OP, permite seleccionar las facturas a cancelar en el mismo momento, generando los renglones nativos de imputación y remanente automáticamente.
5. **Modal de Aplicación Posterior (APL):**
   - Para aplicar anticipos o saldos libres preexistentes, generando el documento APL de suma cero.
