import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Seller, SellerAccountSummary } from '../../types/database';
import { useAuth } from '../../context/AuthContext';
import { formatMoney } from '../../lib/formatters';
import { SellerFormModal } from './SellerFormModal';
import { SellerDetailModal } from './SellerDetailModal';
import {
  UserCheck,
  Search,
  Plus,
  Mail,
  Phone,
  Building2,
  Receipt,
  Eye,
  Edit2,
  TrendingUp,
  Layers,
} from 'lucide-react';

interface SellerListProps {
  onOpenSupplierAccount?: (supplierId: number) => void;
  onOpenDocumentDetail?: (docId: number) => void;
}

export const SellerList: React.FC<SellerListProps> = ({
  onOpenSupplierAccount,
  onOpenDocumentDetail,
}) => {
  const { hasPermission } = useAuth();
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [summaries, setSummaries] = useState<SellerAccountSummary[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState('ALL');
  const [isLoading, setIsLoading] = useState(true);

  // Modals state
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingSeller, setEditingSeller] = useState<Seller | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null);

  const fetchSellers = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch Sellers
      const { data: selData, error: selErr } = await supabase
        .from('sellers')
        .select('*')
        .order('display_name', { ascending: true });

      if (selErr) throw selErr;
      setSellers(selData || []);

      // 2. Fetch Summaries
      const { data: sumData, error: sumErr } = await supabase
        .from('v_seller_account_summary')
        .select('*');

      if (!sumErr && sumData) {
        setSummaries(sumData);
      }
    } catch (err) {
      console.error('Error fetching sellers:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSellers();
  }, []);

  const availableCurrencies = Array.from(new Set(summaries.map((s) => s.currency)));

  // Filter sellers
  const filteredSellers = sellers.filter((s) => {
    const q = search.toLowerCase();
    return (
      s.display_name.toLowerCase().includes(q) ||
      s.first_name.toLowerCase().includes(q) ||
      s.last_name.toLowerCase().includes(q) ||
      (s.code && s.code.toLowerCase().includes(q)) ||
      (s.email && s.email.toLowerCase().includes(q))
    );
  });

  // Calculate totals by currency
  const currencyTotals: Record<string, { debt: number; credit: number; net: number }> = {};
  summaries.forEach((s) => {
    if (!currencyTotals[s.currency]) {
      currencyTotals[s.currency] = { debt: 0, credit: 0, net: 0 };
    }
    currencyTotals[s.currency].debt += s.total_pending_debt || 0;
    currencyTotals[s.currency].credit += s.total_available_credit || 0;
    currencyTotals[s.currency].net += s.net_seller_balance || 0;
  });

  return (
    <div className="space-y-6">
      {/* Header & Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: Total Vendedores */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg shadow-black/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Vendedores Registrados</span>
            <UserCheck className="w-5 h-5 text-sky-400" />
          </div>
          <div className="mt-3 text-2xl font-bold text-white">{sellers.length}</div>
          <div className="mt-1 text-xs text-emerald-400">
            {sellers.filter((s) => s.is_active).length} activos globalmente
          </div>
        </div>

        {/* Card 2: Deuda Total Atribuida */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg shadow-black/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">
              Deuda Atribuida {selectedCurrency !== 'ALL' && `(${selectedCurrency})`}
            </span>
            <TrendingUp className="w-5 h-5 text-amber-400" />
          </div>
          <div className="mt-3 text-2xl font-bold font-mono text-white">
            {selectedCurrency !== 'ALL'
              ? formatMoney(currencyTotals[selectedCurrency]?.debt || 0, selectedCurrency)
              : Object.entries(currencyTotals).map(([curr, val]) => (
                  <div key={curr} className="text-lg">
                    {formatMoney(val.debt, curr)}
                  </div>
                ))}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Suma de referencias activas con vendedor asignado
          </div>
        </div>

        {/* Card 3: Saldo Neto Atribuible */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg shadow-black/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">
              Saldo Neto Total Atribuido {selectedCurrency !== 'ALL' && `(${selectedCurrency})`}
            </span>
            <Layers className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="mt-3 text-2xl font-bold font-mono text-emerald-400">
            {selectedCurrency !== 'ALL'
              ? formatMoney(currencyTotals[selectedCurrency]?.net || 0, selectedCurrency)
              : Object.entries(currencyTotals).map(([curr, val]) => (
                  <div key={curr} className="text-lg">
                    {formatMoney(val.net, curr)}
                  </div>
                ))}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            (Excluye créditos libres sin vendedor)
          </div>
        </div>
      </div>

      {/* Action Bar & Search */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl shadow-black/20 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex flex-1 items-center space-x-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-96">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por nombre, código o email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
            />
          </div>

          {availableCurrencies.length > 1 && (
            <div className="flex items-center space-x-1 bg-slate-800 p-1 rounded-xl border border-slate-700">
              <button
                onClick={() => setSelectedCurrency('ALL')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  selectedCurrency === 'ALL'
                    ? 'bg-sky-500 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Todas
              </button>
              {availableCurrencies.map((curr) => (
                <button
                  key={curr}
                  onClick={() => setSelectedCurrency(curr)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                    selectedCurrency === curr
                      ? 'bg-sky-500 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {curr}
                </button>
              ))}
            </div>
          )}
        </div>

        {hasPermission('sellers.manage') && (
          <button
            onClick={() => {
              setEditingSeller(null);
              setFormModalOpen(true);
            }}
            className="w-full sm:w-auto flex items-center justify-center space-x-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-sky-900/30 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Vendedor</span>
          </button>
        )}
      </div>

      {/* Sellers Grid */}
      {isLoading ? (
        <div className="p-12 text-center text-slate-500 text-sm">
          Cargando catálogo de vendedores y saldos...
        </div>
      ) : filteredSellers.length === 0 ? (
        <div className="p-12 text-center text-slate-500 text-sm bg-slate-900/40 rounded-2xl border border-slate-800">
          No se encontraron vendedores coincidentes con la búsqueda.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSellers.map((seller) => {
            const sellerSummaries = summaries.filter((s) => s.seller_id === seller.id);
            const activeSuppliersCount =
              sellerSummaries.length > 0 ? sellerSummaries[0].active_suppliers_count : 0;
            const openDocsCount = sellerSummaries.reduce(
              (acc, curr) => acc + curr.open_documents_count,
              0
            );

            return (
              <div
                key={seller.id}
                className="bg-slate-900/90 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-5 shadow-lg shadow-black/20 flex flex-col justify-between transition-all group"
              >
                <div>
                  {/* Top card bar */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-sky-400 font-bold text-sm shadow-inner">
                        {seller.display_name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-bold text-white text-sm group-hover:text-sky-300 transition-colors">
                          {seller.display_name}
                        </h3>
                        <div className="flex items-center space-x-2 text-[11px] text-slate-400">
                          {seller.code && (
                            <span className="font-mono text-sky-400 bg-sky-950/40 px-1.5 py-0.2 rounded border border-sky-900/40">
                              {seller.code}
                            </span>
                          )}
                          <span>
                            {seller.first_name} {seller.last_name}
                          </span>
                        </div>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                        seller.is_active
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {seller.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>

                  {/* Contact details */}
                  <div className="mt-4 space-y-1 text-xs text-slate-400">
                    {seller.email && (
                      <div className="flex items-center space-x-2">
                        <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="truncate">{seller.email}</span>
                      </div>
                    )}
                    {seller.phone && (
                      <div className="flex items-center space-x-2">
                        <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span>{seller.phone}</span>
                      </div>
                    )}
                  </div>

                  {/* Represented Suppliers & Docs count badges */}
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-1.5 text-slate-400">
                      <Building2 className="w-3.5 h-3.5 text-sky-400" />
                      <span>{activeSuppliersCount} proveedores con deuda</span>
                    </div>

                    <div className="flex items-center space-x-1.5 text-slate-400">
                      <Receipt className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{openDocsCount} facturas abiertas</span>
                    </div>
                  </div>

                  {/* Balances by currency */}
                  <div className="mt-3 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 space-y-1.5 font-mono">
                    {sellerSummaries.length === 0 ? (
                      <div className="text-[11px] text-slate-500 text-center font-sans italic">
                        Sin deuda pendiente en cuenta corriente
                      </div>
                    ) : (
                      sellerSummaries.map((sum) => (
                        <div
                          key={sum.currency}
                          className="flex items-center justify-between text-xs"
                        >
                          <span className="text-slate-400 font-sans text-[11px]">
                            Deuda ({sum.currency}):
                          </span>
                          <span className="font-bold text-amber-400">
                            {formatMoney(sum.total_pending_debt, sum.currency)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Footer card actions */}
                <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSeller(seller);
                      setDetailModalOpen(true);
                    }}
                    className="flex-1 flex items-center justify-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-sky-400 hover:text-white px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border border-slate-700/80"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Ver Ficha & Proveedores</span>
                  </button>

                  {hasPermission('sellers.manage') && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSeller(seller);
                        setFormModalOpen(true);
                      }}
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl border border-slate-700/80 transition-all"
                      title="Editar Vendedor"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Seller Create / Edit Modal */}
      {formModalOpen && (
        <SellerFormModal
          isOpen={formModalOpen}
          onClose={() => setFormModalOpen(false)}
          seller={editingSeller}
          onSaved={() => {
            fetchSellers();
          }}
        />
      )}

      {/* Seller Detail & Suppliers Modal */}
      {detailModalOpen && selectedSeller && (
        <SellerDetailModal
          isOpen={detailModalOpen}
          onClose={() => setDetailModalOpen(false)}
          seller={selectedSeller}
          onOpenSupplierAccount={onOpenSupplierAccount}
          onOpenDocumentDetail={onOpenDocumentDetail}
        />
      )}
    </div>
  );
};
