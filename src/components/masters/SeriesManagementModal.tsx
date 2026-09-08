import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { DocumentType, DocumentNumberingSeries, DocumentNumberingSeriesAdjustment } from '../../types/database';
import { useAuth } from '../../context/AuthContext';
import {
  X,
  Plus,
  Hash,
  AlertTriangle,
  History,
  TrendingUp,
  Power,
  CheckCircle2,
} from 'lucide-react';


interface SeriesManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentType: DocumentType | null;
  onSeriesChanged?: () => void;
}

export const SeriesManagementModal: React.FC<SeriesManagementModalProps> = ({
  isOpen,
  onClose,
  documentType,
  onSeriesChanged
}) => {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('system.manage');

  const [seriesList, setSeriesList] = useState<DocumentNumberingSeries[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // New series form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newPos, setNewPos] = useState<number>(1);
  const [newLetter, setNewLetter] = useState<string>('');
  const [newNextNumber, setNewNextNumber] = useState<number>(1);
  const [newDescription, setNewDescription] = useState<string>('');
  const [savingNew, setSavingNew] = useState(false);

  // Adjust series modal state
  const [adjustingSeries, setAdjustingSeries] = useState<DocumentNumberingSeries | null>(null);
  const [adjustNewNumber, setAdjustNewNumber] = useState<number>(1);
  const [adjustReason, setAdjustReason] = useState<string>('');
  const [savingAdjust, setSavingAdjust] = useState(false);

  // Adjustments history modal state
  const [viewingHistorySeries, setViewingHistorySeries] = useState<DocumentNumberingSeries | null>(null);
  const [historyList, setHistoryList] = useState<DocumentNumberingSeriesAdjustment[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const pad4 = (num: number) => num.toString().padStart(4, '0');
  const pad8 = (num: number | null | undefined) => (num !== null && num !== undefined) ? num.toString().padStart(8, '0') : '--------';

  const loadSeries = useCallback(async () => {
    if (!documentType) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('document_numbering_series')
        .select('*')
        .eq('document_type_id', documentType.id)
        .order('point_of_sale', { ascending: true });

      if (err) throw err;
      setSeriesList((data as DocumentNumberingSeries[]) || []);
    } catch (err: any) {
      console.error('Error loading series:', err);
      setError(err.message || 'Error al cargar las series.');
    } finally {
      setLoading(false);
    }
  }, [documentType]);

  useEffect(() => {
    if (isOpen && documentType) {
      loadSeries();
      setShowCreateForm(false);
      setAdjustingSeries(null);
      setViewingHistorySeries(null);
      setError(null);
      setSuccess(null);
    }
  }, [isOpen, documentType, loadSeries]);

  const handleToggleActive = async (series: DocumentNumberingSeries) => {
    if (!canManage) return;
    setError(null);
    try {
      const { error: updErr } = await supabase
        .from('document_numbering_series')
        .update({ is_active: !series.is_active })
        .eq('id', series.id);

      if (updErr) throw updErr;
      setSuccess(`Serie PV ${pad4(series.point_of_sale)} ${!series.is_active ? 'activada' : 'desactivada'} exitosamente.`);
      loadSeries();
      if (onSeriesChanged) onSeriesChanged();
    } catch (err: any) {
      console.error('Error toggling series:', err);
      setError(err.message || 'Error al modificar estado de la serie.');
    }
  };

  const handleCreateSeries = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage || !documentType) return;
    setError(null);
    setSavingNew(true);
    try {
      if (newPos < 1 || newPos > 9999) {
        throw new Error('El punto de venta debe estar entre 1 y 9999.');
      }
      if (newNextNumber < 1 || newNextNumber > 99999999) {
        throw new Error('El próximo número debe estar entre 1 y 99999999.');
      }

      const { error: insErr } = await supabase.from('document_numbering_series').insert({
        document_type_id: documentType.id,
        point_of_sale: newPos,
        letter: newLetter.trim() ? newLetter.trim().toUpperCase() : null,
        next_number: newNextNumber,
        description: newDescription.trim() || null,
        is_active: true
      });

      if (insErr) throw insErr;

      setSuccess(`Serie PV ${pad4(newPos)} creada correctamente.`);
      setShowCreateForm(false);
      setNewDescription('');
      loadSeries();
      if (onSeriesChanged) onSeriesChanged();
    } catch (err: any) {
      console.error('Error creating series:', err);
      setError(err.message || 'Error al crear la serie.');
    } finally {
      setSavingNew(false);
    }
  };

  const handleOpenAdjust = (series: DocumentNumberingSeries) => {
    if (series.is_exhausted || series.next_number === null) {
      setError('La serie está agotada. No es posible ajustar su contador.');
      return;
    }
    setAdjustingSeries(series);
    setAdjustNewNumber(series.next_number + 1);
    setAdjustReason('');
    setError(null);
  };

  const handleSubmitAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage || !adjustingSeries || adjustingSeries.next_number === null) return;
    setError(null);
    setSavingAdjust(true);
    try {
      if (!adjustReason.trim()) {
        throw new Error('Debe especificar un motivo obligatorio para el ajuste administrativo.');
      }
      if (adjustNewNumber <= adjustingSeries.next_number) {
        throw new Error('El nuevo valor solo puede avanzar (debe ser estrictamente mayor al valor actual).');
      }
      if (adjustNewNumber > 99999999) {
        throw new Error('El valor no puede superar 99999999.');
      }

      const { error: rpcErr } = await supabase.rpc('rpc_adjust_numbering_series', {
        p_series_id: adjustingSeries.id,
        p_new_number: adjustNewNumber,
        p_reason: adjustReason.trim()
      });

      if (rpcErr) throw rpcErr;

      setSuccess(`Contador de la serie PV ${pad4(adjustingSeries.point_of_sale)} avanzado exitosamente a #${pad8(adjustNewNumber)}.`);
      setAdjustingSeries(null);
      loadSeries();
      if (onSeriesChanged) onSeriesChanged();
    } catch (err: any) {
      console.error('Error adjusting series counter:', err);
      setError(err.message || 'Error al ajustar el contador de la serie.');
    } finally {
      setSavingAdjust(false);
    }
  };

  const handleOpenHistory = async (series: DocumentNumberingSeries) => {
    setViewingHistorySeries(series);
    setLoadingHistory(true);
    try {
      const { data, error: histErr } = await supabase
        .from('document_numbering_series_adjustments')
        .select('*')
        .eq('series_id', series.id)
        .order('adjusted_at', { ascending: false });

      if (histErr) throw histErr;
      setHistoryList((data as DocumentNumberingSeriesAdjustment[]) || []);
    } catch (err: any) {
      console.error('Error loading history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  if (!isOpen || !documentType) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/50 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <Hash className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                Series de Numeración: {documentType.name} ({documentType.code})
              </h3>
              <p className="text-[11px] text-slate-400">
                Administración de correlatividades, puntos de venta y avance auditado de contadores
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* Top toolbar */}
          <div className="flex items-center justify-between">
            <div className="text-slate-400">
              Modo actual del tipo:{' '}
              <span className="font-semibold text-white font-mono bg-slate-800 px-2 py-0.5 rounded">
                {documentType.numbering_mode || 'EXTERNAL'}
              </span>
            </div>

            {canManage && !showCreateForm && (
              <button
                type="button"
                onClick={() => setShowCreateForm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors shadow-sm"
              >
                <Plus size={14} />
                <span>+ Nueva Serie</span>
              </button>
            )}
          </div>

          {/* Form: Add new series */}
          {showCreateForm && (
            <form onSubmit={handleCreateSeries} className="p-4 bg-slate-800/50 border border-slate-700 rounded-2xl space-y-3">
              <div className="flex items-center justify-between border-b border-slate-700/60 pb-2">
                <span className="font-bold text-white text-xs">Crear Nueva Serie para {documentType.code}</span>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                    Punto Venta (4 dig) *
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={9999}
                    value={newPos}
                    onChange={(e) => setNewPos(parseInt(e.target.value, 10) || 1)}
                    required
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                    Letra (Opcional)
                  </label>
                  <input
                    type="text"
                    maxLength={2}
                    placeholder="Ej: A, B, C"
                    value={newLetter}
                    onChange={(e) => setNewLetter(e.target.value.toUpperCase())}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-white font-mono uppercase"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                    Próximo Número *
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={99999999}
                    value={newNextNumber}
                    onChange={(e) => setNewNextNumber(parseInt(e.target.value, 10) || 1)}
                    required
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                    Descripción
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Emisión Sucursal Central"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-3 py-1.5 rounded-xl text-slate-300 hover:text-white bg-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingNew}
                  className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold shadow-sm disabled:opacity-50"
                >
                  {savingNew ? 'Creando...' : 'Crear Serie'}
                </button>
              </div>
            </form>
          )}

          {/* Series Table */}
          <div className="border border-slate-800 rounded-2xl overflow-hidden">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/80 text-[10px] uppercase text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Punto de Venta</th>
                  <th className="px-4 py-3">Letra</th>
                  <th className="px-4 py-3">Próximo Número</th>
                  <th className="px-4 py-3">Descripción</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-normal">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                      Cargando series de numeración...
                    </td>
                  </tr>
                ) : seriesList.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                      No hay series configuradas para este tipo de comprobante.
                    </td>
                  </tr>
                ) : (
                  seriesList.map((s) => {
                    const isExhausted = s.is_exhausted || s.next_number === null || s.next_number > 99999999;
                    return (
                      <tr key={s.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-white text-sm">
                          {pad4(s.point_of_sale)}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-300">
                          {s.letter || '-'}
                        </td>
                        <td className="px-4 py-3 font-mono">
                          {isExhausted ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                              AGOTADA
                            </span>
                          ) : (
                            <span className="font-semibold text-sky-400">
                              #{pad8(s.next_number)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-400">
                          {s.description || '-'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              s.is_active
                                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}
                          >
                            {s.is_active ? 'Activa' : 'Inactiva'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* Adjust Counter */}
                            {canManage && (
                              <button
                                type="button"
                                disabled={isExhausted}
                                onClick={() => handleOpenAdjust(s)}
                                title={isExhausted ? 'Serie agotada (no ajustable)' : 'Ajustar contador hacia adelante (auditado)'}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-400 hover:text-sky-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <TrendingUp size={14} />
                              </button>
                            )}

                            {/* View Audit History */}
                            <button
                              type="button"
                              onClick={() => handleOpenHistory(s)}
                              title="Ver historial de ajustes auditados"
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                            >
                              <History size={14} />
                            </button>

                            {/* Toggle Active */}
                            {canManage && (
                              <button
                                type="button"
                                onClick={() => handleToggleActive(s)}
                                title={s.is_active ? 'Desactivar serie' : 'Activar serie'}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  s.is_active
                                    ? 'bg-slate-800 hover:bg-rose-950/40 text-slate-400 hover:text-rose-300'
                                    : 'bg-slate-800 hover:bg-emerald-950/40 text-slate-400 hover:text-emerald-300'
                                }`}
                              >
                                <Power size={14} />
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

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-800/40 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700"
          >
            Cerrar
          </button>
        </div>
      </div>

      {/* Submodal: Adjust Counter (system.manage) */}
      {adjustingSeries && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-sky-400">
                <TrendingUp size={18} />
                <h4 className="text-sm font-bold text-white">Ajuste de Contador (Auditoría)</h4>
              </div>
              <button
                type="button"
                onClick={() => setAdjustingSeries(null)}
                className="text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Ajuste del próximo número para la serie PV <strong>{pad4(adjustingSeries.point_of_sale)}</strong> ({documentType.code}).
              Por seguridad, solo es posible <strong>avanzar</strong> el contador y el motivo quedará registrado de forma inmutable.
            </p>

            <form onSubmit={handleSubmitAdjust} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Valor actual:</label>
                <div className="font-mono text-white text-sm bg-slate-800 px-3 py-2 rounded-xl">
                  #{pad8(adjustingSeries.next_number)}
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  Nuevo próximo número a emitir *
                </label>
                <input
                  type="number"
                  min={(adjustingSeries.next_number ?? 0) + 1}
                  max={99999999}
                  value={adjustNewNumber}
                  onChange={(e) => setAdjustNewNumber(parseInt(e.target.value, 10) || ((adjustingSeries.next_number ?? 0) + 1))}
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  Motivo obligatorio del ajuste *
                </label>
                <textarea
                  rows={3}
                  placeholder="Justifique el motivo administrativo del salto de numeración..."
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAdjustingSeries(null)}
                  className="px-3 py-1.5 rounded-xl text-slate-300 bg-slate-800 hover:bg-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingAdjust}
                  className="px-4 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold disabled:opacity-50"
                >
                  {savingAdjust ? 'Guardando...' : 'Confirmar Ajuste'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Submodal: View Audit History */}
      {viewingHistorySeries && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-xl rounded-2xl shadow-2xl p-5 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
              <div className="flex items-center gap-2 text-white">
                <History size={18} className="text-sky-400" />
                <h4 className="text-sm font-bold">Historial de Ajustes: PV {pad4(viewingHistorySeries.point_of_sale)}</h4>
              </div>
              <button
                type="button"
                onClick={() => setViewingHistorySeries(null)}
                className="text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 space-y-2 text-xs">
              {loadingHistory ? (
                <div className="text-center py-6 text-slate-400">Cargando historial auditado...</div>
              ) : historyList.length === 0 ? (
                <div className="text-center py-6 text-slate-400">No se registran ajustes manuales en esta serie.</div>
              ) : (
                historyList.map((h) => (
                  <div key={h.id} className="p-3 bg-slate-800/60 border border-slate-700/60 rounded-xl space-y-1">
                    <div className="flex items-center justify-between font-mono text-[11px]">
                      <span className="text-rose-400">#{pad8(h.old_next_number)}</span>
                      <span className="text-slate-500">➔</span>
                      <span className="text-emerald-400 font-bold">#{pad8(h.new_next_number)}</span>
                      <span className="text-slate-400 text-[10px]">
                        {new Date(h.adjusted_at).toLocaleString('es-AR')}
                      </span>
                    </div>
                    <p className="text-slate-300 italic pt-1">
                      &ldquo;{h.reason}&rdquo;
                    </p>
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setViewingHistorySeries(null)}
                className="px-4 py-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
