-- ============================================================================
-- MIGRATION: Aging & Payment Projection (v3.1)
-- ============================================================================

-- 1. Justified Performance Indexes
CREATE INDEX IF NOT EXISTS idx_documents_supp_curr_due 
  ON documents (supplier_id, currency, due_date);

CREATE INDEX IF NOT EXISTS idx_account_movements_ref_curr 
  ON account_movements (reference_id, currency);

-- 2. Base View: v_open_reference_balances
-- Single canonical source of truth for open references
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
JOIN ref_totals r ON r.reference_id = d.id AND r.currency = d.currency
WHERE r.reference_balance <> 0.00;

-- 3. RPC: rpc_get_supplier_aging
-- Grouped by supplier_id + currency with strict 30/60 buckets, free credits and total reconciliation
CREATE OR REPLACE FUNCTION rpc_get_supplier_aging(
  p_cutoff_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  supplier_id BIGINT,
  supplier_trade_name TEXT,
  supplier_tax_id VARCHAR,
  currency VARCHAR,
  overdue_gt_60 NUMERIC(15,2),
  overdue_31_60 NUMERIC(15,2),
  overdue_1_30 NUMERIC(15,2),
  due_0_30 NUMERIC(15,2),
  due_31_60 NUMERIC(15,2),
  due_gt_60 NUMERIC(15,2),
  no_due_date_amount NUMERIC(15,2),
  free_credits_amount NUMERIC(15,2),
  total_pending_debt NUMERIC(15,2),
  net_total_balance NUMERIC(15,2)
)
LANGUAGE sql
STABLE
AS $$
  WITH classified AS (
    SELECT 
      b.supplier_id,
      b.supplier_trade_name,
      b.supplier_tax_id,
      b.currency,
      b.reference_balance,
      CASE 
        WHEN b.reference_balance > 0 AND b.due_date IS NULL THEN 'NO_DUE_DATE'
        WHEN b.reference_balance > 0 AND b.due_date < (p_cutoff_date - 60) THEN 'OVERDUE_GT_60'
        WHEN b.reference_balance > 0 AND b.due_date >= (p_cutoff_date - 60) AND b.due_date <= (p_cutoff_date - 31) THEN 'OVERDUE_31_60'
        WHEN b.reference_balance > 0 AND b.due_date >= (p_cutoff_date - 30) AND b.due_date <= (p_cutoff_date - 1) THEN 'OVERDUE_1_30'
        WHEN b.reference_balance > 0 AND b.due_date >= p_cutoff_date AND b.due_date <= (p_cutoff_date + 30) THEN 'DUE_0_30'
        WHEN b.reference_balance > 0 AND b.due_date >= (p_cutoff_date + 31) AND b.due_date <= (p_cutoff_date + 60) THEN 'DUE_31_60'
        WHEN b.reference_balance > 0 AND b.due_date > (p_cutoff_date + 60) THEN 'DUE_GT_60'
        WHEN b.reference_balance < 0 THEN 'FREE_CREDIT'
        ELSE 'OTHER'
      END AS bucket_category
    FROM v_open_reference_balances b
  )
  SELECT 
    c.supplier_id,
    c.supplier_trade_name,
    c.supplier_tax_id,
    c.currency,
    COALESCE(SUM(CASE WHEN c.bucket_category = 'OVERDUE_GT_60' THEN c.reference_balance ELSE 0 END), 0.00) AS overdue_gt_60,
    COALESCE(SUM(CASE WHEN c.bucket_category = 'OVERDUE_31_60' THEN c.reference_balance ELSE 0 END), 0.00) AS overdue_31_60,
    COALESCE(SUM(CASE WHEN c.bucket_category = 'OVERDUE_1_30' THEN c.reference_balance ELSE 0 END), 0.00) AS overdue_1_30,
    COALESCE(SUM(CASE WHEN c.bucket_category = 'DUE_0_30' THEN c.reference_balance ELSE 0 END), 0.00) AS due_0_30,
    COALESCE(SUM(CASE WHEN c.bucket_category = 'DUE_31_60' THEN c.reference_balance ELSE 0 END), 0.00) AS due_31_60,
    COALESCE(SUM(CASE WHEN c.bucket_category = 'DUE_GT_60' THEN c.reference_balance ELSE 0 END), 0.00) AS due_gt_60,
    COALESCE(SUM(CASE WHEN c.bucket_category = 'NO_DUE_DATE' THEN c.reference_balance ELSE 0 END), 0.00) AS no_due_date_amount,
    COALESCE(SUM(CASE WHEN c.bucket_category = 'FREE_CREDIT' THEN c.reference_balance ELSE 0 END), 0.00) AS free_credits_amount,
    COALESCE(SUM(CASE WHEN c.reference_balance > 0 THEN c.reference_balance ELSE 0 END), 0.00) AS total_pending_debt,
    COALESCE(SUM(c.reference_balance), 0.00) AS net_total_balance
  FROM classified c
  GROUP BY c.supplier_id, c.supplier_trade_name, c.supplier_tax_id, c.currency
  ORDER BY c.supplier_trade_name, c.currency;
