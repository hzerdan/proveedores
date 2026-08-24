import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { PaymentProjectionRecord } from '../../types/database';
import { formatDate, formatMoney } from '../../lib/formatters';
import { BucketDetailModal } from '../aging/BucketDetailModal';
import {
  Calendar,
  Search,
  TrendingUp,
  AlertCircle,
} from 'lucide-react';

interface PaymentProjectionViewProps {
  onSelectSupplierAccount?: (supplierId: number) => void;
}

interface WeekColumn {
  key: string;
  start: string;
  end: string;
  label: string;
}

export const PaymentProjectionView: React.FC<PaymentProjectionViewProps> = ({
  onSelectSupplierAccount,
}) => {
  const [cutoffDate, setCutoffDate] = useState(new Date().toISOString().split('T')[0]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [records, setRecords] = useState<PaymentProjectionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('ALL');

  // Drilldown Modal state
  const [drilldownModalOpen, setDrilldownModalOpen] = useState(false);
  const [drilldownParams, setDrilldownParams] = useState<{
    title: string;
    subtitle: string;
    supplierId: number;
    currency: string;
    bucketCode?: string;
    weekStart?: string | null;
    expectedAmount?: number;
  } | null>(null);

  const fetchProjectionData = async () => {
    setError(null);

    if (dateFrom && dateTo && dateFrom > dateTo) {
      setError('La fecha "Desde" no puede ser mayor que la fecha "Hasta".');
      return;
    }

    setLoading(true);
    try {
      const { data, error: rpcErr } = await supabase.rpc('rpc_get_payment_projection', {
        p_cutoff_date: cutoffDate,
        p_date_from: dateFrom || null,
        p_date_to: dateTo || null,
      });

      if (rpcErr) throw rpcErr;
      setRecords(data || []);
    } catch (err: any) {
      console.error('Error fetching payment projection:', err);
      setError(err.message || 'Error al cargar la proyección de pagos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjectionData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cutoffDate, dateFrom, dateTo]);

  // Extract distinct chronological weeks
  const weekMap = new Map<string, WeekColumn>();
  records.forEach((r) => {
    if (r.bucket_type === 'WEEK' && r.week_start && r.week_end) {
      if (!weekMap.has(r.week_start)) {
        const startFormatted = formatDate(r.week_start).slice(0, 5);
        const endFormatted = formatDate(r.week_end).slice(0, 5);
        weekMap.set(r.week_start, {
          key: r.week_start,
          start: r.week_start,
          end: r.week_end,
          label: `Lun ${startFormatted} - Dom ${endFormatted}`,
        });
      }
    }
  });

  const weekColumns = Array.from(weekMap.values()).sort((a, b) =>
    a.start.localeCompare(b.start)
  );

  // Group records by supplier_id + currency
  interface SupplierPivotRow {
    supplier_id: number;
    supplier_trade_name: string;
    supplier_tax_id: string;
    currency: string;
    overdue: number;
    weeks: Record<string, number>;
    noDueDate: number;
    total: number;
  }

  const pivotMap = new Map<string, SupplierPivotRow>();

  records.forEach((r) => {
    const rowKey = `${r.supplier_id}-${r.currency}`;
    if (!pivotMap.has(rowKey)) {
      pivotMap.set(rowKey, {
        supplier_id: r.supplier_id,
        supplier_trade_name: r.supplier_trade_name,
        supplier_tax_id: r.supplier_tax_id,
        currency: r.currency,
        overdue: 0,
        weeks: {},
        noDueDate: 0,
        total: 0,
      });
    }

    const row = pivotMap.get(rowKey)!;
    row.total += r.amount;

    if (r.bucket_type === 'OVERDUE') {
      row.overdue += r.amount;
    } else if (r.bucket_type === 'NO_DUE_DATE') {
      row.noDueDate += r.amount;
    } else if (r.bucket_type === 'WEEK' && r.week_start) {
      row.weeks[r.week_start] = (row.weeks[r.week_start] || 0) + r.amount;
    }
  });

  const availableCurrencies = Array.from(new Set(records.map((r) => r.currency)));

  // Filter rows
  const filteredRows = Array.from(pivotMap.values())
    .filter((row) => {
      const q = search.toLowerCase();
      const matchSearch =
        row.supplier_trade_name.toLowerCase().includes(q) ||
        row.supplier_tax_id.toLowerCase().includes(q);
      const matchCurrency = currencyFilter === 'ALL' || row.currency === currencyFilter;
      return matchSearch && matchCurrency;
    })
    .sort((a, b) => a.supplier_trade_name.localeCompare(b.supplier_trade_name));

  // Weekly & Overall Totals strictly by currency
  const currencyTotals: Record<
    string,
    {
      overdue: number;
      weeks: Record<string, number>;
      noDueDate: number;
      total: number;
      supplierCount: number;
    }
  > = {};

  filteredRows.forEach((row) => {
    if (!currencyTotals[row.currency]) {
      currencyTotals[row.currency] = {
        overdue: 0,
        weeks: {},
        noDueDate: 0,
        total: 0,
        supplierCount: 0,
      };
    }
    const tot = currencyTotals[row.currency];
    tot.overdue += row.overdue;
    tot.noDueDate += row.noDueDate;
    tot.total += row.total;
    tot.supplierCount += 1;

    Object.entries(row.weeks).forEach(([wStart, amt]) => {
      tot.weeks[wStart] = (tot.weeks[wStart] || 0) + amt;
    });
  });

  const handleOpenDrilldown = (
    row: SupplierPivotRow,
    bucketCode: string,
    bucketLabel: string,
    amount: number,
    weekStart?: string
  ) => {
    setDrilldownParams({
      title: `${row.supplier_trade_name} • ${bucketLabel}`,
      subtitle: `Fecha de corte: ${formatDate(cutoffDate)}`,
      supplierId: row.supplier_id,
      currency: row.currency,
      bucketCode,
      weekStart,
      expectedAmount: amount,
    });
    setDrilldownModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header and Filter Controls */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl shadow-black/20 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center space-x-2.5">
              <TrendingUp className="w-6 h-6 text-emerald-400" />
              <span>Proyección de Pagos por Semana (Lunes a Domingo)</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Obligaciones reales de pago agrupadas en semanas calendario sin horizontes truncados
            </p>
          </div>

          {/* Date Cutoff and Range Filters */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Cutoff Date */}
            <div className="flex items-center space-x-2 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700/60 text-xs">
              <Calendar className="w-4 h-4 text-sky-400 shrink-0" />
              <label className="font-semibold text-slate-300 whitespace-nowrap">Fecha Corte:</label>
              <input
                type="date"
                value={cutoffDate}
                onChange={(e) => setCutoffDate(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-0.5 text-xs text-white font-mono"
              />
            </div>

            {/* Date Range Filters (Optional) */}
            <div className="flex items-center space-x-2 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700/60 text-xs">
              <span className="text-slate-400 font-semibold uppercase text-[10px]">Vto Desde:</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-0.5 text-xs text-white font-mono"
              />
              <span className="text-slate-400 font-semibold uppercase text-[10px]">Hasta:</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-0.5 text-xs text-white font-mono"
              />
              {(dateFrom || dateTo) && (
                <button
                  onClick={() => {
                    setDateFrom('');
                    setDateTo('');
                  }}
                  className="text-[10px] text-sky-400 hover:underline font-semibold ml-1"
                >
                  Limpiar
                </button>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center space-x-2 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Search & Currency Filter */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800 text-xs">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por proveedor o CUIT..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-400 focus:ring-2 focus:ring-emerald-500/50"
            />
          </div>

          <div className="flex items-center space-x-3">
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
        </div>
      </div>

      {/* Main Projection Matrix Grid */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl shadow-black/30 p-4 space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-800/50 text-[10px] uppercase text-slate-400 font-semibold border-b border-slate-800">
              <tr>
                <th className="px-4 py-3 whitespace-nowrap sticky left-0 bg-slate-900 z-10">
                  Proveedor
                </th>
                <th className="px-3 py-3 whitespace-nowrap text-center">Moneda</th>
                <th className="px-3 py-3 text-right text-rose-400 whitespace-nowrap">Vencido</th>
                {weekColumns.map((col) => (
                  <th
                    key={col.key}
                    className="px-3 py-3 text-right text-sky-300 whitespace-nowrap font-mono"
                  >
                    {col.label}
                  </th>
                ))}
                <th className="px-3 py-3 text-right text-amber-300 whitespace-nowrap">Sin Vto</th>
                <th className="px-4 py-3 text-right text-white font-bold whitespace-nowrap">
                  Total Deuda
                </th>
                <th className="px-3 py-3 text-center whitespace-nowrap">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
              {loading ? (
                <tr>
                  <td
                    colSpan={6 + weekColumns.length}
                    className="py-12 text-center text-slate-400 font-sans"
                  >
                    Construyendo proyección semanal...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6 + weekColumns.length}
                    className="py-12 text-center text-slate-500 italic font-sans"
                  >
                    No hay obligaciones de pago con saldo para los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr
                    key={`${row.supplier_id}-${row.currency}`}
                    className="hover:bg-slate-800/40 transition-colors"
                  >
                    {/* Supplier (Sticky) */}
                    <td className="px-4 py-3 font-sans sticky left-0 bg-slate-900 z-10">
                      <div className="font-bold text-white whitespace-nowrap">
                        {row.supplier_trade_name}
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

                    {/* Overdue */}
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      {row.overdue > 0 ? (
                        <button
                          onClick={() =>
                            handleOpenDrilldown(row, 'OVERDUE', 'Deuda Vencida', row.overdue)
                          }
                          className="font-bold text-rose-400 hover:underline cursor-pointer"
                        >
                          {formatMoney(row.overdue)}
                        </button>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>

                    {/* Dynamic Weeks */}
                    {weekColumns.map((col) => {
                      const weekAmt = row.weeks[col.start] || 0;
                      return (
                        <td key={col.key} className="px-3 py-3 text-right whitespace-nowrap">
                          {weekAmt > 0 ? (
                            <button
                              onClick={() =>
                                handleOpenDrilldown(
                                  row,
                                  'WEEK',
                                  `Semana ${col.label}`,
                                  weekAmt,
                                  col.start
                                )
                              }
                              className="font-bold text-sky-300 hover:underline cursor-pointer"
                            >
                              {formatMoney(weekAmt)}
                            </button>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>
                      );
                    })}

                    {/* No Due Date */}
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      {row.noDueDate > 0 ? (
                        <button
                          onClick={() =>
                            handleOpenDrilldown(
                              row,
                              'NO_DUE_DATE',
                              'Documentos sin Vencimiento',
                              row.noDueDate
                            )
                          }
                          className="font-bold text-amber-300 hover:underline cursor-pointer"
                        >
                          {formatMoney(row.noDueDate)}
                        </button>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>

                    {/* Total Row Debt */}
                    <td className="px-4 py-3 text-right font-bold text-white whitespace-nowrap">
                      <button
                        onClick={() =>
                          handleOpenDrilldown(
                            row,
                            'ALL',
                            'Total Deuda Proyectada',
                            row.total
                          )
                        }
                        className="hover:underline cursor-pointer text-rose-400"
                      >
                        {formatMoney(row.total)}
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
                ))
              )}
            </tbody>

            {/* Totals Footer Rows per Currency (Never Mixed) */}
            {Object.entries(currencyTotals).map(([curr, tot]) => (
              <tfoot
                key={`tot-${curr}`}
                className="bg-slate-800/60 font-mono text-xs border-t-2 border-slate-700 font-bold"
              >
                <tr>
                  <td className="px-4 py-3 text-white font-sans sticky left-0 bg-slate-850 z-10 whitespace-nowrap">
                    TOTAL GENERAL ({curr})
                  </td>
                  <td className="px-3 py-3 text-center whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 border border-slate-700 text-sky-300">
                      {curr}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right text-rose-400 whitespace-nowrap">
                    {formatMoney(tot.overdue)}
                  </td>
                  {weekColumns.map((col) => (
                    <td
                      key={`tot-${col.key}`}
                      className="px-3 py-3 text-right text-sky-300 whitespace-nowrap"
                    >
                      {formatMoney(tot.weeks[col.start] || 0)}
                    </td>
                  ))}
                  <td className="px-3 py-3 text-right text-amber-300 whitespace-nowrap">
                    {formatMoney(tot.noDueDate)}
                  </td>
                  <td className="px-4 py-3 text-right text-rose-400 text-sm whitespace-nowrap">
                    {formatMoney(tot.total)}
                  </td>
                  <td className="px-3 py-3"></td>
                </tr>
              </tfoot>
            ))}
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
          context="PROJECTION"
          bucketCode={drilldownParams.bucketCode}
          cutoffDate={cutoffDate}
          weekStart={drilldownParams.weekStart}
          dateFrom={dateFrom || null}
          dateTo={dateTo || null}
          expectedAmount={drilldownParams.expectedAmount}
        />
      )}
    </div>
  );
};
