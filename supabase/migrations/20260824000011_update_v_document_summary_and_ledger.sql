-- ============================================================================
-- MIGRACIÓN 11: Actualizar vistas v_document_summary y v_document_ledger con seller_id
-- Fecha: 2026-08-27
-- ============================================================================

-- 1. Actualizar v_document_summary para proyectar seller_id, seller_code y seller_display_name
DROP VIEW IF EXISTS v_document_summary CASCADE;

CREATE OR REPLACE VIEW v_document_summary AS
SELECT 
    d.id AS document_id,
    d.supplier_id,
    s.trade_name AS supplier_trade_name,
    s.tax_id AS supplier_tax_id,
    d.seller_id,
    sel.code AS seller_code,
    sel.display_name AS seller_display_name,
    d.document_type_id,
    dt.code AS document_type_code,
    dt.name AS document_type_name,
    dt.balance_nature,
    d.status,
    d.letter,
    d.point_of_sale,
    d.document_number,
    d.human_reference,
    d.issue_date,
    d.due_date,
    d.currency,
    d.total_amount,
    CASE 
        WHEN dt.balance_nature = 'DEBIT' THEN d.total_amount
        WHEN dt.balance_nature = 'CREDIT' THEN -d.total_amount
        ELSE 0.00
    END AS signed_total_amount,
    COALESCE(ref_bal.current_balance, 0.00) AS reference_balance,
    COALESCE(doc_mov.total_emitted, 0.00) AS total_emitted_amount,
    CASE 
        WHEN d.human_reference LIKE 'REV-%' THEN 'REVERSED'
        WHEN dt.code = 'APL' THEN 'APL_TRANSFER'
        WHEN dt.balance_nature = 'DEBIT' AND COALESCE(ref_bal.current_balance, 0.00) = 0.00 THEN 'PAID'
        WHEN dt.balance_nature = 'DEBIT' AND COALESCE(ref_bal.current_balance, 0.00) < d.total_amount THEN 'PARTIAL'
        WHEN dt.balance_nature = 'DEBIT' THEN 'PENDING'
        WHEN dt.balance_nature = 'CREDIT' AND COALESCE(ref_bal.current_balance, 0.00) < 0.00 THEN 'AVAILABLE_CREDIT'
        WHEN dt.balance_nature = 'CREDIT' THEN 'SETTLED_CREDIT'
        ELSE 'NEUTRAL'
    END AS derived_status,
    d.concept,
    d.notes,
    d.created_by,
    p.first_name || ' ' || p.last_name AS created_by_name,
    d.created_at
FROM documents d
JOIN suppliers s ON s.id = d.supplier_id
JOIN document_types dt ON dt.id = d.document_type_id
JOIN profiles p ON p.id = d.created_by
LEFT JOIN sellers sel ON sel.id = d.seller_id
LEFT JOIN (
    SELECT reference_id, SUM(amount) AS current_balance
    FROM account_movements
    GROUP BY reference_id
) ref_bal ON ref_bal.reference_id = d.id
LEFT JOIN (
    SELECT document_id, SUM(amount) AS total_emitted
    FROM account_movements
    GROUP BY document_id
) doc_mov ON doc_mov.document_id = d.id;


-- 2. Actualizar v_document_ledger para proyectar seller de referencia y seller de documento
DROP VIEW IF EXISTS v_document_ledger CASCADE;

CREATE OR REPLACE VIEW v_document_ledger AS
SELECT 
    m.id AS movement_id,
    m.supplier_id,
    s.trade_name AS supplier_trade_name,
    s.tax_id AS supplier_tax_id,
    m.movement_date,
    m.movement_type,
    m.currency,
    m.amount,
    SUM(m.amount) OVER (PARTITION BY m.supplier_id, m.currency ORDER BY m.movement_date, m.id) AS running_balance,
    m.document_id,
    doc.human_reference AS document_human_ref,
    doc_t.code AS document_type_code,
    doc_t.name AS document_type_name,
    doc.seller_id AS document_seller_id,
    m.reference_id,
    ref_doc.human_reference AS reference_human_ref,
    ref_t.code AS reference_type_code,
    ref_t.name AS reference_type_name,
    ref_doc.seller_id AS reference_seller_id,
    ref_sel.code AS reference_seller_code,
    ref_sel.display_name AS reference_seller_name,
    m.notes,
    m.created_by,
    p.first_name || ' ' || p.last_name AS created_by_name,
    m.created_at
FROM account_movements m
JOIN suppliers s ON s.id = m.supplier_id
JOIN documents doc ON doc.id = m.document_id
JOIN document_types doc_t ON doc_t.id = doc.document_type_id
JOIN documents ref_doc ON ref_doc.id = m.reference_id
JOIN document_types ref_t ON ref_t.id = ref_doc.document_type_id
LEFT JOIN sellers ref_sel ON ref_sel.id = ref_doc.seller_id
JOIN profiles p ON p.id = m.created_by;
