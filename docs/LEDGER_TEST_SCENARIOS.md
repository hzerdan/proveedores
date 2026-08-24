# Guía y Catálogo de Escenarios de Prueba: Ledger, Aging y Proyección Semanal v3.1

Este documento describe con exactitud los escenarios de negocio y pruebas implementados en la base de datos PostgreSQL de Supabase para validar las vistas:
1. **Cuenta Corriente de Proveedores (Ledger y Documentos Agrupados)**
2. **Saldo General de Proveedores (Aging por Vencimiento)**
3. **Proyección de Pagos por Semana (Lunes a Domingo)**

---

## 1. Estructura de Proveedores de Prueba

| ID | Razón Social | CUIT | Monedas | Saldo Neto CC (24/08/2026) |
|---|---|---|---|---|
| **1** | **Lácteos del Sur S.A.** | `30-88888888-9` | **ARS** y **USD** | **+$3.510,00 ARS** / **+$1.500,00 USD** |
| **2** | **Distribuidora Central S.R.L.** | `30-77777777-3` | **ARS** | **+$1.000,00 ARS** |
| **3** | **Insumos Industriales S.A.** | `30-66666666-1` | **ARS** | **+$450,00 ARS** |

---

## 2. Validación de la Vista: Saldo General (Aging por Vencimiento)

### 2.1 Semántica de `p_cutoff_date`
* `p_cutoff_date` clasifica el **saldo abierto actual** de cada referencia pendiente (`reference_balance != 0`).
* No es una reconstrucción histórica del ledger.
* Por defecto: `p_cutoff_date = CURRENT_DATE` (`2026-08-24`).

### 2.2 Reconciliación Matemática Exacta
$$\text{net\_total\_balance} = \sum \text{Buckets Deuda} + \text{free\_credits\_amount}$$

| Proveedor | Moneda | Vencido >60 | Vencido 31-60 | Vencido 1-30 | A vencer 0-30 | A vencer 31-60 | A vencer >60 | Sin Vto | Créditos Libres | Saldo Total | Reconciliado |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Distribuidora Central** | `ARS` | $0,00 | $0,00 | $0,00 | $1.000,00 | $0,00 | $0,00 | $0,00 | $0,00 | **$1.000,00** | ✅ Si |
| **Insumos Industriales** | `ARS` | $0,00 | $0,00 | $0,00 | $0,00 | $450,00 | $0,00 | $0,00 | $0,00 | **$450,00** | ✅ Si |
| **Lácteos del Sur** | `ARS` | $110,00 | $250,00 | $290,00 | $2.300,00 | $410,00 | $220,00 | $230,00 | -$300,00 | **$3.510,00** | ✅ Si |
| **Lácteos del Sur** | `USD` | $0,00 | $0,00 | $0,00 | $1.500,00 | $0,00 | $0,00 | $0,00 | $0,00 | **$1.500,00** | ✅ Si |

### 2.3 Casos de Frontera Exactos (Límites 30/60 Días)
* **Cutoff -61d (`2026-06-24`):** FAC 50001 ($110) $\rightarrow$ `Vencido > 60`.
* **Cutoff -60d (`2026-06-25`):** FAC 50002 ($120) $\rightarrow$ `Vencido 31-60`.
* **Cutoff -31d (`2026-07-24`):** FAC 50003 ($130) $\rightarrow$ `Vencido 31-60`.
* **Cutoff -30d (`2026-07-25`):** FAC 50004 ($140) $\rightarrow$ `Vencido 1-30`.
* **Cutoff -1d (`2026-08-23`):** FAC 50005 ($150) $\rightarrow$ `Vencido 1-30`.
* **Cutoff Hoy (`2026-08-24`):** FAC 50006 ($160) $\rightarrow$ `A vencer 0-30` (Lunes).
* **Cutoff +6d (`2026-08-30`):** FAC 50007 ($170) $\rightarrow$ `A vencer 0-30` (Domingo).
* **Cutoff +7d (`2026-08-31`):** FAC 50008 ($180) $\rightarrow$ `A vencer 0-30` (Lunes siguiente).
* **Cutoff +30d (`2026-09-23`):** FAC 50009 ($190) $\rightarrow$ `A vencer 0-30`.
* **Cutoff +31d (`2026-09-24`):** FAC 50010 ($200) $\rightarrow$ `A vencer 31-60`.
* **Cutoff +60d (`2026-10-23`):** FAC 50011 ($210) $\rightarrow$ `A vencer 31-60`.
* **Cutoff +61d (`2026-10-24`):** FAC 50012 ($220) $\rightarrow$ `A vencer > 60`.
* **Sin Vencimiento:** FAC 50013 ($230) $\rightarrow$ `Sin Vto`.

---

## 3. Validación de la Vista: Proyección de Pagos por Semana

### 3.1 Reglas de la Proyección
* **Semana Calendario:** Lunes a Domingo (`DATE_TRUNC('week', due_date)`).
* **Exclusividad:** Únicamente obligaciones de pago reales (`reference_balance > 0`). Los créditos libres (OP adelantadas / NCs) quedan excluidos.
* **Sin filtro de fecha:** Incluye el 100% de la deuda (`VENCIDO` + todas las semanas futuras + `SIN VENCIMIENTO`).
* **Con filtro de fecha:** Exclusivamente comprobantes cuyo `due_date` esté dentro del intervalo solicitado.

### 3.2 Matriz Semanal Resultante (Sin Filtro)
* **Lácteos del Sur (ARS):**
  - Vencido: **$650,00** ($110 + $120 + $130 + $140 + $150).
  - Semana Lun 24/08 - Dom 30/08: **$330,00** (FAC 50006 $160 + FAC 50007 $170).
  - Semana Lun 31/08 - Dom 06/09: **$1.780,00** (FAC 10001 $1.000 + FAC 10003 $600 parcial + FAC 50008 $180).
  - Semana Lun 21/09 - Dom 27/09: **$390,00** (FAC 50009 $190 + FAC 50010 $200).
  - Semana Lun 19/10 - Dom 25/10: **$430,00** (FAC 50011 $210 + FAC 50012 $220).
  - Sin Vencimiento: **$230,00** (FAC 50013).
  - Total Deuda: **$3.810,00 ARS**.
* **Lácteos del Sur (USD):**
  - Semana Lun 07/09 - Dom 13/09: **$1.500,00 USD** (FAC 60001).
  - Total Deuda: **$1.500,00 USD**.
* **Distribuidora Central (ARS):**
  - Semana Lun 14/09 - Dom 20/09: **$1.000,00 ARS** (FAC 10014 $800 parcial + FAC 10015 $200 parcial).
* **Insumos Industriales (ARS):**
  - Semana Lun 21/09 - Dom 27/09: **$450,00 ARS** (FAC 10023 duplicado autorizado).

---

## 4. Validación de Drilldown

Al hacer clic sobre cualquier celda/importe de Aging o Proyección Semanal, se abre el modal [`BucketDetailModal`](file:///c:/Antigravity/Leon_Proveedores/src/components/aging/BucketDetailModal.tsx), el cual llama a `rpc_get_open_documents_detail` y verifica:
$$\sum \text{Detalle Documental} = \text{Importe de la Celda}$$
