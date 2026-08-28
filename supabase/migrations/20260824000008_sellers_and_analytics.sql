-- ============================================================================
-- MIGRACIÓN 7: Módulo de Vendedores (Sellers), Relaciones M:N y Analítica
-- Fecha: 2026-08-27
-- ============================================================================

-- 1. Tabla de Vendedores (Sellers)
CREATE TABLE IF NOT EXISTS sellers (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code varchar(30) UNIQUE,
    first_name text NOT NULL,
    last_name text NOT NULL,
    display_name text NOT NULL,
    phone text,
    email text,
    is_active boolean NOT NULL DEFAULT true,
    notes text,
    created_by bigint REFERENCES profiles(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_sellers_is_active ON sellers(is_active);
CREATE INDEX IF NOT EXISTS idx_sellers_code ON sellers(code);
CREATE INDEX IF NOT EXISTS idx_sellers_display_name ON sellers(display_name);

-- 2. Tabla Intermedia Proveedores <-> Vendedores (supplier_sellers)
CREATE TABLE IF NOT EXISTS supplier_sellers (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    supplier_id bigint NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    seller_id bigint NOT NULL REFERENCES sellers(id) ON DELETE RESTRICT,
    is_active boolean NOT NULL DEFAULT true,
    valid_from date NOT NULL DEFAULT CURRENT_DATE,
    valid_to date,
    notes text,
    created_by bigint REFERENCES profiles(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT chk_supplier_sellers_dates CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE INDEX IF NOT EXISTS idx_supp_sellers_supplier ON supplier_sellers(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supp_sellers_seller ON supplier_sellers(seller_id);
CREATE INDEX IF NOT EXISTS idx_supp_sellers_dates ON supplier_sellers(valid_from, valid_to);
CREATE INDEX IF NOT EXISTS idx_supp_sellers_active ON supplier_sellers(is_active);

-- Índice parcial para prevenir relaciones activas abiertas duplicadas
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_supplier_seller 
    ON supplier_sellers (supplier_id, seller_id) 
    WHERE is_active = true AND valid_to IS NULL;

-- 3. Columna seller_id en documents (Nullable e Histórica)
ALTER TABLE documents 
    ADD COLUMN IF NOT EXISTS seller_id bigint REFERENCES sellers(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_documents_seller_id 
    ON documents(seller_id) WHERE seller_id IS NOT NULL;

-- 4. Permisos RBAC para Vendedores
INSERT INTO permissions (code, module, description) VALUES
    ('sellers.view', 'SELLERS', 'Visualizar el maestro de vendedores y sus asignaciones.'),
    ('sellers.manage', 'SELLERS', 'Crear, editar o desactivar vendedores.'),
    ('seller_supplier.manage', 'SELLERS', 'Vincular, desvincular o finalizar vigencias de vendedores con proveedores.')
ON CONFLICT (code) DO NOTHING;

-- Asignar permisos a roles existentes
-- OPERADOR: sellers.view
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.code = 'OPERADOR' AND p.code IN ('sellers.view')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ENCARGADO y ADMIN: todos los permisos de sellers
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.code IN ('ENCARGADO', 'ADMIN') AND p.code IN ('sellers.view', 'sellers.manage', 'seller_supplier.manage')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 5. Row Level Security (RLS) para sellers y supplier_sellers
ALTER TABLE sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_sellers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sellers_select" ON sellers;
CREATE POLICY "sellers_select" ON sellers
    FOR SELECT TO authenticated 
    USING (has_permission('sellers.view') OR has_permission('suppliers.view') OR has_permission('documents.view'));

DROP POLICY IF EXISTS "sellers_manage" ON sellers;
CREATE POLICY "sellers_manage" ON sellers
    FOR ALL TO authenticated 
    USING (has_permission('sellers.manage'));

DROP POLICY IF EXISTS "supplier_sellers_select" ON supplier_sellers;
CREATE POLICY "supplier_sellers_select" ON supplier_sellers
    FOR SELECT TO authenticated 
    USING (has_permission('sellers.view') OR has_permission('suppliers.view') OR has_permission('documents.view'));

DROP POLICY IF EXISTS "supplier_sellers_manage" ON supplier_sellers;
CREATE POLICY "supplier_sellers_manage" ON supplier_sellers
    FOR ALL TO authenticated 
    USING (has_permission('seller_supplier.manage') OR has_permission('suppliers.manage'));

-- 6. Función Auxiliar: Obtener Vendedores Válidos para un Proveedor y Fecha
CREATE OR REPLACE FUNCTION fn_get_valid_sellers_for_supplier(
    p_supplier_id bigint,
    p_issue_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    relationship_id bigint,
    seller_id bigint,
    seller_code varchar(30),
    first_name text,
    last_name text,
    display_name text,
    phone text,
    email text,
    valid_from date,
    valid_to date,
    is_active boolean
)
LANGUAGE sql
STABLE
AS $$
    SELECT 
        ss.id AS relationship_id,
        s.id AS seller_id,
        s.code AS seller_code,
        s.first_name,
        s.last_name,
        s.display_name,
        s.phone,
        s.email,
        ss.valid_from,
        ss.valid_to,
        (ss.is_active AND s.is_active) AS is_active
    FROM supplier_sellers ss
    JOIN sellers s ON s.id = ss.seller_id
    WHERE ss.supplier_id = p_supplier_id
      AND ss.is_active = true
      AND s.is_active = true
      AND ss.valid_from <= p_issue_date
      AND (ss.valid_to IS NULL OR ss.valid_to >= p_issue_date)
    ORDER BY s.last_name, s.first_name;
$$;

-- 7. Vista: Relaciones Activas Proveedor-Vendedor (v_active_supplier_sellers)
DROP VIEW IF EXISTS v_seller_account_summary CASCADE;
DROP VIEW IF EXISTS v_open_reference_balances CASCADE;
DROP VIEW IF EXISTS v_active_supplier_sellers CASCADE;

CREATE OR REPLACE VIEW v_active_supplier_sellers AS
SELECT 
    ss.id AS relationship_id,
    ss.supplier_id,
    sup.trade_name AS supplier_trade_name,
    sup.tax_id AS supplier_tax_id,
    ss.seller_id,
    sel.code AS seller_code,
    sel.first_name AS seller_first_name,
    sel.last_name AS seller_last_name,
    sel.display_name AS seller_display_name,
    sel.phone AS seller_phone,
    sel.email AS seller_email,
    ss.valid_from,
    ss.valid_to,
    ss.is_active AS relationship_active,
    sel.is_active AS seller_active,
    (ss.is_active AND sel.is_active AND ss.valid_from <= CURRENT_DATE AND (ss.valid_to IS NULL OR ss.valid_to >= CURRENT_DATE)) AS is_currently_valid,
    ss.notes,
    ss.created_at
FROM supplier_sellers ss
JOIN suppliers sup ON sup.id = ss.supplier_id
JOIN sellers sel ON sel.id = ss.seller_id;

-- 8. Actualización de Vista Canónica: v_open_reference_balances con seller_id
CREATE OR REPLACE VIEW v_open_reference_balances AS
WITH ref_totals AS (
  SELECT 
    m.reference_id,
    m.currency,
    SUM(m.amount) AS reference_balance
  FROM account_movements m
  GROUP BY m.reference_id, m.currency
)
SELECT 
  d.id AS document_id,
  d.supplier_id,
  s.trade_name AS supplier_trade_name,
  s.legal_name AS supplier_legal_name,
  s.tax_id AS supplier_tax_id,
  d.seller_id,
  sel.code AS seller_code,
  sel.display_name AS seller_display_name,
  dt.id AS document_type_id,
  dt.code AS document_type_code,
  dt.name AS document_type_name,
  dt.balance_nature,
  d.status,
  d.human_reference,
  d.issue_date,
  d.due_date,
  d.currency,
  d.total_amount,
  d.concept,
  d.notes,
  COALESCE(r.reference_balance, 0.00) AS reference_balance
FROM documents d
JOIN suppliers s ON s.id = d.supplier_id
JOIN document_types dt ON dt.id = d.document_type_id
LEFT JOIN sellers sel ON sel.id = d.seller_id
JOIN ref_totals r ON r.reference_id = d.id AND r.currency = d.currency
WHERE r.reference_balance <> 0.00;

-- 9. Vista: Resumen de Cuenta por Vendedor (v_seller_account_summary)
CREATE OR REPLACE VIEW v_seller_account_summary AS
SELECT 
    sel.id AS seller_id,
    sel.code AS seller_code,
    sel.display_name AS seller_display_name,
    sel.email AS seller_email,
    sel.phone AS seller_phone,
    sel.is_active AS seller_is_active,
    b.currency,
    COUNT(DISTINCT b.supplier_id) AS active_suppliers_count,
    COUNT(DISTINCT b.document_id) AS open_documents_count,
    COALESCE(SUM(CASE WHEN b.reference_balance > 0 THEN b.reference_balance ELSE 0.00 END), 0.00) AS total_pending_debt,
    COALESCE(SUM(CASE WHEN b.reference_balance < 0 THEN b.reference_balance ELSE 0.00 END), 0.00) AS total_available_credit,
    COALESCE(SUM(b.reference_balance), 0.00) AS net_seller_balance
FROM sellers sel
JOIN v_open_reference_balances b ON b.seller_id = sel.id
GROUP BY sel.id, sel.code, sel.display_name, sel.email, sel.phone, sel.is_active, b.currency;

-- 10. Vista/Función: Desglose por Proveedor, Moneda y Vendedor con Reconciliación
CREATE OR REPLACE FUNCTION rpc_get_supplier_seller_breakdown(
    p_supplier_id bigint,
    p_currency varchar DEFAULT NULL
)
RETURNS TABLE (
    supplier_id bigint,
    currency varchar,
    seller_id bigint,
    seller_code varchar,
    seller_display_name text,
    is_unassigned_debt boolean,
    is_free_credit boolean,
    item_category text, -- 'SELLER', 'UNASSIGNED_DEBT', 'FREE_CREDIT'
    open_doc_count bigint,
    total_debit_amount numeric(15,2),
    total_credit_amount numeric(15,2),
    net_balance numeric(15,2)
)
LANGUAGE sql
STABLE
AS $$
    WITH open_refs AS (
        SELECT 
            b.supplier_id,
            b.currency,
            b.seller_id,
            b.seller_code,
            b.seller_display_name,
            b.document_id,
            b.reference_balance,
            CASE 
                WHEN b.seller_id IS NOT NULL AND b.reference_balance > 0 THEN 'SELLER_DEBT'
                WHEN b.seller_id IS NOT NULL AND b.reference_balance < 0 THEN 'SELLER_CREDIT'
                WHEN b.seller_id IS NULL AND b.reference_balance > 0 THEN 'UNASSIGNED_DEBT'
                WHEN b.seller_id IS NULL AND b.reference_balance < 0 THEN 'FREE_CREDIT'
            END AS ref_type
        FROM v_open_reference_balances b
        WHERE b.supplier_id = p_supplier_id
          AND (p_currency IS NULL OR b.currency = p_currency)
    ),
    seller_grouped AS (
        -- 1. Saldos de Vendedores Concretos
        SELECT 
            o.supplier_id,
            o.currency,
            o.seller_id,
            o.seller_code,
            o.seller_display_name,
            false AS is_unassigned_debt,
            false AS is_free_credit,
            'SELLER' AS item_category,
            COUNT(DISTINCT o.document_id)::bigint AS open_doc_count,
            COALESCE(SUM(CASE WHEN o.reference_balance > 0 THEN o.reference_balance ELSE 0 END), 0.00)::numeric(15,2) AS total_debit_amount,
            COALESCE(SUM(CASE WHEN o.reference_balance < 0 THEN o.reference_balance ELSE 0 END), 0.00)::numeric(15,2) AS total_credit_amount,
            COALESCE(SUM(o.reference_balance), 0.00)::numeric(15,2) AS net_balance
        FROM open_refs o
        WHERE o.seller_id IS NOT NULL
        GROUP BY o.supplier_id, o.currency, o.seller_id, o.seller_code, o.seller_display_name

        UNION ALL

        -- 2. Deuda sin Vendedor Asignado (reference_balance > 0 y seller_id IS NULL)
        SELECT 
            o.supplier_id,
            o.currency,
            NULL::bigint AS seller_id,
            NULL::varchar AS seller_code,
            'Deuda sin vendedor asignado'::text AS seller_display_name,
            true AS is_unassigned_debt,
            false AS is_free_credit,
            'UNASSIGNED_DEBT' AS item_category,
            COUNT(DISTINCT o.document_id)::bigint AS open_doc_count,
            COALESCE(SUM(o.reference_balance), 0.00)::numeric(15,2) AS total_debit_amount,
            0.00::numeric(15,2) AS total_credit_amount,
            COALESCE(SUM(o.reference_balance), 0.00)::numeric(15,2) AS net_balance
        FROM open_refs o
        WHERE o.seller_id IS NULL AND o.reference_balance > 0
        GROUP BY o.supplier_id, o.currency

        UNION ALL

        -- 3. Créditos Libres (reference_balance < 0 y seller_id IS NULL)
        SELECT 
            o.supplier_id,
            o.currency,
            NULL::bigint AS seller_id,
            NULL::varchar AS seller_code,
            'Créditos libres no asignados (OP / Remanentes / NC)'::text AS seller_display_name,
            false AS is_unassigned_debt,
            true AS is_free_credit,
            'FREE_CREDIT' AS item_category,
            COUNT(DISTINCT o.document_id)::bigint AS open_doc_count,
            0.00::numeric(15,2) AS total_debit_amount,
            COALESCE(SUM(o.reference_balance), 0.00)::numeric(15,2) AS total_credit_amount,
            COALESCE(SUM(o.reference_balance), 0.00)::numeric(15,2) AS net_balance
        FROM open_refs o
        WHERE o.seller_id IS NULL AND o.reference_balance < 0
        GROUP BY o.supplier_id, o.currency
    )
    SELECT * FROM seller_grouped
    ORDER BY currency, 
             CASE item_category WHEN 'SELLER' THEN 1 WHEN 'UNASSIGNED_DEBT' THEN 2 ELSE 3 END,
             seller_display_name;
$$;

-- 11. RPC: Aging por Vendedor (rpc_get_seller_aging)
CREATE OR REPLACE FUNCTION rpc_get_seller_aging(
    p_cutoff_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    seller_id bigint,
    seller_code varchar,
    seller_display_name text,
    currency varchar,
    overdue_gt_60 numeric(15,2),
    overdue_31_60 numeric(15,2),
    overdue_1_30 numeric(15,2),
    due_0_30 numeric(15,2),
    due_31_60 numeric(15,2),
    due_gt_60 numeric(15,2),
    no_due_date_amount numeric(15,2),
    total_pending_debt numeric(15,2),
    net_total_balance numeric(15,2),
    active_suppliers_count bigint
)
LANGUAGE sql
STABLE
AS $$
    WITH classified AS (
        SELECT 
            b.seller_id,
            b.seller_code,
            b.seller_display_name,
            b.currency,
            b.supplier_id,
            b.reference_balance,
            CASE 
                WHEN b.reference_balance > 0 AND b.due_date IS NULL THEN 'NO_DUE_DATE'
                WHEN b.reference_balance > 0 AND b.due_date < (p_cutoff_date - 60) THEN 'OVERDUE_GT_60'
                WHEN b.reference_balance > 0 AND b.due_date >= (p_cutoff_date - 60) AND b.due_date <= (p_cutoff_date - 31) THEN 'OVERDUE_31_60'
                WHEN b.reference_balance > 0 AND b.due_date >= (p_cutoff_date - 30) AND b.due_date <= (p_cutoff_date - 1) THEN 'OVERDUE_1_30'
                WHEN b.reference_balance > 0 AND b.due_date >= p_cutoff_date AND b.due_date <= (p_cutoff_date + 30) THEN 'DUE_0_30'
                WHEN b.reference_balance > 0 AND b.due_date >= (p_cutoff_date + 31) AND b.due_date <= (p_cutoff_date + 60) THEN 'DUE_31_60'
                WHEN b.reference_balance > 0 AND b.due_date > (p_cutoff_date + 60) THEN 'DUE_GT_60'
                ELSE 'OTHER'
            END AS bucket_category
        FROM v_open_reference_balances b
        WHERE b.seller_id IS NOT NULL -- Solo referencias atribuidas a vendedores
    )
    SELECT 
        c.seller_id,
        c.seller_code,
        c.seller_display_name,
        c.currency,
        COALESCE(SUM(CASE WHEN c.bucket_category = 'OVERDUE_GT_60' THEN c.reference_balance ELSE 0 END), 0.00) AS overdue_gt_60,
        COALESCE(SUM(CASE WHEN c.bucket_category = 'OVERDUE_31_60' THEN c.reference_balance ELSE 0 END), 0.00) AS overdue_31_60,
        COALESCE(SUM(CASE WHEN c.bucket_category = 'OVERDUE_1_30' THEN c.reference_balance ELSE 0 END), 0.00) AS overdue_1_30,
        COALESCE(SUM(CASE WHEN c.bucket_category = 'DUE_0_30' THEN c.reference_balance ELSE 0 END), 0.00) AS due_0_30,
        COALESCE(SUM(CASE WHEN c.bucket_category = 'DUE_31_60' THEN c.reference_balance ELSE 0 END), 0.00) AS due_31_60,
        COALESCE(SUM(CASE WHEN c.bucket_category = 'DUE_GT_60' THEN c.reference_balance ELSE 0 END), 0.00) AS due_gt_60,
        COALESCE(SUM(CASE WHEN c.bucket_category = 'NO_DUE_DATE' THEN c.reference_balance ELSE 0 END), 0.00) AS no_due_date_amount,
        COALESCE(SUM(CASE WHEN c.reference_balance > 0 THEN c.reference_balance ELSE 0 END), 0.00) AS total_pending_debt,
        COALESCE(SUM(c.reference_balance), 0.00) AS net_total_balance,
        COUNT(DISTINCT c.supplier_id)::bigint AS active_suppliers_count
    FROM classified c
    GROUP BY c.seller_id, c.seller_code, c.seller_display_name, c.currency
    ORDER BY c.seller_display_name, c.currency;
$$;

-- 12. RPC: Proyección de Pagos por Vendedor (rpc_get_seller_payment_projection)
CREATE OR REPLACE FUNCTION rpc_get_seller_payment_projection(
    p_cutoff_date date DEFAULT CURRENT_DATE,
    p_date_from date DEFAULT NULL,
    p_date_to date DEFAULT NULL
)
RETURNS TABLE (
    seller_id bigint,
    seller_code varchar,
    seller_display_name text,
    currency varchar,
    bucket_type text,
    week_start date,
    week_end date,
    amount numeric(15,2),
    doc_count bigint,
    suppliers_count bigint
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    IF p_date_from IS NOT NULL AND p_date_to IS NOT NULL AND p_date_from > p_date_to THEN
        RAISE EXCEPTION 'Rango de fechas inválido: p_date_from (%) debe ser menor o igual a p_date_to (%)', p_date_from, p_date_to;
    END IF;

    RETURN QUERY
    WITH filtered_debt AS (
        SELECT 
            b.seller_id,
            b.seller_code,
            b.seller_display_name,
            b.supplier_id,
            b.currency,
            b.due_date,
            b.reference_balance
        FROM v_open_reference_balances b
        WHERE b.seller_id IS NOT NULL
          AND b.reference_balance > 0
          AND (
            (p_date_from IS NULL AND p_date_to IS NULL)
            OR
            (
                b.due_date IS NOT NULL 
                AND b.due_date >= COALESCE(p_date_from, '-infinity'::DATE)
                AND b.due_date <= COALESCE(p_date_to, 'infinity'::DATE)
            )
          )
    ),
    bucketed AS (
        SELECT 
            f.seller_id,
            f.seller_code,
            f.seller_display_name,
            f.supplier_id,
            f.currency,
            f.reference_balance,
            CASE 
                WHEN f.due_date IS NULL THEN 'NO_DUE_DATE'
                WHEN f.due_date < p_cutoff_date THEN 'OVERDUE'
                ELSE 'WEEK'
            END AS b_type,
            CASE 
                WHEN f.due_date >= p_cutoff_date THEN DATE_TRUNC('week', f.due_date)::DATE
                ELSE NULL
            END AS w_start,
            CASE 
                WHEN f.due_date >= p_cutoff_date THEN (DATE_TRUNC('week', f.due_date) + INTERVAL '6 days')::DATE
                ELSE NULL
            END AS w_end
        FROM filtered_debt f
    )
    SELECT 
        k.seller_id,
        k.seller_code,
        k.seller_display_name,
        k.currency,
        k.b_type AS bucket_type,
        k.w_start AS week_start,
        k.w_end AS week_end,
        SUM(k.reference_balance)::NUMERIC(15,2) AS amount,
        COUNT(*)::BIGINT AS doc_count,
        COUNT(DISTINCT k.supplier_id)::BIGINT AS suppliers_count
    FROM bucketed k
    GROUP BY k.seller_id, k.seller_code, k.seller_display_name, k.currency, k.b_type, k.w_start, k.w_end
    ORDER BY 
        k.seller_display_name, 
        k.currency, 
        CASE k.b_type WHEN 'OVERDUE' THEN 1 WHEN 'WEEK' THEN 2 WHEN 'NO_DUE_DATE' THEN 3 ELSE 4 END,
        k.w_start;
END;
$$;

-- 13. RPC: Drilldown de Documentos por Vendedor (rpc_get_seller_documents_detail)
CREATE OR REPLACE FUNCTION rpc_get_seller_documents_detail(
    p_seller_id bigint,
    p_currency varchar,
    p_context text, -- 'AGING' or 'PROJECTION' or 'ALL'
    p_bucket_code text DEFAULT NULL,
    p_cutoff_date date DEFAULT CURRENT_DATE,
    p_week_start date DEFAULT NULL,
    p_date_from date DEFAULT NULL,
    p_date_to date DEFAULT NULL
)
RETURNS TABLE (
    document_id bigint,
    supplier_id bigint,
    supplier_trade_name text,
    seller_id bigint,
    seller_display_name text,
    human_reference varchar,
    document_type_code varchar,
    document_type_name varchar,
    balance_nature varchar,
    issue_date date,
    due_date date,
    currency varchar,
    total_amount numeric(15,2),
    reference_balance numeric(15,2),
    concept text,
    notes text
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    IF p_context = 'AGING' THEN
        RETURN QUERY
        SELECT 
            b.document_id,
            b.supplier_id,
            b.supplier_trade_name,
            b.seller_id,
            b.seller_display_name,
            b.human_reference,
            b.document_type_code,
            b.document_type_name,
            b.balance_nature::varchar,
            b.issue_date,
            b.due_date,
            b.currency,
            b.total_amount,
            b.reference_balance,
            b.concept,
            b.notes
        FROM v_open_reference_balances b
        WHERE b.seller_id = p_seller_id
          AND b.currency = p_currency
          AND (
            p_bucket_code IS NULL OR p_bucket_code = 'ALL' OR
            (p_bucket_code = 'NO_DUE_DATE' AND b.reference_balance > 0 AND b.due_date IS NULL) OR
            (p_bucket_code = 'OVERDUE_GT_60' AND b.reference_balance > 0 AND b.due_date < (p_cutoff_date - 60)) OR
            (p_bucket_code = 'OVERDUE_31_60' AND b.reference_balance > 0 AND b.due_date >= (p_cutoff_date - 60) AND b.due_date <= (p_cutoff_date - 31)) OR
            (p_bucket_code = 'OVERDUE_1_30' AND b.reference_balance > 0 AND b.due_date >= (p_cutoff_date - 30) AND b.due_date <= (p_cutoff_date - 1)) OR
            (p_bucket_code = 'DUE_0_30' AND b.reference_balance > 0 AND b.due_date >= p_cutoff_date AND b.due_date <= (p_cutoff_date + 30)) OR
            (p_bucket_code = 'DUE_31_60' AND b.reference_balance > 0 AND b.due_date >= (p_cutoff_date + 31) AND b.due_date <= (p_cutoff_date + 60)) OR
            (p_bucket_code = 'DUE_GT_60' AND b.reference_balance > 0 AND b.due_date > (p_cutoff_date + 60)) OR
            (p_bucket_code = 'FREE_CREDIT' AND b.reference_balance < 0)
          )
        ORDER BY b.due_date NULLS LAST, b.issue_date, b.document_id;

    ELSIF p_context = 'PROJECTION' THEN
        RETURN QUERY
        SELECT 
            b.document_id,
            b.supplier_id,
            b.supplier_trade_name,
            b.seller_id,
            b.seller_display_name,
            b.human_reference,
            b.document_type_code,
            b.document_type_name,
            b.balance_nature::varchar,
            b.issue_date,
            b.due_date,
            b.currency,
            b.total_amount,
            b.reference_balance,
            b.concept,
            b.notes
        FROM v_open_reference_balances b
        WHERE b.seller_id = p_seller_id
          AND b.currency = p_currency
          AND b.reference_balance > 0
          AND (
            (p_date_from IS NULL AND p_date_to IS NULL)
            OR
            (
                b.due_date IS NOT NULL 
                AND b.due_date >= COALESCE(p_date_from, '-infinity'::DATE)
                AND b.due_date <= COALESCE(p_date_to, 'infinity'::DATE)
            )
          )
          AND (
            (p_bucket_code = 'NO_DUE_DATE' AND b.due_date IS NULL) OR
            (p_bucket_code = 'OVERDUE' AND b.due_date IS NOT NULL AND b.due_date < p_cutoff_date) OR
            (p_bucket_code = 'WEEK' AND b.due_date IS NOT NULL AND b.due_date >= p_cutoff_date AND DATE_TRUNC('week', b.due_date)::DATE = p_week_start) OR
            (p_bucket_code = 'ALL')
          )
        ORDER BY b.due_date NULLS LAST, b.issue_date, b.document_id;

    ELSE -- Context 'ALL' / Por Defecto
        RETURN QUERY
        SELECT 
            b.document_id,
            b.supplier_id,
            b.supplier_trade_name,
            b.seller_id,
            b.seller_display_name,
            b.human_reference,
            b.document_type_code,
            b.document_type_name,
            b.balance_nature::varchar,
            b.issue_date,
            b.due_date,
            b.currency,
            b.total_amount,
            b.reference_balance,
            b.concept,
            b.notes
        FROM v_open_reference_balances b
        WHERE b.seller_id = p_seller_id
          AND (p_currency IS NULL OR b.currency = p_currency)
        ORDER BY b.due_date NULLS LAST, b.issue_date, b.document_id;
    END IF;
END;
$$;

-- 14. RPC: Resumen de Proveedores y Saldos de un Vendedor (rpc_get_seller_suppliers_summary)
CREATE OR REPLACE FUNCTION rpc_get_seller_suppliers_summary(
    p_seller_id bigint
)
RETURNS TABLE (
    supplier_id bigint,
    supplier_code varchar,
    supplier_trade_name text,
    supplier_tax_id varchar,
    currency varchar,
    relationship_id bigint,
    relationship_active boolean,
    valid_from date,
    valid_to date,
    open_doc_count bigint,
    pending_debt numeric(15,2),
    available_credit numeric(15,2),
    net_balance numeric(15,2)
)
LANGUAGE sql
STABLE
AS $$
    WITH rels AS (
        SELECT 
            ss.id AS rel_id,
            ss.supplier_id,
            ss.is_active AS rel_active,
            ss.valid_from AS r_valid_from,
            ss.valid_to AS r_valid_to
        FROM supplier_sellers ss
        WHERE ss.seller_id = p_seller_id
    ),
    doc_balances AS (
        SELECT 
            b.supplier_id,
            b.currency,
            COUNT(DISTINCT b.document_id)::bigint AS d_count,
            COALESCE(SUM(CASE WHEN b.reference_balance > 0 THEN b.reference_balance ELSE 0 END), 0.00)::numeric(15,2) AS p_debt,
            COALESCE(SUM(CASE WHEN b.reference_balance < 0 THEN b.reference_balance ELSE 0 END), 0.00)::numeric(15,2) AS a_cred,
            COALESCE(SUM(b.reference_balance), 0.00)::numeric(15,2) AS n_bal
        FROM v_open_reference_balances b
        WHERE b.seller_id = p_seller_id
        GROUP BY b.supplier_id, b.currency
    )
    SELECT 
        s.id AS supplier_id,
        s.code AS supplier_code,
        s.trade_name AS supplier_trade_name,
        s.tax_id AS supplier_tax_id,
        COALESCE(db.currency, 'ARS') AS currency,
        r.rel_id AS relationship_id,
        COALESCE(r.rel_active, false) AS relationship_active,
        r.r_valid_from AS valid_from,
        r.r_valid_to AS valid_to,
        COALESCE(db.d_count, 0::bigint) AS open_doc_count,
        COALESCE(db.p_debt, 0.00)::numeric(15,2) AS pending_debt,
        COALESCE(db.a_cred, 0.00)::numeric(15,2) AS available_credit,
        COALESCE(db.n_bal, 0.00)::numeric(15,2) AS net_balance
    FROM suppliers s
    LEFT JOIN rels r ON r.supplier_id = s.id
    LEFT JOIN doc_balances db ON db.supplier_id = s.id
    WHERE r.rel_id IS NOT NULL OR db.d_count > 0
    ORDER BY s.trade_name, currency;
$$;

-- 15. RPC: Operación Server-Side para Finalizar Relación Proveedor-Vendedor
CREATE OR REPLACE FUNCTION rpc_end_supplier_seller_relationship(
    p_relationship_id bigint,
    p_end_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id bigint;
    v_rel record;
BEGIN
    v_user_id := current_app_user_id();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Acceso no autorizado o perfil inactivo.';
    END IF;

    IF NOT has_permission('seller_supplier.manage') THEN
        RAISE EXCEPTION 'Permiso denegado: Se requiere "seller_supplier.manage".';
    END IF;

    SELECT * INTO v_rel FROM supplier_sellers WHERE id = p_relationship_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Relación proveedor-vendedor ID % no encontrada.', p_relationship_id;
    END IF;

    IF p_end_date < v_rel.valid_from THEN
        RAISE EXCEPTION 'La fecha de finalización (%) no puede ser anterior a la fecha de inicio (%).', p_end_date, v_rel.valid_from;
    END IF;

    UPDATE supplier_sellers
    SET valid_to = p_end_date,
        is_active = (p_end_date >= CURRENT_DATE)
    WHERE id = p_relationship_id;

    RETURN jsonb_build_object(
        'success', true,
        'relationship_id', p_relationship_id,
        'valid_to', p_end_date,
        'message', format('Relación finalizada exitosamente con fecha %s. Los documentos históricos permanecen inalterados.', p_end_date)
    );
END;
$$;

-- 16. RPC: Vincular Proveedor y Vendedor
CREATE OR REPLACE FUNCTION rpc_link_supplier_seller(
    p_supplier_id bigint,
    p_seller_id bigint,
    p_valid_from date DEFAULT CURRENT_DATE,
    p_valid_to date DEFAULT NULL,
    p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id bigint;
    v_existing_id bigint;
    v_new_id bigint;
BEGIN
    v_user_id := current_app_user_id();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Acceso no autorizado o perfil inactivo.';
    END IF;

    IF NOT has_permission('seller_supplier.manage') THEN
        RAISE EXCEPTION 'Permiso denegado: Se requiere "seller_supplier.manage".';
    END IF;

    IF p_valid_to IS NOT NULL AND p_valid_to < p_valid_from THEN
        RAISE EXCEPTION 'La fecha de fin (%) no puede ser anterior a la de inicio (%).', p_valid_to, p_valid_from;
    END IF;

    -- Verificar si existe relación activa abierta
    SELECT id INTO v_existing_id
    FROM supplier_sellers
    WHERE supplier_id = p_supplier_id
      AND seller_id = p_seller_id
      AND is_active = true
      AND (valid_to IS NULL OR valid_to >= CURRENT_DATE);

    IF v_existing_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'is_existing', true,
            'relationship_id', v_existing_id,
            'message', 'Ya existe una relación activa vigente entre este proveedor y vendedor.'
        );
    END IF;

    INSERT INTO supplier_sellers (
        supplier_id, seller_id, valid_from, valid_to, is_active, notes, created_by
    ) VALUES (
        p_supplier_id, p_seller_id, p_valid_from, p_valid_to, true, p_notes, v_user_id
    ) RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success', true,
        'relationship_id', v_new_id,
        'message', 'Vendedor vinculado exitosamente al proveedor.'
    );
END;
$$;

-- 17. Actualización de Validación en RPC rpc_confirm_document para Verificar Vendedor Server-Side
CREATE OR REPLACE FUNCTION rpc_confirm_document(
    p_document_id bigint,
    p_override_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id bigint;
    v_doc record;
    v_matched_doc record;
    v_is_seller_valid boolean;
BEGIN
    v_user_id := current_app_user_id();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Acceso no autorizado o perfil inactivo.';
    END IF;

    IF NOT has_permission('documents.confirm') THEN
        RAISE EXCEPTION 'Permiso denegado: Se requiere "documents.confirm".';
    END IF;

    -- Bloqueo de fila para confirmación atómica
    SELECT * INTO v_doc FROM documents WHERE id = p_document_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Documento ID % no encontrado.', p_document_id;
    END IF;

    IF v_doc.status = 'CONFIRMED' THEN
        RETURN jsonb_build_object('success', true, 'message', 'El documento ya se encontraba confirmado.', 'document_id', v_doc.id);
    END IF;

    -- Validar seller_id si fue asignado server-side
    IF v_doc.seller_id IS NOT NULL THEN
        -- Verificar que el vendedor exista y esté activo globalmente
        IF NOT EXISTS (SELECT 1 FROM sellers WHERE id = v_doc.seller_id AND is_active = true) THEN
            RAISE EXCEPTION 'El vendedor asignado (ID %) no existe o está inactivo globalmente.', v_doc.seller_id;
        END IF;

        -- Verificar que exista relación vigente con el proveedor para la fecha issue_date
        SELECT EXISTS (
            SELECT 1 
            FROM supplier_sellers ss
            WHERE ss.supplier_id = v_doc.supplier_id
              AND ss.seller_id = v_doc.seller_id
              AND ss.is_active = true
              AND ss.valid_from <= v_doc.issue_date
              AND (ss.valid_to IS NULL OR ss.valid_to >= v_doc.issue_date)
        ) INTO v_is_seller_valid;

        IF NOT v_is_seller_valid THEN
            RAISE EXCEPTION 'El vendedor ID % no posee una relación activa vigente con el proveedor ID % para la fecha del comprobante (%).',
                v_doc.seller_id, v_doc.supplier_id, v_doc.issue_date;
        END IF;
    END IF;

    -- Detección de comprobante duplicado si tiene identificación fiscal formal
    IF v_doc.letter IS NOT NULL AND v_doc.point_of_sale IS NOT NULL AND v_doc.document_number IS NOT NULL THEN
        SELECT id, human_reference, issue_date, total_amount, created_at
        INTO v_matched_doc
        FROM documents
        WHERE supplier_id = v_doc.supplier_id
          AND document_type_id = v_doc.document_type_id
          AND letter = v_doc.letter
          AND point_of_sale = v_doc.point_of_sale
          AND document_number = v_doc.document_number
          AND status = 'CONFIRMED'
          AND id <> v_doc.id
        LIMIT 1;

        IF FOUND THEN
            -- Se detectó un duplicado confirmado
            IF p_override_reason IS NULL OR trim(p_override_reason) = '' THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'is_duplicate', true,
                    'matched_document_id', v_matched_doc.id,
                    'matched_human_reference', v_matched_doc.human_reference,
                    'matched_issue_date', v_matched_doc.issue_date,
                    'matched_total_amount', v_matched_doc.total_amount,
                    'message', format('DUPLICADO DETECTADO: Ya existe el comprobante %s (ID %s) registrado para este proveedor. Para forzar la confirmación se requiere motivo de excepción.', v_matched_doc.human_reference, v_matched_doc.id)
                );
            ELSE
                -- Validar permiso para autorizar excepción
                IF NOT has_permission('documents.duplicate_override') THEN
                    RAISE EXCEPTION 'Permiso denegado: No tiene autorización para confirmar comprobantes duplicados ("documents.duplicate_override").';
                END IF;

                -- Registrar en log de auditoría
                INSERT INTO duplicate_override_logs (document_id, matched_document_id, reason, authorized_by)
                VALUES (v_doc.id, v_matched_doc.id, trim(p_override_reason), v_user_id);
            END IF;
        END IF;
    END IF;

    -- Confirmación del documento
    UPDATE documents
    SET status = 'CONFIRMED',
        confirmed_by = v_user_id,
        confirmed_at = clock_timestamp()
    WHERE id = v_doc.id;

    RETURN jsonb_build_object(
        'success', true,
        'document_id', v_doc.id,
        'human_reference', v_doc.human_reference,
        'status', 'CONFIRMED',
        'seller_id', v_doc.seller_id,
        'message', 'Documento confirmado exitosamente e impactado en cuenta corriente.'
    );
END;
$$;

-- 18. RPC: Crear y Confirmar Documento Directamente (con seller_id opcional y validación)
CREATE OR REPLACE FUNCTION rpc_create_and_confirm_document(
    p_supplier_id bigint,
    p_document_type_id smallint,
    p_seller_id bigint DEFAULT NULL,
    p_letter varchar DEFAULT NULL,
    p_point_of_sale integer DEFAULT NULL,
    p_document_number bigint DEFAULT NULL,
    p_human_reference varchar DEFAULT '',
    p_issue_date date DEFAULT CURRENT_DATE,
    p_due_date date DEFAULT NULL,
    p_total_amount numeric DEFAULT 0,
    p_currency varchar DEFAULT 'ARS',
    p_concept text DEFAULT NULL,
    p_notes text DEFAULT NULL,
    p_override_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id bigint;
    v_doc_type record;
    v_new_doc_id bigint;
    v_is_seller_valid boolean;
    v_signed_amount numeric(15,2);
    v_matched_doc record;
BEGIN
    v_user_id := current_app_user_id();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Acceso no autorizado o perfil inactivo.';
    END IF;

    IF NOT has_permission('documents.create') THEN
        RAISE EXCEPTION 'Permiso denegado: Se requiere "documents.create".';
    END IF;

    SELECT * INTO v_doc_type FROM document_types WHERE id = p_document_type_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tipo de documento ID % no encontrado.', p_document_type_id;
    END IF;

    -- Validar seller_id si fue asignado
    IF p_seller_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM sellers WHERE id = p_seller_id AND is_active = true) THEN
            RAISE EXCEPTION 'El vendedor asignado (ID %) no existe o está inactivo globalmente.', p_seller_id;
        END IF;

        SELECT EXISTS (
            SELECT 1 
            FROM supplier_sellers ss
            WHERE ss.supplier_id = p_supplier_id
              AND ss.seller_id = p_seller_id
              AND ss.is_active = true
              AND ss.valid_from <= p_issue_date
              AND (ss.valid_to IS NULL OR ss.valid_to >= p_issue_date)
        ) INTO v_is_seller_valid;

        IF NOT v_is_seller_valid THEN
            RAISE EXCEPTION 'El vendedor ID % no posee una relación activa vigente con el proveedor ID % para la fecha del comprobante (%).',
                p_seller_id, p_supplier_id, p_issue_date;
        END IF;
    END IF;

    -- Detección de duplicados
    IF p_letter IS NOT NULL AND p_point_of_sale IS NOT NULL AND p_document_number IS NOT NULL THEN
        SELECT id, human_reference, issue_date, total_amount
        INTO v_matched_doc
        FROM documents
        WHERE supplier_id = p_supplier_id
          AND document_type_id = p_document_type_id
          AND letter = p_letter
          AND point_of_sale = p_point_of_sale
          AND document_number = p_document_number
          AND status = 'CONFIRMED'
        LIMIT 1;

        IF FOUND THEN
            IF p_override_reason IS NULL OR trim(p_override_reason) = '' THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'is_duplicate', true,
                    'matched_document_id', v_matched_doc.id,
                    'matched_human_reference', v_matched_doc.human_reference,
                    'message', format('DUPLICADO DETECTADO: Ya existe el comprobante %s (ID %s).', v_matched_doc.human_reference, v_matched_doc.id)
                );
            ELSE
                IF NOT has_permission('documents.duplicate_override') THEN
                    RAISE EXCEPTION 'Permiso denegado: Se requiere autorización para registrar comprobantes duplicados.';
                END IF;
            END IF;
        END IF;
    END IF;

    -- Insertar Cabecera en documents
    INSERT INTO documents (
        supplier_id, seller_id, document_type_id, status, letter, point_of_sale, document_number,
        human_reference, issue_date, due_date, currency, total_amount, concept, notes,
        created_by, confirmed_by, confirmed_at
    ) VALUES (
        p_supplier_id, p_seller_id, p_document_type_id, 'CONFIRMED', p_letter, p_point_of_sale, p_document_number,
        p_human_reference, p_issue_date, p_due_date, p_currency, p_total_amount, p_concept, p_notes,
        v_user_id, v_user_id, clock_timestamp()
    ) RETURNING id INTO v_new_doc_id;

    -- Si hubo override de duplicado, registrar auditoría
    IF v_matched_doc.id IS NOT NULL AND p_override_reason IS NOT NULL THEN
        INSERT INTO duplicate_override_logs (document_id, matched_document_id, reason, authorized_by)
        VALUES (v_new_doc_id, v_matched_doc.id, trim(p_override_reason), v_user_id);
    END IF;

    -- Crear renglón ORIGIN en account_movements si afecta saldo
    IF v_doc_type.affects_account_balance THEN
        v_signed_amount := CASE WHEN v_doc_type.balance_nature = 'DEBIT' THEN p_total_amount ELSE -p_total_amount END;
        INSERT INTO account_movements (
            supplier_id, document_id, reference_id, line_number, movement_type, movement_date, currency, amount, notes, created_by
        ) VALUES (
            p_supplier_id, v_new_doc_id, v_new_doc_id, 1, 'ORIGIN', p_issue_date, p_currency, v_signed_amount, p_concept, v_user_id
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'document_id', v_new_doc_id,
        'human_reference', p_human_reference,
        'seller_id', p_seller_id,
        'status', 'CONFIRMED',
        'message', 'Documento creado y confirmado exitosamente.'
    );
END;
$$;

-- 19. RPC: Crear y Confirmar Orden de Pago con Imputación Nativa y Remanente Propio
CREATE OR REPLACE FUNCTION rpc_create_and_confirm_op(
    p_supplier_id bigint,
    p_point_of_sale integer DEFAULT 1,
    p_document_number bigint DEFAULT NULL,
    p_human_reference varchar DEFAULT '',
    p_issue_date date DEFAULT CURRENT_DATE,
    p_total_amount numeric DEFAULT 0,
    p_currency varchar DEFAULT 'ARS',
    p_concept text DEFAULT 'Orden de Pago',
    p_notes text DEFAULT NULL,
    p_imputations jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id bigint;
    v_op_type_id smallint;
    v_op_doc_id bigint;
    v_imp jsonb;
    v_target_doc_id bigint;
    v_applied_amt numeric(15,2);
    v_total_imputed numeric(15,2) := 0.00;
    v_remainder numeric(15,2) := 0.00;
    v_line_no smallint := 1;
BEGIN
    v_user_id := current_app_user_id();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Acceso no autorizado o perfil inactivo.';
    END IF;

    IF NOT has_permission('documents.create') THEN
        RAISE EXCEPTION 'Permiso denegado: Se requiere "documents.create".';
    END IF;

    SELECT id INTO v_op_type_id FROM document_types WHERE code = 'ORDEN_PAGO' LIMIT 1;
    IF v_op_type_id IS NULL THEN
        RAISE EXCEPTION 'Tipo de documento ORDEN_PAGO no configurado.';
    END IF;

    IF p_total_amount <= 0 THEN
        RAISE EXCEPTION 'El importe total de la Orden de Pago debe ser mayor a 0.';
    END IF;

    -- Calcular total imputado
    FOR v_imp IN SELECT * FROM jsonb_array_elements(p_imputations)
    LOOP
        v_applied_amt := (v_imp->>'applied_amount')::numeric;
        IF v_applied_amt > 0 THEN
            v_total_imputed := v_total_imputed + v_applied_amt;
        END IF;
    END LOOP;

    IF v_total_imputed > p_total_amount THEN
        RAISE EXCEPTION 'El total imputado ($%) no puede superar el total de la OP ($%).', v_total_imputed, p_total_amount;
    END IF;

    v_remainder := p_total_amount - v_total_imputed;

    -- 1. Insertar OP en documents (seller_id = NULL en cabecera de OP)
    INSERT INTO documents (
        supplier_id, seller_id, document_type_id, status, point_of_sale, document_number,
        human_reference, issue_date, currency, total_amount, concept, notes,
        created_by, confirmed_by, confirmed_at
    ) VALUES (
        p_supplier_id, NULL, v_op_type_id, 'CONFIRMED', p_point_of_sale, p_document_number,
        p_human_reference, p_issue_date, p_currency, p_total_amount, p_concept, p_notes,
        v_user_id, v_user_id, clock_timestamp()
    ) RETURNING id INTO v_op_doc_id;

    -- 2. Insertar renglones de imputación nativa
    FOR v_imp IN SELECT * FROM jsonb_array_elements(p_imputations)
    LOOP
        v_target_doc_id := (v_imp->>'target_document_id')::bigint;
        v_applied_amt := (v_imp->>'applied_amount')::numeric;

        IF v_applied_amt > 0 THEN
            INSERT INTO account_movements (
                supplier_id, document_id, reference_id, line_number, movement_type, movement_date, currency, amount, notes, created_by
            ) VALUES (
                p_supplier_id, v_op_doc_id, v_target_doc_id, v_line_no, 'IMPUTATION', p_issue_date, p_currency, -v_applied_amt, format('Imputación nativa de %s', p_human_reference), v_user_id
            );
            v_line_no := v_line_no + 1;
        END IF;
    END LOOP;

    -- 3. Insertar renglón de remanente propio libre si quedó saldo
    IF v_remainder > 0 THEN
        INSERT INTO account_movements (
            supplier_id, document_id, reference_id, line_number, movement_type, movement_date, currency, amount, notes, created_by
        ) VALUES (
            p_supplier_id, v_op_doc_id, v_op_doc_id, v_line_no, CASE WHEN v_total_imputed = 0 THEN 'ORIGIN' ELSE 'REMAINDER' END,
            p_issue_date, p_currency, -v_remainder, format('Remanente propio libre de %s', p_human_reference), v_user_id
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'document_id', v_op_doc_id,
        'human_reference', p_human_reference,
        'total_amount', p_total_amount,
        'total_imputed', v_total_imputed,
        'remainder', v_remainder,
        'message', 'Orden de Pago creada y confirmada exitosamente.'
    );
END;
$$;

-- 20. RPC: Aplicar Saldo Existente mediante Documento APL (Transferencia Suma Cero)
CREATE OR REPLACE FUNCTION rpc_apply_existing_balance(
    p_source_document_id bigint,
    p_target_applications jsonb,
    p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id bigint;
    v_source record;
    v_apl_type_id smallint;
    v_apl_doc_id bigint;
    v_human_ref varchar(100);
    v_app jsonb;
    v_target_id bigint;
    v_amount numeric(15,2);
    v_total_to_apply numeric(15,2) := 0.00;
    v_line_no smallint := 1;
BEGIN
    v_user_id := current_app_user_id();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Acceso no autorizado o perfil inactivo.';
    END IF;

    IF NOT has_permission('applications.create') THEN
        RAISE EXCEPTION 'Permiso denegado: Se requiere "applications.create".';
    END IF;

    SELECT * INTO v_source FROM documents WHERE id = p_source_document_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Documento origen ID % no encontrado.', p_source_document_id;
    END IF;

    SELECT id INTO v_apl_type_id FROM document_types WHERE code = 'APL' LIMIT 1;
    IF v_apl_type_id IS NULL THEN
        INSERT INTO document_types (code, name, description, balance_nature, affects_account_balance, is_system_internal)
        VALUES ('APL', 'Documento de Aplicación', 'Transferencia de saldos entre referencias', 'NEUTRAL', false, true)
        RETURNING id INTO v_apl_type_id;
    END IF;

    -- Calcular total a aplicar
    FOR v_app IN SELECT * FROM jsonb_array_elements(p_target_applications)
    LOOP
        v_amount := (v_app->>'applied_amount')::numeric;
        IF v_amount > 0 THEN
            v_total_to_apply := v_total_to_apply + v_amount;
        END IF;
    END LOOP;

    IF v_total_to_apply <= 0 THEN
        RAISE EXCEPTION 'Debe aplicar al menos un importe mayor a 0.';
    END IF;

    v_human_ref := format('APL-%s-%s', v_source.id, to_char(clock_timestamp(), 'HH24MISS'));

    -- 1. Crear documento APL (seller_id = NULL)
    INSERT INTO documents (
        supplier_id, seller_id, document_type_id, status, human_reference,
        issue_date, currency, total_amount, concept, notes,
        created_by, confirmed_by, confirmed_at
    ) VALUES (
        v_source.supplier_id, NULL, v_apl_type_id, 'CONFIRMED', v_human_ref,
        CURRENT_DATE, v_source.currency, 0.00, format('Aplicación de saldo de %s', v_source.human_reference), p_notes,
        v_user_id, v_user_id, clock_timestamp()
    ) RETURNING id INTO v_apl_doc_id;

    -- 2. Renglón 1: +total_to_apply a la referencia origen (consume el crédito origen)
    INSERT INTO account_movements (
        supplier_id, document_id, reference_id, line_number, movement_type, movement_date, currency, amount, notes, created_by
    ) VALUES (
        v_source.supplier_id, v_apl_doc_id, v_source.id, v_line_no, 'APL_TRANSFER', CURRENT_DATE, v_source.currency, v_total_to_apply, format('Consume crédito de %s', v_source.human_reference), v_user_id
    );
    v_line_no := v_line_no + 1;

    -- 3. Renglones N: -monto a cada referencia destino (cancela la deuda de esa referencia)
    FOR v_app IN SELECT * FROM jsonb_array_elements(p_target_applications)
    LOOP
        v_target_id := (v_app->>'target_document_id')::bigint;
        v_amount := (v_app->>'applied_amount')::numeric;

        IF v_amount > 0 THEN
            INSERT INTO account_movements (
                supplier_id, document_id, reference_id, line_number, movement_type, movement_date, currency, amount, notes, created_by
            ) VALUES (
                v_source.supplier_id, v_apl_doc_id, v_target_id, v_line_no, 'APL_TRANSFER', CURRENT_DATE, v_source.currency, -v_amount, format('Aplica crédito de %s', v_source.human_reference), v_user_id
            );
            v_line_no := v_line_no + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'document_id', v_apl_doc_id,
        'human_reference', v_human_ref,
        'total_applied', v_total_to_apply,
        'message', 'Aplicación APL registrada exitosamente con suma cero.'
    );
END;
$$;