$$;

-- 4. RPC: rpc_get_payment_projection
-- Normalized structure: bucket_type in ('OVERDUE', 'WEEK', 'NO_DUE_DATE')
CREATE OR REPLACE FUNCTION rpc_get_payment_projection(
  p_cutoff_date DATE DEFAULT CURRENT_DATE,
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL
)
RETURNS TABLE (
  supplier_id BIGINT,
  supplier_trade_name TEXT,
  supplier_tax_id VARCHAR,
  currency VARCHAR,
  bucket_type TEXT,
  week_start DATE,
  week_end DATE,
  amount NUMERIC(15,2),
  doc_count BIGINT
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
      b.supplier_id,
      b.supplier_trade_name,
      b.supplier_tax_id,
      b.currency,
      b.due_date,
      b.reference_balance
    FROM v_open_reference_balances b
    WHERE b.reference_balance > 0 -- Solo obligaciones reales de pago
      AND (
        -- Sin filtro de fechas: incluye toda la deuda pendiente
        (p_date_from IS NULL AND p_date_to IS NULL)
        OR
        -- Con filtro de fechas: solo due_date dentro del intervalo (excluye due_date IS NULL)
        (
          b.due_date IS NOT NULL 
          AND b.due_date >= COALESCE(p_date_from, '-infinity'::DATE)
          AND b.due_date <= COALESCE(p_date_to, 'infinity'::DATE)
        )
      )
  ),
  bucketed AS (
    SELECT 
      f.supplier_id,
      f.supplier_trade_name,
      f.supplier_tax_id,
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
    k.supplier_id,
    k.supplier_trade_name,
    k.supplier_tax_id,
    k.currency,
    k.b_type AS bucket_type,
    k.w_start AS week_start,
    k.w_end AS week_end,
    SUM(k.reference_balance)::NUMERIC(15,2) AS amount,
    COUNT(*)::BIGINT AS doc_count
  FROM bucketed k
  GROUP BY k.supplier_id, k.supplier_trade_name, k.supplier_tax_id, k.currency, k.b_type, k.w_start, k.w_end
  ORDER BY 
    k.supplier_trade_name, 
    k.currency, 
    CASE k.b_type WHEN 'OVERDUE' THEN 1 WHEN 'WEEK' THEN 2 WHEN 'NO_DUE_DATE' THEN 3 ELSE 4 END,
    k.w_start;
END;
$$;

-- 5. RPC: rpc_get_open_documents_detail
-- Drilldown to inspect single documents for any cell/bucket in Aging or Projection
CREATE OR REPLACE FUNCTION rpc_get_open_documents_detail(
  p_supplier_id BIGINT,
  p_currency VARCHAR,
  p_context TEXT, -- 'AGING' or 'PROJECTION'
  p_bucket_code TEXT DEFAULT NULL, -- 'OVERDUE_GT_60', 'OVERDUE_31_60', 'OVERDUE_1_30', 'DUE_0_30', 'DUE_31_60', 'DUE_GT_60', 'NO_DUE_DATE', 'FREE_CREDIT', 'ALL'
  p_cutoff_date DATE DEFAULT CURRENT_DATE,
  p_week_start DATE DEFAULT NULL,
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL
)
RETURNS TABLE (
  document_id BIGINT,
  supplier_id BIGINT,
  supplier_trade_name TEXT,
  human_reference VARCHAR,
  document_type_code VARCHAR,
  document_type_name VARCHAR,
  balance_nature VARCHAR,
  issue_date DATE,
  due_date DATE,
  currency VARCHAR,
  total_amount NUMERIC(15,2),
  reference_balance NUMERIC(15,2),
  concept TEXT,
  notes TEXT
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
      b.human_reference,
      b.document_type_code,
      b.document_type_name,
      b.balance_nature::VARCHAR,
      b.issue_date,
      b.due_date,
      b.currency,
      b.total_amount,
      b.reference_balance,
      b.concept,
      b.notes
    FROM v_open_reference_balances b
    WHERE b.supplier_id = p_supplier_id
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

  ELSE -- p_context = 'PROJECTION'
    RETURN QUERY
    SELECT 
      b.document_id,
      b.supplier_id,
      b.supplier_trade_name,
      b.human_reference,
      b.document_type_code,
      b.document_type_name,
      b.balance_nature::VARCHAR,
      b.issue_date,
      b.due_date,
      b.currency,
      b.total_amount,
      b.reference_balance,
      b.concept,
      b.notes
    FROM v_open_reference_balances b
    WHERE b.supplier_id = p_supplier_id
      AND b.currency = p_currency
      AND b.reference_balance > 0 -- Solo deudas
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
        (p_bucket_code IS NULL OR p_bucket_code = 'ALL')
      )
    ORDER BY b.due_date NULLS LAST, b.issue_date, b.document_id;
  END IF;
END;
$$;
