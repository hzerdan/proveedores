import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Supplier, SupplierAccountSummary } from '../../types/database';
import { useAuth } from '../../context/AuthContext';
import { formatMoney } from '../../lib/formatters';
import { Building2, Search, Plus, FileText, Phone, Mail, FilePlus, Edit2 } from 'lucide-react';

interface SupplierListProps {
  onSelectSupplier: (supplierId: number) => void;
  onNewDocument: (supplierId?: number) => void;
  onOpenSupplierModal: (supplier?: Supplier) => void;
}

export const SupplierList: React.FC<SupplierListProps> = ({
  onSelectSupplier,
  onNewDocument,
  onOpenSupplierModal,
}) => {
  const { hasPermission } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [summaries, setSummaries] = useState<SupplierAccountSummary[]>([]);
  const [selectedCurrency, setSelectedCurrency] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const fetchSuppliers = async () => {
    setIsLoading(true);
    try {
      const { data: sups, error: supsErr } = await supabase
        .from('suppliers')
        .select('*')
        .order('trade_name', { ascending: true });

      if (supsErr) throw supsErr;
      setSuppliers(sups || []);

      const { data: sums, error: sumsErr } = await supabase
        .from('v_supplier_account_summary')
        .select('*');

      if (!sumsErr && sums) {
        setSummaries(sums);
      }
    } catch (err) {
      console.error('Error fetching suppliers:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const availableCurrencies = Array.from(new Set(summaries.map((s) => s.currency)));

  // Filter suppliers by search
  const filteredSuppliers = suppliers.filter((s) => {
    const q = search.toLowerCase();
    return (
      s.trade_name.toLowerCase().includes(q) ||
      s.legal_name.toLowerCase().includes(q) ||
      s.tax_id.toLowerCase().includes(q) ||
      s.code.toLowerCase().includes(q)
    );
  });

  // Calculate totals partitioned strictly by currency
  const currencyTotals: Record<string, { debt: number; credit: number; net: number }> = {};
  summaries.forEach((s) => {
    if (!currencyTotals[s.currency]) {
      currencyTotals[s.currency] = { debt: 0, credit: 0, net: 0 };
    }
    currencyTotals[s.currency].debt += s.total_pending_debt || 0;
    currencyTotals[s.currency].credit += s.total_available_credit || 0;
    currencyTotals[s.currency].net += s.net_account_balance || 0;
  });

  return (
    <div className="space-y-6">
      {/* Header & Stats Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: Total Proveedores */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg shadow-black/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Total Proveedores</span>
            <Building2 className="w-5 h-5 text-sky-400" />
          </div>
          <div className="mt-3 text-2xl font-bold text-white">{suppliers.length}</div>
          <div className="mt-1 text-xs text-emerald-400">
            {suppliers.filter((s) => s.is_active).length} activos
          </div>
        </div>

        {/* Card 2: Deuda Exigible Global */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg shadow-black/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">
              Deuda Exigible Global {selectedCurrency !== 'ALL' && `(${selectedCurrency})`}
            </span>
            <span className="text-xs font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full">
              DÉBITO
            </span>
          </div>

          {selectedCurrency !== 'ALL' ? (
            <div className="mt-3 text-2xl font-bold text-rose-400 font-mono">
              {formatMoney(currencyTotals[selectedCurrency]?.debt || 0)} {selectedCurrency}
            </div>
          ) : (
            <div className="mt-2 space-y-1">
              {Object.entries(currencyTotals).map(([curr, tot]) => (
                <div key={`debt-${curr}`} className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400">{curr}:</span>
                  <span className="font-bold text-rose-400">{formatMoney(tot.debt)} {curr}</span>
                </div>
              ))}
              {Object.keys(currencyTotals).length === 0 && (
                <div className="text-slate-500 font-mono text-sm">$0,00</div>
              )}
            </div>
          )}
          <div className="mt-1 text-xs text-slate-400">Facturas y débitos pendientes</div>
        </div>

        {/* Card 3: Créditos Disponibles */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg shadow-black/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">
              Créditos / Anticipos Disponibles {selectedCurrency !== 'ALL' && `(${selectedCurrency})`}
            </span>
            <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
              CRÉDITO
            </span>
          </div>

          {selectedCurrency !== 'ALL' ? (
            <div className="mt-3 text-2xl font-bold text-emerald-400 font-mono">
              {formatMoney(currencyTotals[selectedCurrency]?.credit || 0)} {selectedCurrency}
            </div>
          ) : (
            <div className="mt-2 space-y-1">
              {Object.entries(currencyTotals).map(([curr, tot]) => (
                <div key={`cred-${curr}`} className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400">{curr}:</span>
                  <span className="font-bold text-emerald-400">{formatMoney(tot.credit)} {curr}</span>
                </div>
              ))}
              {Object.keys(currencyTotals).length === 0 && (
                <div className="text-slate-500 font-mono text-sm">$0,00</div>
              )}
            </div>
          )}
          <div className="mt-1 text-xs text-slate-400">Pagos y NC listos para aplicar</div>
        </div>
      </div>

      {/* Action & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900/60 p-4 rounded-2xl border border-slate-800/80">
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por Razón Social, CUIT o Código..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-800/80 border border-slate-700/60 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500 transition-all"
            />
          </div>

          {/* Currency Selector Toolbar */}
          <div className="flex items-center space-x-1.5 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60 text-xs">
            <span className="text-slate-400 font-semibold uppercase text-[10px] px-2">Moneda:</span>
            <button
              onClick={() => setSelectedCurrency('ALL')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                selectedCurrency === 'ALL'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Todas
            </button>
            {availableCurrencies.map((curr) => (
              <button
                key={curr}
                onClick={() => setSelectedCurrency(curr)}
                className={`px-3 py-1.5 rounded-lg font-mono font-bold transition-all ${
                  selectedCurrency === curr
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {curr}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
          {hasPermission('documents.create') && (
            <button
              onClick={() => onNewDocument()}
              className="flex-1 sm:flex-none flex items-center justify-center space-x-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-lg shadow-emerald-900/30 transition-all"
            >
              <FilePlus className="w-4 h-4" />
              <span>Nuevo Comprobante</span>
            </button>
          )}

          {hasPermission('suppliers.manage') && (
            <button
              onClick={() => onOpenSupplierModal()}
              className="flex-1 sm:flex-none flex items-center justify-center space-x-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-lg shadow-sky-900/30 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo Proveedor</span>
            </button>
          )}
        </div>
      </div>

      {/* Supplier Grid / Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl shadow-black/30">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-800/60 text-xs uppercase text-slate-400 font-semibold border-b border-slate-800">
              <tr>
                <th className="px-6 py-4">Proveedor</th>
                <th className="px-6 py-4">Identificación Fiscal</th>
                <th className="px-6 py-4">Contacto</th>
                <th className="px-6 py-4 text-right">Deuda Pendiente</th>
                <th className="px-6 py-4 text-right">Crédito Disponible</th>
                <th className="px-6 py-4 text-right">Saldo Neto CC</th>
                <th className="px-6 py-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-normal">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    Cargando proveedores...
                  </td>
                </tr>
              ) : filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    No se encontraron proveedores registrados.
                  </td>
                </tr>
              ) : (
                filteredSuppliers.map((supplier) => {
                  // Find all summaries for this supplier
                  const supSummaries = summaries.filter((s) => s.supplier_id === supplier.id);

                  // Filtered summaries according to selected currency
                  const activeSummaries =
                    selectedCurrency === 'ALL'
                      ? supSummaries
                      : supSummaries.filter((s) => s.currency === selectedCurrency);

                  return (
                    <tr
                      key={supplier.id}
                      className="hover:bg-slate-800/40 transition-colors group"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center font-bold text-sky-400 text-xs">
                            {supplier.code.substring(0, 3)}
                          </div>
                          <div>
                            <div className="font-semibold text-white group-hover:text-sky-300 transition-colors">
                              {supplier.trade_name}
                            </div>
                            <div className="text-xs text-slate-400">{supplier.legal_name}</div>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="font-mono text-xs text-slate-300 bg-slate-800/60 px-2 py-1 rounded inline-block border border-slate-700/50">
                          {supplier.tax_id}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">Cód: {supplier.code}</div>
                      </td>

                      <td className="px-6 py-4 text-xs text-slate-300">
                        {supplier.phone && (
                          <div className="flex items-center space-x-1.5 text-slate-300">
                            <Phone className="w-3 h-3 text-slate-400" />
                            <span>{supplier.phone}</span>
                          </div>
                        )}
                        {supplier.email && (
                          <div className="flex items-center space-x-1.5 text-slate-400 mt-0.5">
                            <Mail className="w-3 h-3 text-slate-500" />
                            <span>{supplier.email}</span>
                          </div>
                        )}
                        {!supplier.phone && !supplier.email && (
                          <span className="text-slate-500 italic">Sin datos</span>
                        )}
                      </td>

                      {/* Deuda Pendiente */}
                      <td className="px-6 py-4 text-right">
                        {activeSummaries.length === 0 ? (
                          <span className="text-slate-500 font-mono text-xs">-</span>
                        ) : (
                          activeSummaries.map((sum) => (
                            <div key={`debt-${sum.currency}`} className="font-mono text-xs">
                              <span className={sum.total_pending_debt > 0 ? 'text-rose-400 font-bold' : 'text-slate-400'}>
                                {formatMoney(sum.total_pending_debt)}
                              </span>
                              {activeSummaries.length > 1 && (
                                <span className="ml-1 text-[10px] text-slate-500 font-semibold">{sum.currency}</span>
                              )}
                            </div>
                          ))
                        )}
                      </td>

                      {/* Crédito Disponible */}
                      <td className="px-6 py-4 text-right">
                        {activeSummaries.length === 0 ? (
                          <span className="text-slate-500 font-mono text-xs">-</span>
                        ) : (
                          activeSummaries.map((sum) => (
                            <div key={`cred-${sum.currency}`} className="font-mono text-xs">
                              <span className={sum.total_available_credit > 0 ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                                {formatMoney(sum.total_available_credit)}
                              </span>
                              {activeSummaries.length > 1 && (
                                <span className="ml-1 text-[10px] text-slate-500 font-semibold">{sum.currency}</span>
                              )}
                            </div>
                          ))
                        )}
                      </td>

                      {/* Saldo Neto CC */}
                      <td className="px-6 py-4 text-right font-mono font-bold text-sm">
                        {activeSummaries.length === 0 ? (
                          <span className="text-slate-500 font-mono text-xs">$0,00</span>
                        ) : (
                          activeSummaries.map((sum) => (
                            <div key={`net-${sum.currency}`}>
                              <span
                                className={
                                  sum.net_account_balance > 0
                                    ? 'text-rose-400'
                                    : sum.net_account_balance < 0
                                    ? 'text-emerald-400'
                                    : 'text-slate-400'
                                }
                              >
                                {formatMoney(sum.net_account_balance)}
                              </span>
                              {activeSummaries.length > 1 && (
                                <span className="ml-1 text-[10px] text-slate-500 font-normal">{sum.currency}</span>
                              )}
                            </div>
                          ))
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <button
                            onClick={() => onSelectSupplier(supplier.id)}
                            className="p-2 rounded-xl bg-slate-800 hover:bg-sky-600/20 text-slate-300 hover:text-sky-300 border border-slate-700/60 hover:border-sky-500/30 transition-all shadow-sm group/btn"
                            title="Ver Cuenta Corriente"
                          >
                            <FileText className="w-4 h-4 group-hover/btn:scale-110 transition-transform" />
                          </button>
                          {hasPermission('documents.create') && (
                            <button
                              onClick={() => onNewDocument(supplier.id)}
                              className="p-2 rounded-xl bg-slate-800 hover:bg-emerald-600/20 text-slate-300 hover:text-emerald-300 border border-slate-700/60 hover:border-emerald-500/30 transition-all shadow-sm group/btn"
                              title="Cargar Comprobante"
                            >
                              <Plus className="w-4 h-4 group-hover/btn:scale-110 transition-transform" />
                            </button>
                          )}
                          {hasPermission('suppliers.manage') && (
                            <button
                              onClick={() => onOpenSupplierModal(supplier)}
                              className="p-2 rounded-xl bg-slate-800 hover:bg-indigo-600/20 text-slate-300 hover:text-indigo-300 border border-slate-700/60 hover:border-indigo-500/30 transition-all shadow-sm group/btn"
                              title="Editar Proveedor & Vendedores Asignados"
                            >
                              <Edit2 className="w-4 h-4 group-hover/btn:scale-110 transition-transform" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
