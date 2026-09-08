import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { DocumentNumberingSeries, NumberingMode } from '../../types/database';
import { Hash, AlertTriangle, AlertCircle } from 'lucide-react';

interface SeriesSelectorProps {
  documentTypeId: number | null;
  letter?: string | null;
  selectedSeriesId: number | null;
  onSelectSeries: (series: DocumentNumberingSeries | null) => void;
  onModeLoaded?: (mode: NumberingMode, seriesList: DocumentNumberingSeries[]) => void;
  disabled?: boolean;
}

export const SeriesSelector: React.FC<SeriesSelectorProps> = ({
  documentTypeId,
  letter,
  selectedSeriesId,
  onSelectSeries,
  onModeLoaded,
  disabled = false
}) => {
  const [numberingMode, setNumberingMode] = useState<NumberingMode>('EXTERNAL');
  const [seriesList, setSeriesList] = useState<DocumentNumberingSeries[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSelectSeriesRef = useRef(onSelectSeries);
  onSelectSeriesRef.current = onSelectSeries;

  const onModeLoadedRef = useRef(onModeLoaded);
  onModeLoadedRef.current = onModeLoaded;

  const selectedSeriesIdRef = useRef(selectedSeriesId);
  selectedSeriesIdRef.current = selectedSeriesId;

  useEffect(() => {
    if (!documentTypeId) {
      setSeriesList([]);
      setNumberingMode('EXTERNAL');
      onSelectSeriesRef.current(null);
      return;
    }

    let isMounted = true;
    const loadSeries = async () => {
      setLoading(true);
      setError(null);
      try {
        // 1. Fetch document type numbering mode
        const { data: docType, error: typeErr } = await supabase
          .from('document_types')
          .select('id, numbering_mode')
          .eq('id', documentTypeId)
          .single();

        if (typeErr) throw typeErr;
        const mode = (docType?.numbering_mode as NumberingMode) || 'EXTERNAL';
        if (!isMounted) return;
        setNumberingMode(mode);

        if (mode === 'INTERNAL_SEQUENCE') {
          // 2. Fetch active series for this document type
          let query = supabase
            .from('document_numbering_series')
            .select('*')
            .eq('document_type_id', documentTypeId)
            .eq('is_active', true)
            .order('point_of_sale', { ascending: true });

          if (letter) {
            query = query.or(`letter.eq.${letter},letter.is.null`);
          }

          const { data: series, error: seriesErr } = await query;
          if (seriesErr) throw seriesErr;

          const loaded = (series as DocumentNumberingSeries[]) || [];
          if (!isMounted) return;
          setSeriesList(loaded);

          if (onModeLoadedRef.current) {
            onModeLoadedRef.current(mode, loaded);
          }

          // Filter out exhausted series for automatic selection
          const available = loaded.filter(s => !s.is_exhausted && s.next_number !== null && s.next_number <= 99999999);

          if (available.length === 1) {
            // Single available non-exhausted series -> auto-select
            onSelectSeriesRef.current(available[0]);
          } else if (available.length > 1) {
            // Multiple available series -> maintain if already valid, otherwise null until user selects
            const stillValid = available.find(s => s.id === selectedSeriesIdRef.current);
            onSelectSeriesRef.current(stillValid || null);
          } else {
            // 0 available series
            onSelectSeriesRef.current(null);
          }
        } else {
          setSeriesList([]);
          onSelectSeriesRef.current(null);
          if (onModeLoadedRef.current) {
            onModeLoadedRef.current(mode, []);
          }
        }
      } catch (err: any) {
        console.error('Error loading document numbering series:', err);
        if (isMounted) setError(err.message || 'Error al cargar series');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadSeries();

    return () => {
      isMounted = false;
    };
  }, [documentTypeId, letter]);

  if (!documentTypeId || numberingMode === 'EXTERNAL') {
    return null;
  }

  const pad4 = (num: number) => num.toString().padStart(4, '0');
  const pad8 = (num: number | null | undefined) => (num !== null && num !== undefined) ? num.toString().padStart(8, '0') : '--------';

  if (loading) {
    return (
      <div className="p-3 bg-slate-800/40 rounded-xl border border-slate-700 text-xs text-slate-400 flex items-center gap-2">
        <div className="w-3.5 h-3.5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
        <span>Cargando configuración de serie correlativa...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Error al cargar series</p>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  const availableSeries = seriesList.filter(s => !s.is_exhausted && s.next_number !== null && s.next_number <= 99999999);
  const exhaustedSeries = seriesList.filter(s => s.is_exhausted || s.next_number === null || s.next_number > 99999999);
  const selectedSeries = seriesList.find(s => s.id === selectedSeriesId);
  const isSelectedExhausted = selectedSeries ? (selectedSeries.is_exhausted || selectedSeries.next_number === null || selectedSeries.next_number > 99999999) : false;
  const remainingNumbers = (selectedSeries && selectedSeries.next_number !== null) ? Math.max(0, 99999999 - selectedSeries.next_number + 1) : 0;

  // Case 0 available series
  if (seriesList.length === 0 || availableSeries.length === 0) {
    const exhaustedPos = exhaustedSeries[0] ? pad4(exhaustedSeries[0].point_of_sale) : null;
    return (
      <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-rose-200">Emisión Bloqueada</p>
          <p className="mt-0.5 leading-relaxed">
            {exhaustedPos ? (
              `La serie del punto de venta ${exhaustedPos} alcanzó el último número disponible. Seleccione otra serie activa o solicite a un administrador la creación de una nueva serie.`
            ) : (
              'Este tipo documental requiere numeración correlativa interna pero no posee series activas configuradas. Solicite a un administrador activar o crear una serie.'
            )}
          </p>
        </div>
      </div>
    );
  }

  // Case 1 single available series (auto-selected)
  if (availableSeries.length === 1) {
    const series = availableSeries[0];
    return (
      <div className="space-y-2">
        <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
              <Hash className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-300">
                Punto de Venta: <span className="font-mono text-sky-300 font-semibold">{pad4(series.point_of_sale)}</span>
                {series.letter && <span className="ml-2 font-mono text-amber-300">({series.letter})</span>}
              </p>
              <p className="text-[11px] text-slate-400">
                Próximo a emitir (estimado): <span className="font-mono font-bold text-emerald-400">{pad8(series.next_number)}</span>
              </p>
            </div>
          </div>
          <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded bg-sky-500/10 text-sky-300 border border-sky-500/20 self-start sm:self-center">
            Serie Asignada
          </span>
        </div>

        {/* Warning if <= 100 numbers remain */}
        {remainingNumbers <= 100 && remainingNumbers > 0 && (
          <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>La serie está próxima a agotarse. Restan {remainingNumbers} números.</span>
          </div>
        )}
      </div>
    );
  }

  // Case > 1 active series (mandatory selection)
  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
        Serie de Numeración <span className="text-rose-400">*</span>
      </label>
      <select
        value={selectedSeriesId || ''}
        onChange={(e) => {
          const id = e.target.value ? parseInt(e.target.value, 10) : null;
          const found = seriesList.find(s => s.id === id) || null;
          onSelectSeries(found);
        }}
        disabled={disabled}
        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-sky-500 transition-colors"
      >
        <option value="">-- Seleccione una serie activa obligatoria --</option>
        {seriesList.map((s) => {
          const isExhausted = s.is_exhausted || s.next_number === null || s.next_number > 99999999;
          return (
            <option key={s.id} value={s.id} disabled={isExhausted}>
              POS {pad4(s.point_of_sale)} {s.letter ? `(${s.letter})` : ''} - Próximo: {pad8(s.next_number)} {isExhausted ? '[AGOTADA]' : (s.description ? `(${s.description})` : '')}
            </option>
          );
        })}
      </select>

      {/* If an exhausted series is selected */}
      {isSelectedExhausted && selectedSeries && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <p>
            La serie del punto de venta {pad4(selectedSeries.point_of_sale)} alcanzó el último número disponible. Seleccione otra serie activa o solicite a un administrador la creación de una nueva serie.
          </p>
        </div>
      )}

      {/* Selected valid series preview and exhaustion warning */}
      {selectedSeries && !isSelectedExhausted && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-slate-400 pl-1">
            Próximo número correlativo estimado: <span className="font-mono font-bold text-emerald-400">{pad8(selectedSeries.next_number)}</span>
          </p>
          {remainingNumbers <= 100 && remainingNumbers > 0 && (
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>La serie está próxima a agotarse. Restan {remainingNumbers} números.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
