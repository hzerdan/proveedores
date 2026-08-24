import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { DocumentSummaryView, DocumentLedgerView, Supplier, SupplierAccountSummary } from '../../types/database';
import { useAuth } from '../../context/AuthContext';
import { formatDate, formatMoney } from '../../lib/formatters';
import {
  Building2,
  Plus,
  CheckCircle2,
  Clock,
  RotateCcw,
  Layers,
  Undo2,
  FolderTree,
  List,
  ArrowDownRight,
  Wallet,
  Receipt,
  FileText,
  History,
} from 'lucide-react';

interface AccountStatementProps {
  selectedSupplierId?: number | null;
  onSelectSupplier: (id: number) => void;
  onNewDocument: (supplierId?: number) => void;
  onNewPaymentOrder: (supplierId?: number) => void;
  onApplyBalance: (doc: DocumentSummaryView) => void;
  onReverseDocument: (doc: DocumentSummaryView) => void;
  onDesimpute: (supplierId: number) => void;
  onViewDocumentDetail: (docId: number) => void;
  onViewReferenceMovements: (refId: number) => void;
}

export const AccountStatement: React.FC<AccountStatementProps> = ({
  selectedSupplierId,
  onSelectSupplier,
  onNewDocument,
  onNewPaymentOrder,
  onApplyBalance,
  onReverseDocument,
  onDesimpute,
  onViewDocumentDetail,
  onViewReferenceMovements,
}) => {
  const { hasPermission } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [summaries, setSummaries] = useState<SupplierAccountSummary[]>([]);
  const [selectedCurrency, setSelectedCurrency] = useState<string>('ARS');
  const [documents, setDocuments] = useState<DocumentSummaryView[]>([]);
  const [ledgerMovements, setLedgerMovements] = useState<DocumentLedgerView[]>([]);

  // View state: 'LEDGER' (Chronological running balance) or 'GROUPED' (One row per logical doc)
  const [viewMode, setViewMode] = useState<'LEDGER' | 'GROUPED'>('LEDGER');
  const [onlyWithBalance, setOnlyWithBalance] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    supabase
      .from('suppliers')
      .select('*')
      .order('trade_name', { ascending: true })
      .then(({ data }) => {
        if (data) setSuppliers(data);
      });
  }, []);

  useEffect(() => {
    if (!selectedSupplierId) {
      setSummaries([]);
      setDocuments([]);
      setLedgerMovements([]);
      return;
    }

    const loadSupplierData = async () => {
      setIsLoading(true);
      try {
        // 1. Account Summaries by currency
        const { data: sumData } = await supabase
          .from('v_supplier_account_summary')
          .select('*')
          .eq('supplier_id', selectedSupplierId);

        setSummaries(sumData || []);

        // Default currency selection
        if (sumData && sumData.length > 0) {
          const hasSelected = sumData.some((s) => s.currency === selectedCurrency);
          if (!hasSelected) {
            const hasARS = sumData.some((s) => s.currency === 'ARS');
            setSelectedCurrency(hasARS ? 'ARS' : sumData[0].currency);
          }
        }

        // 2. Documents Summary (Grouped by document_id)
        const { data: docData, error: docErr } = await supabase
          .from('v_document_summary')
          .select('*')
          .eq('supplier_id', selectedSupplierId)
          .order('issue_date', { ascending: false })
          .order('document_id', { ascending: false });

        if (docErr) throw docErr;
        setDocuments(docData || []);

        // 3. Ledger Movements (Chronological Running Balance partitioned by currency)
        const { data: legData, error: legErr } = await supabase
          .from('v_document_ledger')
          .select('*')
          .eq('supplier_id', selectedSupplierId)
          .order('movement_date', { ascending: true })
          .order('movement_id', { ascending: true });

        if (legErr) throw legErr;
        setLedgerMovements(legData || []);
      } catch (err) {
        console.error('Error fetching account statement:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadSupplierData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSupplierId]);

  // Active summary for current currency
  const summary = summaries.find((s) => s.currency === selectedCurrency) || summaries[0] || null;

  // Available currencies for this supplier
  const supplierCurrencies = Array.from(
    new Set([...summaries.map((s) => s.currency), ...documents.map((d) => d.currency)])
  );

  // Documents and ledger filtered for selected currency
  const currencyDocs = documents.filter((d) => d.currency === selectedCurrency);
  const currencyLedger = ledgerMovements.filter((m) => m.currency === selectedCurrency);

  // Filter available credits (reference_balance < 0) in selected currency
  const availableCredits = currencyDocs.filter((d) => d.reference_balance < 0);

  // Filtered documents for grouped view in selected currency
  const filteredDocs = currencyDocs.filter((d) => {
    if (onlyWithBalance) {
      return d.reference_balance !== 0;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Selector & Actions Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl shadow-black/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="flex-1 sm:w-80">
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Seleccionar Proveedor
            </label>
            <select
              value={selectedSupplierId || ''}
              onChange={(e) => onSelectSupplier(Number(e.target.value))}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white font-medium focus:ring-2 focus:ring-sky-500/50 focus:outline-none"
            >
              <option value="" disabled>
                -- Seleccione un proveedor --
              </option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.trade_name} ({s.tax_id})
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedSupplierId && (
          <div className="flex flex-wrap items-center space-x-2.5 w-full sm:w-auto justify-end">
            {hasPermission('applications.desimpute') && (
              <button
                onClick={() => onDesimpute(selectedSupplierId)}
                className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-slate-300 hover:text-white px-3 py-2 rounded-xl text-xs font-semibold transition-all shadow-sm"
              >
                <Undo2 className="w-4 h-4 text-violet-400" />
                <span>Desimputar</span>
              </button>
            )}

            {hasPermission('documents.create') && (
              <button
                onClick={() => onNewPaymentOrder(selectedSupplierId)}
                className="flex items-center space-x-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-md shadow-emerald-900/30 transition-all"
              >
                <Receipt className="w-4 h-4" />
                <span>+ Orden de Pago</span>
              </button>
            )}

            {hasPermission('documents.create') && (
              <button
                onClick={() => onNewDocument(selectedSupplierId)}
                className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white px-3.5 py-2 rounded-xl text-xs font-semibold transition-all shadow-sm"
              >
                <Plus className="w-4 h-4 text-sky-400" />
                <span>+ Factura / Comprobante</span>
              </button>
            )}
          </div>
        )}
      </div>

      {selectedSupplierId && summary && (
        <>
          {/* Multi-Currency Selector (If Supplier has multiple currencies) */}
          {supplierCurrencies.length > 1 && (
            <div className="flex items-center space-x-2 bg-slate-900/90 border border-slate-800 p-2.5 rounded-2xl w-fit shadow-lg">
              <span className="text-[11px] text-slate-400 font-semibold uppercase px-2">Moneda:</span>
              <div className="flex space-x-1">
                {supplierCurrencies.map((curr) => (
                  <button
                    key={curr}
                    onClick={() => setSelectedCurrency(curr)}
                    className={`px-3 py-1 rounded-xl text-xs font-mono font-bold transition-all ${
                      selectedCurrency === curr
                        ? 'bg-sky-600 text-white shadow-md shadow-sky-500/20'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                    }`}
                  >
                    {curr}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Account Metrics Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Total Facturado (Débitos +)</span>
                <span className="text-[10px] font-mono font-bold bg-slate-800 px-1.5 py-0.5 rounded text-sky-300">
                  {selectedCurrency}
                </span>
              </div>
              <div className="mt-2 text-xl font-bold text-rose-300 font-mono">
                {formatMoney(summary.total_debits)} {selectedCurrency}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">Facturas y ND recibidas</div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Deuda Pendiente de Facturas</span>
                <span className="text-[10px] bg-rose-500/20 text-rose-300 font-bold px-1.5 py-0.5 rounded">
                  POR PAGAR
                </span>
              </div>
              <div className="mt-2 text-xl font-bold text-rose-400 font-mono">
                {formatMoney(summary.total_pending_debt)} {selectedCurrency}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">Saldo a cancelar de facturas</div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Crédito Libre Disponible</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-1.5 py-0.5 rounded">
                  A FAVOR
                </span>
              </div>
              <div className="mt-2 text-xl font-bold text-emerald-400 font-mono">
                {formatMoney(summary.total_available_credit)} {selectedCurrency}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">Anticipos / OPs sin imputar</div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800/80">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Saldo Neto Cuenta Corriente</span>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    summary.net_account_balance < 0
                      ? 'text-emerald-300 bg-emerald-500/20'
                      : summary.net_account_balance > 0
                      ? 'text-rose-300 bg-rose-500/20'
                      : 'text-slate-300 bg-slate-700'
                  }`}
                >
                  {summary.net_account_balance < 0
                    ? 'A FAVOR NUESTRO'
                    : summary.net_account_balance > 0
                    ? 'DEUDA A PAGAR'
                    : 'AL DÍA ($0)'}
                </span>
              </div>
              <div
                className={`mt-2 text-2xl font-bold font-mono ${
                  summary.net_account_balance < 0
                    ? 'text-emerald-400'
                    : summary.net_account_balance > 0
                    ? 'text-rose-400'
                    : 'text-slate-300'
                }`}
              >
                {formatMoney(summary.net_account_balance)} {selectedCurrency}
              </div>
              <div className="mt-1 text-[11px] text-slate-500 font-mono">
                SUM(amount) = {formatMoney(summary.net_account_balance)} {selectedCurrency}
              </div>
            </div>
          </div>

          {/* Banner: Available Credits Notification */}
          {availableCredits.length > 0 && (
            <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 shadow-lg space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-emerald-200">
                      Créditos / Anticipos Libres Disponibles ({selectedCurrency})
                    </h4>
                    <p className="text-[11px] text-emerald-400/80">
                      Saldos a favor listos para transferir a facturas pendientes mediante documento APL
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold bg-emerald-500/20 px-2.5 py-1 rounded-full border border-emerald-500/30">
                  {availableCredits.length} disponible(s)
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                {availableCredits.map((op) => (
                  <div
                    key={op.document_id}
                    className="p-3 rounded-xl bg-slate-900/80 border border-emerald-500/20 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-white font-mono">{op.human_reference}</span>
                        <span className="text-[10px] text-slate-500 font-mono">#{op.document_id}</span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-slate-800 text-emerald-400 font-semibold border border-slate-700">
                          {op.document_type_name}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">
                        Emisión: {formatDate(op.issue_date)} • Importe Facial: {formatMoney(op.total_amount)} {selectedCurrency}
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      <div className="text-right">
                        <span className="text-[9px] text-emerald-400/80 uppercase font-semibold block">
                          Crédito Libre
                        </span>
                        <span className="font-mono font-bold text-emerald-400 text-sm">
                          {formatMoney(Math.abs(op.reference_balance))} {selectedCurrency}
                        </span>
                      </div>

                      {hasPermission('applications.create') && (
                        <button
                          onClick={() => onApplyBalance(op)}
                          className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-md shadow-emerald-900/20 transition-all"
                        >
                          <Layers className="w-3.5 h-3.5" />
                          <span>Transferir (APL)</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Main Account Ledger Section */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl shadow-black/30 p-5 space-y-4">
            {/* View Switcher & Filter Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
              <div className="flex space-x-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60 text-xs">
                <button
                  onClick={() => setViewMode('LEDGER')}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                    viewMode === 'LEDGER'
                      ? 'bg-sky-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <List className="w-4 h-4" />
                  <span>Vista Ledger (Cronológica con Saldo)</span>
                </button>

                <button
                  onClick={() => setViewMode('GROUPED')}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                    viewMode === 'GROUPED'
                      ? 'bg-slate-700 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <FolderTree className="w-4 h-4" />
                  <span>Vista Documentos Agrupados</span>
                </button>
              </div>

              {/* Filter by Balance */}
              <div className="flex items-center space-x-2 text-xs">
                <button
                  onClick={() => setOnlyWithBalance(false)}
                  className={`px-3 py-1.5 rounded-xl font-medium transition-all ${
                    !onlyWithBalance
                      ? 'bg-slate-800 text-white border border-slate-700'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Ver Todos ({viewMode === 'LEDGER' ? currencyLedger.length : currencyDocs.length})
                </button>
                <button
                  onClick={() => setOnlyWithBalance(true)}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                    onlyWithBalance
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  ⚡ Solo con Saldo Pendiente ({currencyDocs.filter((d) => d.reference_balance !== 0).length})
                </button>
              </div>
            </div>

            {/* View 1: LEDGER VIEW (Chronological Flat Table with Running Balance) */}
            {viewMode === 'LEDGER' ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-800/40 text-[10px] uppercase text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="px-3.5 py-3 whitespace-nowrap min-w-[110px]">Fecha</th>
                      <th className="px-3.5 py-3 whitespace-nowrap">ID Mov</th>
                      <th className="px-3.5 py-3">Comprobante Emisor</th>
                      <th className="px-3.5 py-3">Referencia Afectada</th>
                      <th className="px-3.5 py-3 whitespace-nowrap">Tipo Movimiento</th>
                      <th className="px-3.5 py-3 text-right text-rose-300 whitespace-nowrap">Débito (+)</th>
                      <th className="px-3.5 py-3 text-right text-emerald-300 whitespace-nowrap">Crédito (-)</th>
                      <th className="px-3.5 py-3 text-right text-white font-bold whitespace-nowrap">Saldo Acumulado</th>
                      <th className="px-3.5 py-3">Concepto / Notas</th>
                      <th className="px-3.5 py-3 text-center whitespace-nowrap">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                    {isLoading ? (
                      <tr>
                        <td colSpan={10} className="py-12 text-center text-slate-400 font-sans">
                          Cargando movimientos del ledger...
                        </td>
                      </tr>
                    ) : currencyLedger.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-12 text-center text-slate-500 italic font-sans">
                          No hay movimientos registrados en {selectedCurrency}.
                        </td>
                      </tr>
                    ) : (
                      currencyLedger.map((mov) => {
                        const isDebit = mov.amount > 0;
                        const isCredit = mov.amount < 0;

                        return (
                          <tr key={mov.movement_id} className="hover:bg-slate-800/40 transition-colors">
                            <td className="px-3.5 py-3 font-sans text-slate-300 whitespace-nowrap">
                              {formatDate(mov.movement_date)}
                            </td>
                            <td className="px-3.5 py-3 text-slate-500 font-bold whitespace-nowrap">
                              #{mov.movement_id}
                            </td>
                            <td className="px-3.5 py-3">
                              <div className="font-bold text-white whitespace-nowrap">{mov.document_human_ref}</div>
                              <div className="text-[10px] text-slate-500 font-sans whitespace-nowrap">ID #{mov.document_id} ({mov.document_type_name})</div>
                            </td>
                            <td className="px-3.5 py-3">
                              <div className="flex items-center space-x-1 whitespace-nowrap">
                                <ArrowDownRight className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                <span className="font-bold text-sky-300">{mov.reference_human_ref}</span>
                              </div>
                              <div className="text-[10px] text-slate-500 font-sans whitespace-nowrap">ID #{mov.reference_id}</div>
                            </td>
                            <td className="px-3.5 py-3 font-sans whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 border border-slate-700 text-slate-300 font-semibold inline-block">
                                {mov.movement_type}
                              </span>
                            </td>
                            <td className="px-3.5 py-3 text-right whitespace-nowrap">
                              {isDebit ? <span className="text-rose-400 font-bold">{formatMoney(mov.amount)}</span> : '-'}
                            </td>
                            <td className="px-3.5 py-3 text-right whitespace-nowrap">
                              {isCredit ? <span className="text-emerald-400 font-bold">-{formatMoney(Math.abs(mov.amount))}</span> : '-'}
                            </td>
                            <td className="px-3.5 py-3 text-right font-bold text-white whitespace-nowrap">
                              <span className={mov.running_balance < 0 ? 'text-emerald-400' : mov.running_balance > 0 ? 'text-rose-400' : 'text-slate-400'}>
                                {formatMoney(mov.running_balance)}
                              </span>
                            </td>
                            <td className="px-3.5 py-3 font-sans text-xs text-slate-400 max-w-xs truncate">
                              {mov.notes || '-'}
                            </td>
                            <td className="px-3.5 py-3 text-center font-sans whitespace-nowrap">
                              <div className="flex items-center justify-center space-x-1">
                                <button
                                  onClick={() => onViewDocumentDetail(mov.document_id)}
                                  title="Ver Detalle del Documento Emisor"
                                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                                >
                                  <FileText className="w-3.5 h-3.5 text-sky-400" />
                                </button>
                                <button
                                  onClick={() => onViewReferenceMovements(mov.reference_id)}
                                  title="Ver Historia de la Referencia"
                                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                                >
                                  <History className="w-3.5 h-3.5 text-violet-400" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              /* View 2: GROUPED VIEW (1 row per logical document_id) */
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-800/40 text-[10px] uppercase text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-3 whitespace-nowrap min-w-[110px]">Fecha</th>
                      <th className="px-4 py-3 whitespace-nowrap">ID Doc</th>
                      <th className="px-4 py-3">Comprobante Comercial</th>
                      <th className="px-4 py-3 whitespace-nowrap">Tipo</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">Importe Facial</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">Saldo de su Referencia</th>
                      <th className="px-4 py-3 text-center whitespace-nowrap">Estado Derivado</th>
                      <th className="px-4 py-3 text-center whitespace-nowrap">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                    {isLoading ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-400 font-sans">
                          Cargando documentos...
                        </td>
                      </tr>
                    ) : filteredDocs.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-500 italic font-sans">
                          No hay documentos registrados con el filtro actual.
                        </td>
                      </tr>
                    ) : (
                      filteredDocs.map((doc) => (
                        <tr key={doc.document_id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="px-4 py-3.5 font-sans text-slate-300 whitespace-nowrap">
                            {formatDate(doc.issue_date)}
                          </td>
                          <td className="px-4 py-3.5 text-slate-500 font-bold whitespace-nowrap">
                            #{doc.document_id}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="font-bold text-white whitespace-nowrap">{doc.human_reference}</div>
                            {doc.concept && <div className="text-[10px] text-slate-500 font-sans">{doc.concept}</div>}
                          </td>
                          <td className="px-4 py-3.5 font-sans whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border inline-block ${
                                doc.balance_nature === 'DEBIT'
                                  ? 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                                  : doc.balance_nature === 'CREDIT'
                                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                                  : 'bg-violet-500/10 text-violet-300 border-violet-500/20'
                              }`}
                            >
                              {doc.document_type_name}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-right font-bold text-white whitespace-nowrap">
                            {formatMoney(doc.total_amount)}
                          </td>
                          <td className="px-4 py-3.5 text-right font-bold whitespace-nowrap">
                            <span
                              className={
                                doc.reference_balance > 0
                                  ? 'text-rose-400'
                                  : doc.reference_balance < 0
                                  ? 'text-emerald-400'
                                  : 'text-slate-500'
                              }
                            >
                              {formatMoney(doc.reference_balance)}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-center font-sans whitespace-nowrap">
                            {doc.derived_status === 'PAID' && (
                              <span className="inline-flex items-center space-x-1 text-[10px] bg-emerald-500/10 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Cancelado</span>
                              </span>
                            )}
                            {doc.derived_status === 'PARTIAL' && (
                              <span className="inline-flex items-center space-x-1 text-[10px] bg-amber-500/10 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/30">
                                <Clock className="w-3 h-3" />
                                <span>Parcial</span>
                              </span>
                            )}
                            {doc.derived_status === 'PENDING' && (
                              <span className="inline-flex items-center space-x-1 text-[10px] bg-rose-500/10 text-rose-300 px-2 py-0.5 rounded-full border border-rose-500/20">
                                <Clock className="w-3 h-3" />
                                <span>Pendiente</span>
                              </span>
                            )}
                            {doc.derived_status === 'AVAILABLE_CREDIT' && (
                              <span className="inline-flex items-center space-x-1 text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30 font-bold">
                                <Wallet className="w-3 h-3" />
                                <span>Saldo Disponible</span>
                              </span>
                            )}
                            {doc.derived_status === 'SETTLED_CREDIT' && (
                              <span className="inline-flex items-center space-x-1 text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full border border-slate-700">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Consumido</span>
                              </span>
                            )}
                            {doc.derived_status === 'REVERSED' && (
                              <span className="inline-flex items-center space-x-1 text-[10px] bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded-full border border-rose-500/30 font-bold">
                                <RotateCcw className="w-3 h-3" />
                                <span>Revertido</span>
                              </span>
                            )}
                            {doc.derived_status === 'APL_TRANSFER' && (
                              <span className="inline-flex items-center space-x-1 text-[10px] bg-violet-500/20 text-violet-300 px-2 py-0.5 rounded-full border border-violet-500/30 font-bold">
                                <Layers className="w-3 h-3" />
                                <span>Transferencia APL</span>
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-center font-sans">
                            <div className="flex items-center justify-center space-x-1.5">
                              <button
                                onClick={() => onViewDocumentDetail(doc.document_id)}
                                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold transition-colors flex items-center space-x-1"
                              >
                                <FileText className="w-3.5 h-3.5 text-sky-400" />
                                <span>Detalle</span>
                              </button>

                              <button
                                onClick={() => onViewReferenceMovements(doc.document_id)}
                                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold transition-colors flex items-center space-x-1"
                              >
                                <History className="w-3.5 h-3.5 text-violet-400" />
                                <span>Movimientos</span>
                              </button>

                              {hasPermission('documents.reverse') &&
                                doc.total_amount > 0 &&
                                !doc.human_reference.startsWith('REV-') &&
                                doc.document_type_code !== 'APL' && (
                                  <button
                                    onClick={() => onReverseDocument(doc)}
                                    title="Revertir Comprobante"
                                    className="p-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </button>
                                )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
