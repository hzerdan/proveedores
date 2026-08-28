import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Seller, SellerSuppliersSummaryRow, OpenDocumentDetail } from '../../types/database';
import { formatMoney, formatDate } from '../../lib/formatters';
import { SellerSuppliersManager } from './SellerSuppliersManager';
import {
  X,
  UserCheck,
  Building2,
  Receipt,
  Mail,
  Phone,
  Layers,
  ChevronRight,
} from 'lucide-react';

interface SellerDetailModalProps {
  seller: Seller | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenDocumentDetail?: (docId: number) => void;
  onOpenSupplierAccount?: (supplierId: number) => void;
}

export const SellerDetailModal: React.FC<SellerDetailModalProps> = ({
  seller,
  isOpen,
  onClose,
  onOpenDocumentDetail,
  onOpenSupplierAccount,
}) => {
  const [suppliersSummary, setSuppliersSummary] = useState<SellerSuppliersSummaryRow[]>([]);
  const [documents, setDocuments] = useState<OpenDocumentDetail[]>([]);
  const [_loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'SUPPLIERS' | 'DOCUMENTS'>('SUPPLIERS');

  const fetchSellerData = async () => {
    if (!seller) return;
    setLoading(true);
    try {
      // 1. Fetch Suppliers and Balances summary for this seller
      const { data: supsData, error: supsErr } = await supabase.rpc(
        'rpc_get_seller_suppliers_summary',
        { p_seller_id: seller.id }
      );
      if (supsErr) throw supsErr;
      setSuppliersSummary(supsData || []);

      // 2. Fetch Open Documents for this seller
      const { data: docsData, error: docsErr } = await supabase.rpc(
        'rpc_get_seller_documents_detail',
        {
          p_seller_id: seller.id,
          p_currency: 'ARS',
          p_context: 'ALL',
        }
      );
      if (!docsErr && docsData) {
        setDocuments(docsData);
      }
    } catch (err) {
      console.error('Error fetching seller details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && seller) {
      fetchSellerData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seller, isOpen]);

  if (!isOpen || !seller) return null;

  // Calculate totals by currency
  const currencyTotals: Record<string, { debt: number; credit: number; net: number }> = {};
  suppliersSummary.forEach((s) => {
    if (!currencyTotals[s.currency]) {
      currencyTotals[s.currency] = { debt: 0, credit: 0, net: 0 };
    }
    currencyTotals[s.currency].debt += s.pending_debt || 0;
    currencyTotals[s.currency].credit += s.available_credit || 0;
    currencyTotals[s.currency].net += s.net_balance || 0;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/40">
          <div className="flex items-center space-x-3">
            <div className="p-3 rounded-2xl bg-gradient-to-tr from-sky-600 to-indigo-600 text-white shadow-lg shadow-sky-500/20">
              <UserCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base sm:text-lg font-bold text-white">
                  {seller.display_name}
                </h2>
                {seller.code && (
                  <span className="text-[10px] font-mono bg-slate-800 text-sky-300 px-2 py-0.5 rounded-full border border-slate-700">
                    {seller.code}
                  </span>
                )}
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                    seller.is_active
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                  }`}
                >
                  {seller.is_active ? 'Activo Global' : 'Inactivo Global'}
                </span>
              </div>
              <div className="flex items-center space-x-4 text-xs text-slate-400 mt-0.5">
                {seller.email && (
                  <span className="flex items-center space-x-1">
                    <Mail className="w-3.5 h-3.5 text-slate-500" />
                    <span>{seller.email}</span>
                  </span>
                )}
                {seller.phone && (
                  <span className="flex items-center space-x-1">
                    <Phone className="w-3.5 h-3.5 text-slate-500" />
                    <span>{seller.phone}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Currency Multimoneda Stat Cards */}
        <div className="p-6 pb-2 border-b border-slate-800/80 bg-slate-950/40">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {Object.entries(currencyTotals).map(([curr, tot]) => (
              <div
                key={curr}
                className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-sm"
              >
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
                  <span>Saldo Deuda en {curr}</span>
                  <span className="font-mono text-xs text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded">
                    {curr}
                  </span>
                </div>
                <div className="mt-2 text-xl font-bold font-mono text-white">
                  {formatMoney(tot.debt, curr)}
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
                  <span>Saldo Neto Atribuido:</span>
                  <span className="font-mono font-bold text-emerald-400">
                    {formatMoney(tot.net, curr)}
                  </span>
                </div>
              </div>
            ))}
            {Object.keys(currencyTotals).length === 0 && (
              <div className="col-span-3 text-center py-2 text-xs text-slate-500 italic">
                Sin saldos comerciales abiertos en ninguna moneda.
              </div>
            )}
          </div>

          {/* Navigation Tabs inside modal */}
          <div className="flex space-x-2 mt-4">
            <button
              onClick={() => setActiveTab('SUPPLIERS')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${
                activeTab === 'SUPPLIERS'
                  ? 'bg-sky-600 text-white shadow-md shadow-sky-900/30'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Proveedores & Relaciones M:N</span>
            </button>

            <button
              onClick={() => setActiveTab('DOCUMENTS')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${
                activeTab === 'DOCUMENTS'
                  ? 'bg-sky-600 text-white shadow-md shadow-sky-900/30'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>Comprobantes con Deuda Abierta ({documents.length})</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {activeTab === 'SUPPLIERS' ? (
            <div className="space-y-6">
              {/* Relaciones M:N Component */}
              <SellerSuppliersManager
                mode="FOR_SELLER"
                sellerId={seller.id}
                onRefresh={fetchSellerData}
              />

              {/* Proveedores y Saldos Desglosados */}
              <div>
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center space-x-2">
                  <Layers className="w-4 h-4 text-amber-400" />
                  <span>Saldos Abiertos por Proveedor</span>
                </h3>

                <div className="bg-slate-950/60 border border-slate-800 rounded-2xl overflow-hidden shadow-inner">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900/80 border-b border-slate-800 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-2.5">Proveedor</th>
                        <th className="px-3 py-2.5">Moneda</th>
                        <th className="px-3 py-2.5 text-right">Comprobantes Abiertos</th>
                        <th className="px-3 py-2.5 text-right">Deuda Pendiente</th>
                        <th className="px-4 py-2.5 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-sans">
                      {suppliersSummary.map((item, idx) => (
                        <tr
                          key={`${item.supplier_id}-${item.currency}-${idx}`}
                          className="hover:bg-slate-900/40 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <div className="font-bold text-white text-xs">
                              {item.supplier_trade_name}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400">
                              {item.supplier_tax_id}
                            </div>
                          </td>

                          <td className="px-3 py-3">
                            <span className="font-mono text-xs bg-slate-800 text-sky-300 px-2 py-0.5 rounded">
                              {item.currency}
                            </span>
                          </td>

                          <td className="px-3 py-3 text-right font-mono text-slate-300">
                            {item.open_doc_count}
                          </td>

                          <td className="px-3 py-3 text-right font-mono font-bold text-amber-400">
                            {formatMoney(item.pending_debt, item.currency)}
                          </td>

                          <td className="px-4 py-3 text-right">
                            {onOpenSupplierAccount && (
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  onOpenSupplierAccount(item.supplier_id);
                                }}
                                className="text-[11px] text-sky-400 hover:text-white flex items-center space-x-1 ml-auto font-semibold"
                              >
                                <span>Ver Cuenta</span>
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            /* Open Documents Tab */
            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl overflow-hidden shadow-inner">
              {documents.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 italic">
                  No hay comprobantes pendientes de saldo para este vendedor.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/80 border-b border-slate-800 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-2.5">Comprobante</th>
                      <th className="px-3 py-2.5">Proveedor</th>
                      <th className="px-3 py-2.5">Fecha Emisión</th>
                      <th className="px-3 py-2.5">Vencimiento</th>
                      <th className="px-3 py-2.5 text-right">Importe Total</th>
                      <th className="px-3 py-2.5 text-right">Saldo Pendiente</th>
                      <th className="px-4 py-2.5 text-right">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans">
                    {documents.map((doc) => (
                      <tr key={doc.document_id} className="hover:bg-slate-900/40 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-mono font-bold text-sky-400 text-xs">
                            {doc.human_reference}
                          </span>
                          <span className="block text-[10px] text-slate-400">
                            {doc.document_type_name}
                          </span>
                        </td>

                        <td className="px-3 py-3 text-white font-medium">
                          {doc.supplier_trade_name}
                        </td>

                        <td className="px-3 py-3 text-slate-300 font-mono text-[11px]">
                          {formatDate(doc.issue_date)}
                        </td>

                        <td className="px-3 py-3 font-mono text-[11px]">
                          {doc.due_date ? (
                            <span
                              className={
                                doc.due_date < new Date().toISOString().split('T')[0]
                                  ? 'text-rose-400 font-bold'
                                  : 'text-slate-300'
                              }
                            >
                              {formatDate(doc.due_date)}
                            </span>
                          ) : (
                            <span className="text-slate-500 italic">-</span>
                          )}
                        </td>

                        <td className="px-3 py-3 text-right font-mono text-slate-300">
                          {formatMoney(doc.total_amount, doc.currency)}
                        </td>

                        <td className="px-3 py-3 text-right font-mono font-bold text-amber-400">
                          {formatMoney(doc.reference_balance, doc.currency)}
                        </td>

                        <td className="px-4 py-3 text-right">
                          {onOpenDocumentDetail && (
                            <button
                              type="button"
                              onClick={() => onOpenDocumentDetail(doc.document_id)}
                              className="text-[11px] text-sky-400 hover:text-white font-semibold"
                            >
                              Ver
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
