import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { SupplierAgingRow, SellerAgingRow } from '../../types/database';
import { formatDate, formatMoney } from '../../lib/formatters';
import { BucketDetailModal } from './BucketDetailModal';
import { PunctualPaymentBadge } from '../common/PunctualPaymentBadge';
import { PunctualPaymentFilter } from '../common/PunctualPaymentFilter';
import { DateInput } from '../common/DateInput';
import { PunctualPaymentStatus, calculatePunctualPaymentStatus } from '../../lib/punctualPayment';
import {
  Calendar,
  Search,
  ArrowUpDown,
  Clock,
  UserCheck,
  Building2,
  AlertCircle,
} from 'lucide-react';

interface SupplierAgingViewProps {
  onSelectSupplierAccount?: (supplierId: number) => void;
}

export const SupplierAgingView: React.FC<SupplierAgingViewProps> = ({
  onSelectSupplierAccount,
}) => {
  const [dimension, setDimension] = useState<'SUPPLIERS' | 'SELLERS'>('SUPPLIERS');
  const [cutoffDate, setCutoffDate] = useState(new Date().toISOString().split('T')[0]);
  const [rows, setRows] = useState<SupplierAgingRow[]>([]);
  const [sellerRows, setSellerRows] = useState<SellerAgingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('ALL');
  const [punctualFilters, setPunctualFilters] = useState<PunctualPaymentStatus[]>([]);
  const [sortBy, setSortBy] = useState<'NAME' | 'BALANCE' | 'OVERDUE'>('NAME');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('ASC');

  // Drilldown Modal state
  const [drilldownModalOpen, setDrilldownModalOpen] = useState(false);
  const [drilldownParams, setDrilldownParams] = useState<{
    title: string;
    subtitle: string;
    supplierId?: number;
    sellerId?: number;
    currency: string;
    bucketCode?: string;
    expectedAmount?: number;
  } | null>(null);

  const fetchAgingData = async () => {
    setLoading(true);
    try {
      if (dimension === 'SUPPLIERS') {
        const { data, error } = await supabase.rpc('rpc_get_supplier_aging', {
          p_cutoff_date: cutoffDate,
        });

        if (error) throw error;
        setRows(data || []);
      } else {
        const { data, error } = await supabase.rpc('rpc_get_seller_aging', {
          p_cutoff_date: cutoffDate,
        });

        if (error) throw error;
        setSellerRows(data || []);
      }
    } catch (err) {
      console.error('Error fetching aging data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgingData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cutoffDate, dimension]);

  // Unique currencies present
  const availableCurrencies = Array.from(
    new Set(
      dimension === 'SUPPLIERS'
        ? rows.map((r) => r.currency)
        : sellerRows.map((r) => r.currency)
    )
  );

  // Filtered & Sorted supplier rows
  const filteredRows = rows
    .filter((r) => {
      const q = search.toLowerCase();
      const matchSearch =
        r.supplier_trade_name.toLowerCase().includes(q) ||
        r.supplier_tax_id.toLowerCase().includes(q);
      const matchCurrency = currencyFilter === 'ALL' || r.currency === currencyFilter;

      let matchPunctual = true;
      if (punctualFilters.length > 0) {
        if (!r.strict_due_date_discount) {
          matchPunctual = false;
        } else {
          const status = r.min_due_date ? calculatePunctualPaymentStatus(r.min_due_date) : 'NO_DUE_DATE';
          matchPunctual = punctualFilters.includes(status);
        }
      }

      return matchSearch && matchCurrency && matchPunctual;
    })
    .sort((a, b) => {
      let comp = 0;
      if (sortBy === 'NAME') {
        comp = a.supplier_trade_name.localeCompare(b.supplier_trade_name);
      } else if (sortBy === 'BALANCE') {
        comp = a.net_total_balance - b.net_total_balance;
      } else if (sortBy === 'OVERDUE') {
        const totalOverdueA = a.overdue_gt_60 + a.overdue_31_60 + a.overdue_1_30;
        const totalOverdueB = b.overdue_gt_60 + b.overdue_31_60 + b.overdue_1_30;
        comp = totalOverdueA - totalOverdueB;
      }
      return sortOrder === 'ASC' ? comp : -comp;
    });

  // Filtered & Sorted seller rows
  const filteredSellerRows = sellerRows
    .filter((r) => {
      const q = search.toLowerCase();
      const matchSearch =
        r.seller_display_name.toLowerCase().includes(q) ||
        (r.seller_code && r.seller_code.toLowerCase().includes(q));
      const matchCurrency = currencyFilter === 'ALL' || r.currency === currencyFilter;
      return matchSearch && matchCurrency;
    })
    .sort((a, b) => {
      let comp = 0;
      if (sortBy === 'NAME') {
        comp = a.seller_display_name.localeCompare(b.seller_display_name);
      } else if (sortBy === 'BALANCE') {
        comp = a.total_pending_debt - b.total_pending_debt;
      } else if (sortBy === 'OVERDUE') {
        const totalOverdueA = a.overdue_gt_60 + a.overdue_31_60 + a.overdue_1_30;
        const totalOverdueB = b.overdue_gt_60 + b.overdue_31_60 + b.overdue_1_30;
        comp = totalOverdueA - totalOverdueB;
      }
      return sortOrder === 'ASC' ? comp : -comp;
    });

  // Calculate totals strictly partitioned by currency
  const currencyTotals: Record<
    string,
    {
      overdue_gt_60: number;
      overdue_31_60: number;
      overdue_1_30: number;
      due_0_30: number;
      due_31_60: number;
      due_gt_60: number;
      no_due_date_amount: number;
      free_credits_amount: number;
      total_pending_debt: number;
      net_total_balance: number;
      count: number;
    }
  > = {};

  if (dimension === 'SUPPLIERS') {
    rows.forEach((r) => {
      if (!currencyTotals[r.currency]) {
        currencyTotals[r.currency] = {
          overdue_gt_60: 0,
          overdue_31_60: 0,
          overdue_1_30: 0,
          due_0_30: 0,
          due_31_60: 0,
          due_gt_60: 0,
          no_due_date_amount: 0,
          free_credits_amount: 0,
          total_pending_debt: 0,
          net_total_balance: 0,
          count: 0,
        };
      }
      const t = currencyTotals[r.currency];
      t.overdue_gt_60 += r.overdue_gt_60;
      t.overdue_31_60 += r.overdue_31_60;
      t.overdue_1_30 += r.overdue_1_30;
      t.due_0_30 += r.due_0_30;
      t.due_31_60 += r.due_31_60;
      t.due_gt_60 += r.due_gt_60;
      t.no_due_date_amount += r.no_due_date_amount;
      t.free_credits_amount += r.free_credits_amount;
      t.total_pending_debt += r.total_pending_debt;
      t.net_total_balance += r.net_total_balance;
      t.count += 1;
    });
  } else {
    sellerRows.forEach((r) => {
      if (!currencyTotals[r.currency]) {
        currencyTotals[r.currency] = {
          overdue_gt_60: 0,
          overdue_31_60: 0,
          overdue_1_30: 0,
          due_0_30: 0,
          due_31_60: 0,
          due_gt_60: 0,
          no_due_date_amount: 0,
          free_credits_amount: 0,
          total_pending_debt: 0,
          net_total_balance: 0,
          count: 0,
        };
      }
      const t = currencyTotals[r.currency];
      t.overdue_gt_60 += r.overdue_gt_60;
      t.overdue_31_60 += r.overdue_31_60;
      t.overdue_1_30 += r.overdue_1_30;
      t.due_0_30 += r.due_0_30;
      t.due_31_60 += r.due_31_60;
      t.due_gt_60 += r.due_gt_60;
      t.no_due_date_amount += r.no_due_date_amount;
      t.free_credits_amount += 0;
      t.total_pending_debt += r.total_pending_debt;
      t.net_total_balance += r.total_pending_debt;
      t.count += 1;
    });
  }

  const handleOpenDrilldown = (
    row: SupplierAgingRow,
    bucketCode: string,
    bucketLabel: string,
    amount: number
  ) => {
    setDrilldownParams({
      title: `${row.supplier_trade_name} • ${bucketLabel}`,
      subtitle: `Fecha de corte: ${formatDate(cutoffDate)}`,
      supplierId: row.supplier_id,
      currency: row.currency,
      bucketCode,
      expectedAmount: amount,
    });
    setDrilldownModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Top Header Controls */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl shadow-black/20 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-xl font-bold text-white flex items-center space-x-2.5">
                <Clock className="w-6 h-6 text-sky-400" />
                <span>
                  {dimension === 'SUPPLIERS'
                    ? 'Saldo General de Proveedores (Aging por Vencimiento)'
                    : 'Aging de Deuda por Vendedor'}
                </span>
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {dimension === 'SUPPLIERS'
                ? 'Clasificación del saldo actual abierto por rangos de vencimiento sin mezclar monedas'
                : 'Deuda comercial atribuida por vendedor con buckets idénticos de vencimiento'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Dimension Toggle */}
            <div className="flex items-center space-x-1 bg-slate-800 p-1 rounded-xl border border-slate-700">
              <button
                type="button"
                onClick={() => setDimension('SUPPLIERS')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${
                  dimension === 'SUPPLIERS'
                    ? 'bg-sky-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>Por Proveedor</span>
              </button>
              <button
                type="button"
                onClick={() => setDimension('SELLERS')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${
                  dimension === 'SELLERS'
                    ? 'bg-sky-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Por Vendedor</span>
              </button>
            </div>

            {/* Date Cutoff Control */}
            <div className="flex items-center space-x-2.5 bg-slate-800/80 p-2 rounded-xl border border-slate-700/60">
              <label className="text-xs font-semibold text-slate-300 whitespace-nowrap">
                Fecha de Corte:
              </label>
              <DateInput
                value={cutoffDate}
                onChange={(val) => setCutoffDate(val)}
                className="w-32"
              />
            </div>
          </div>
        </div>

        {/* Banner Contextual para Modo Vendedor */}
        {dimension === 'SELLERS' && (
          <div className="p-3 rounded-xl bg-sky-950/40 border border-sky-500/30 text-sky-300 text-xs flex items-center space-x-2.5">
            <AlertCircle className="w-4 h-4 text-sky-400 shrink-0" />
            <span>
              <strong>Aislamiento de Créditos Libres:</strong> La vista por Vendedor muestra la deuda atribuida de cada comprobante. Los créditos libres (OP sin imputar / Remanentes) pertenecen a la cuenta corriente del proveedor y se gestionan desde el Saldo General y Reconciliación.
            </span>
          </div>
        )}

        {/* Filter and Sorting Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder={dimension === 'SUPPLIERS' ? 'Buscar por proveedor o CUIT...' : 'Buscar por vendedor o código...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-400 focus:ring-2 focus:ring-sky-500/50"
            />
          </div>

          <div className="flex flex-wrap items-center space-x-3 text-xs">
            {/* Currency Filter */}
            <div className="flex items-center space-x-1.5">
              <span className="text-slate-400 text-[11px] font-semibold uppercase">Moneda:</span>
              <select
                value={currencyFilter}
                onChange={(e) => setCurrencyFilter(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono"
              >
                <option value="ALL">Todas las Monedas</option>
                {availableCurrencies.map((curr) => (
                  <option key={curr} value={curr}>
                    {curr}
                  </option>
                ))}
              </select>
            </div>

            {/* Sorting Select */}
            <div className="flex items-center space-x-1.5">
              <span className="text-slate-400 text-[11px] font-semibold uppercase">Ordenar por:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-medium"
              >
                <option value="NAME">{dimension === 'SUPPLIERS' ? 'Proveedor' : 'Vendedor'}</option>
                <option value="BALANCE">Saldo Total</option>
                <option value="OVERDUE">Mayor Vencido</option>
              </select>
              <button
                onClick={() => setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC')}
                className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white"
                title={sortOrder === 'ASC' ? 'Ascendente' : 'Descendente'}
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Punctual Payment Filter (only in Supplier dimension) */}
        {dimension === 'SUPPLIERS' && (
          <div className="pt-2.5 border-t border-slate-800">
            <PunctualPaymentFilter
              selectedStatuses={punctualFilters}
              onChangeStatuses={setPunctualFilters}
            />
          </div>
        )}
      </div>

      {/* Currency Totals Overview Banner (Independent per Currency) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(currencyTotals).map(([curr, tot]) => {
          const totalOverdue = tot.overdue_gt_60 + tot.overdue_31_60 + tot.overdue_1_30;
          const totalDue = tot.due_0_30 + tot.due_31_60 + tot.due_gt_60;

          return (
            <div
              key={curr}
              className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4.5 shadow-xl space-y-3"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold bg-sky-500/20 text-sky-300 px-2 py-0.5 rounded font-mono border border-sky-500/30">
                    {curr}
                  </span>
                  <span className="text-xs text-slate-300 font-semibold">
                    Consolidado ({tot.count} registros)
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 block font-sans">Saldo Neto Total</span>
                  <span
                    className={`font-mono font-bold text-sm ${
                      tot.net_total_balance > 0 ? 'text-rose-400' : 'text-emerald-400'
                    }`}
                  >
                    {formatMoney(tot.net_total_balance)} {curr}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center text-xs font-mono">
                <div className="bg-slate-800/40 p-2 rounded-xl border border-rose-500/20">
                  <span className="text-[10px] text-rose-300 font-sans block">Total Vencido</span>
                  <span className="font-bold text-rose-400 text-xs">
                    {formatMoney(totalOverdue)}
                  </span>
                </div>

                <div className="bg-slate-800/40 p-2 rounded-xl border border-slate-700/50">
                  <span className="text-[10px] text-slate-400 font-sans block">A Vencer</span>
                  <span className="font-bold text-slate-200 text-xs">{formatMoney(totalDue)}</span>
                </div>

                <div className="bg-slate-800/40 p-2 rounded-xl border border-amber-500/20">
                  <span className="text-[10px] text-amber-300 font-sans block">Sin Vto</span>
                  <span className="font-bold text-amber-400 text-xs">
                    {formatMoney(tot.no_due_date_amount)}
                  </span>
                </div>

                <div className="bg-slate-800/40 p-2 rounded-xl border border-emerald-500/20">
                  <span className="text-[10px] text-emerald-300 font-sans block">Créditos Libres</span>
                  <span className="font-bold text-emerald-400 text-xs">
                    {formatMoney(tot.free_credits_amount)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Aging Grid */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl shadow-black/30 p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-800/50 text-[10px] uppercase text-slate-400 font-semibold border-b border-slate-800">
              <tr>
                <th className="px-4 py-3 whitespace-nowrap sticky left-0 bg-slate-900 z-10">
                  Proveedor
                </th>
                <th className="px-3 py-3 whitespace-nowrap text-center">Moneda</th>
                <th className="px-3 py-3 text-right text-rose-400 whitespace-nowrap">Vencido &gt;60</th>
                <th className="px-3 py-3 text-right text-rose-300 whitespace-nowrap">Vencido 31-60</th>
                <th className="px-3 py-3 text-right text-rose-200 whitespace-nowrap">Vencido 1-30</th>
                <th className="px-3 py-3 text-right text-sky-200 whitespace-nowrap">A vencer 0-30</th>
                <th className="px-3 py-3 text-right text-sky-300 whitespace-nowrap">A vencer 31-60</th>
                <th className="px-3 py-3 text-right text-sky-400 whitespace-nowrap">A vencer &gt;60</th>
                <th className="px-3 py-3 text-right text-amber-300 whitespace-nowrap">Sin Vto</th>
                <th className="px-3 py-3 text-right text-emerald-400 whitespace-nowrap">
                  Créditos Libres
                </th>
                <th className="px-4 py-3 text-right text-white font-bold whitespace-nowrap">
                  Saldo Total
                </th>
                <th className="px-3 py-3 text-center whitespace-nowrap">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
              {loading ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-400 font-sans">
                    Calculando envejecimiento de saldos...
                  </td>
                </tr>
              ) : (dimension === 'SUPPLIERS' ? filteredRows.length === 0 : filteredSellerRows.length === 0) ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-500 italic font-sans">
                    No existen saldos abiertos bajo los criterios de búsqueda.
                  </td>
                </tr>
              ) : dimension === 'SUPPLIERS' ? (
                filteredRows.map((row) => {
                  return (
                    <tr
                      key={`${row.supplier_id}-${row.currency}`}
                      className="hover:bg-slate-800/40 transition-colors"
                    >
                      {/* Supplier (Sticky) */}
                      <td className="px-4 py-3 font-sans sticky left-0 bg-slate-900 z-10">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white whitespace-nowrap">
                            {row.supplier_trade_name}
                          </span>
                          {row.strict_due_date_discount && (
                            <PunctualPaymentBadge
                              status={row.min_due_date ? calculatePunctualPaymentStatus(row.min_due_date) : 'NO_DUE_DATE'}
                              note={row.discount_payment_note}
                              hasNoDueDateDocs={Boolean(row.has_no_due_date_docs)}
                              dueDate={row.min_due_date}
                              size="sm"
                            />
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 whitespace-nowrap">
                          CUIT: {row.supplier_tax_id}
                        </div>
                      </td>

                      {/* Currency */}
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 border border-slate-700 text-sky-300 font-bold">
                          {row.currency}
                        </span>
                      </td>

                      {/* Overdue > 60 */}
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        {row.overdue_gt_60 > 0 ? (
                          <button
                            onClick={() =>
                              handleOpenDrilldown(
                                row,
                                'OVERDUE_GT_60',
                                'Vencido > 60 días',
                                row.overdue_gt_60
                              )
                            }
                            className="font-bold text-rose-400 hover:underline cursor-pointer"
                          >
                            {formatMoney(row.overdue_gt_60)}
                          </button>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>

                      {/* Overdue 31-60 */}
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        {row.overdue_31_60 > 0 ? (
                          <button
                            onClick={() =>
                              handleOpenDrilldown(
                                row,
                                'OVERDUE_31_60',
                                'Vencido 31 a 60 días',
                                row.overdue_31_60
                              )
                            }
                            className="font-bold text-rose-300 hover:underline cursor-pointer"
                          >
                            {formatMoney(row.overdue_31_60)}
                          </button>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>

                      {/* Overdue 1-30 */}
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        {row.overdue_1_30 > 0 ? (
                          <button
                            onClick={() =>
                              handleOpenDrilldown(
                                row,
                                'OVERDUE_1_30',
                                'Vencido 1 a 30 días',
                                row.overdue_1_30
                              )
                            }
                            className="font-bold text-rose-200 hover:underline cursor-pointer"
                          >
                            {formatMoney(row.overdue_1_30)}
                          </button>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>

                      {/* Due 0-30 */}
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        {row.due_0_30 > 0 ? (
                          <button
                            onClick={() =>
                              handleOpenDrilldown(
                                row,
                                'DUE_0_30',
                                'A vencer 0 a 30 días',
                                row.due_0_30
                              )
                            }
                            className="font-bold text-sky-200 hover:underline cursor-pointer"
                          >
                            {formatMoney(row.due_0_30)}
                          </button>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>

                      {/* Due 31-60 */}
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        {row.due_31_60 > 0 ? (
                          <button
                            onClick={() =>
                              handleOpenDrilldown(
                                row,
                                'DUE_31_60',
                                'A vencer 31 a 60 días',
                                row.due_31_60
                              )
                            }
                            className="font-bold text-sky-300 hover:underline cursor-pointer"
                          >
                            {formatMoney(row.due_31_60)}
                          </button>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>

                      {/* Due > 60 */}
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        {row.due_gt_60 > 0 ? (
                          <button
                            onClick={() =>
                              handleOpenDrilldown(
                                row,
                                'DUE_GT_60',
                                'A vencer > 60 días',
                                row.due_gt_60
                              )
                            }
                            className="font-bold text-sky-400 hover:underline cursor-pointer"
                          >
                            {formatMoney(row.due_gt_60)}
                          </button>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>

                      {/* No Due Date */}
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        {row.no_due_date_amount > 0 ? (
                          <button
                            onClick={() =>
                              handleOpenDrilldown(
                                row,
                                'NO_DUE_DATE',
                                'Documentos sin Vencimiento',
                                row.no_due_date_amount
                              )
                            }
                            className="font-bold text-amber-300 hover:underline cursor-pointer"
                          >
                            {formatMoney(row.no_due_date_amount)}
                          </button>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>

                      {/* Free Credits */}
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        {row.free_credits_amount < 0 ? (
                          <button
                            onClick={() =>
                              handleOpenDrilldown(
                                row,
                                'FREE_CREDIT',
                                'Créditos y Anticipos Libres',
                                row.free_credits_amount
                              )
                            }
                            className="font-bold text-emerald-400 hover:underline cursor-pointer"
                          >
                            {formatMoney(row.free_credits_amount)}
                          </button>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>

                      {/* Net Total Balance */}
                      <td className="px-4 py-3 text-right font-bold whitespace-nowrap">
                        <button
                          onClick={() =>
                            handleOpenDrilldown(
                              row,
                              'ALL',
                              'Totalidad de Comprobantes Abiertos',
                              row.net_total_balance
                            )
                          }
                          className={`hover:underline cursor-pointer ${
                            row.net_total_balance > 0
                              ? 'text-rose-400'
                              : row.net_total_balance < 0
                              ? 'text-emerald-400'
                              : 'text-slate-300'
                          }`}
                        >
                          {formatMoney(row.net_total_balance)}
                        </button>
                      </td>

                      {/* Action */}
                      <td className="px-3 py-3 text-center font-sans whitespace-nowrap">
                        {onSelectSupplierAccount && (
                          <button
                            onClick={() => onSelectSupplierAccount(row.supplier_id)}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-sky-300 text-[11px] font-semibold transition-colors"
                          >
                            Ver CC
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                /* Mode SELLERS */
                filteredSellerRows.map((sRow) => (
                  <tr
                    key={`${sRow.seller_id}-${sRow.currency}`}
                    className="hover:bg-slate-800/40 transition-colors"
                  >
                    {/* Seller Name (Sticky) */}
                    <td className="px-4 py-3 font-sans sticky left-0 bg-slate-900 z-10">
                      <div className="flex items-center space-x-2">
                        <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span className="font-bold text-white whitespace-nowrap">
                          {sRow.seller_display_name}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 whitespace-nowrap mt-0.5">
                        {sRow.seller_code && (
                          <span className="font-mono text-sky-300 mr-2">{sRow.seller_code}</span>
                        )}
                        <span>{sRow.active_suppliers_count} proveedor(es) con deuda</span>
                      </div>
                    </td>

                    {/* Currency */}
                    <td className="px-3 py-3 text-center whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 border border-slate-700 text-sky-300 font-bold">
                        {sRow.currency}
                      </span>
                    </td>

                    {/* Overdue > 60 */}
                    <td className="px-3 py-3 text-right whitespace-nowrap font-bold text-rose-400">
                      {sRow.overdue_gt_60 > 0 ? formatMoney(sRow.overdue_gt_60) : <span className="text-slate-600 font-normal">-</span>}
                    </td>

                    {/* Overdue 31-60 */}
                    <td className="px-3 py-3 text-right whitespace-nowrap font-bold text-rose-300">
                      {sRow.overdue_31_60 > 0 ? formatMoney(sRow.overdue_31_60) : <span className="text-slate-600 font-normal">-</span>}
                    </td>

                    {/* Overdue 1-30 */}
                    <td className="px-3 py-3 text-right whitespace-nowrap font-bold text-rose-200">
                      {sRow.overdue_1_30 > 0 ? formatMoney(sRow.overdue_1_30) : <span className="text-slate-600 font-normal">-</span>}
                    </td>

                    {/* Due 0-30 */}
                    <td className="px-3 py-3 text-right whitespace-nowrap font-bold text-sky-200">
                      {sRow.due_0_30 > 0 ? formatMoney(sRow.due_0_30) : <span className="text-slate-600 font-normal">-</span>}
                    </td>

                    {/* Due 31-60 */}
                    <td className="px-3 py-3 text-right whitespace-nowrap font-bold text-sky-300">
                      {sRow.due_31_60 > 0 ? formatMoney(sRow.due_31_60) : <span className="text-slate-600 font-normal">-</span>}
                    </td>

                    {/* Due > 60 */}
                    <td className="px-3 py-3 text-right whitespace-nowrap font-bold text-sky-400">
                      {sRow.due_gt_60 > 0 ? formatMoney(sRow.due_gt_60) : <span className="text-slate-600 font-normal">-</span>}
                    </td>

                    {/* No Due Date */}
                    <td className="px-3 py-3 text-right whitespace-nowrap font-bold text-amber-300">
                      {sRow.no_due_date_amount > 0 ? formatMoney(sRow.no_due_date_amount) : <span className="text-slate-600 font-normal">-</span>}
                    </td>

                    {/* Free Credits (Isolated) */}
                    <td className="px-3 py-3 text-right whitespace-nowrap text-slate-500 italic">
                      -
                    </td>

                    {/* Total Pending Debt */}
                    <td className="px-4 py-3 text-right font-bold text-rose-400 whitespace-nowrap">
                      {formatMoney(sRow.total_pending_debt)}
                    </td>

                    {/* Action */}
                    <td className="px-3 py-3 text-center font-sans whitespace-nowrap text-slate-500">
                      -
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drilldown Modal */}
      {drilldownModalOpen && drilldownParams && (
        <BucketDetailModal
          isOpen={drilldownModalOpen}
          onClose={() => setDrilldownModalOpen(false)}
          title={drilldownParams.title}
          subtitle={drilldownParams.subtitle}
          supplierId={drilldownParams.supplierId}
          currency={drilldownParams.currency}
          context="AGING"
          bucketCode={drilldownParams.bucketCode}
          cutoffDate={cutoffDate}
          expectedAmount={drilldownParams.expectedAmount}
        />
      )}
    </div>
  );
};
