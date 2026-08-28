import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { formatDate } from '../../lib/formatters';
import { Plus, X, Check, AlertCircle, Building2, UserCheck } from 'lucide-react';

interface SellerSuppliersManagerProps {
  mode: 'FOR_SELLER' | 'FOR_SUPPLIER';
  sellerId?: number;
  supplierId?: number;
  onRefresh?: () => void;
}

export const SellerSuppliersManager: React.FC<SellerSuppliersManagerProps> = ({
  mode,
  sellerId,
  supplierId,
  onRefresh,
}) => {
  const { hasPermission } = useAuth();
  const [relationships, setRelationships] = useState<any[]>([]);
  const [availableOptions, setAvailableOptions] = useState<any[]>([]);
  const [_isLoading, setIsLoading] = useState(false);

  // Link Modal / Form states
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedEntityId, setSelectedEntityId] = useState<number | ''>('');
  const [validFrom, setValidFrom] = useState(new Date().toISOString().split('T')[0]);
  const [validTo, setValidTo] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // End Relationship Modal states
  const [endingRelId, setEndingRelId] = useState<number | null>(null);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      if (mode === 'FOR_SELLER' && sellerId) {
        // Fetch all supplier_sellers for this seller
        const { data: rels } = await supabase
          .from('supplier_sellers')
          .select(`
            id,
            supplier_id,
            seller_id,
            valid_from,
            valid_to,
            is_active,
            notes,
            created_at,
            suppliers (
              id,
              code,
              trade_name,
              legal_name,
              tax_id,
              is_active
            )
          `)
          .eq('seller_id', sellerId)
          .order('valid_from', { ascending: false });

        setRelationships(rels || []);

        // Fetch all active suppliers to populate dropdown
        const { data: sups } = await supabase
          .from('suppliers')
          .select('id, code, trade_name, tax_id')
          .eq('is_active', true)
          .order('trade_name');

        setAvailableOptions(sups || []);
      } else if (mode === 'FOR_SUPPLIER' && supplierId) {
        // Fetch all supplier_sellers for this supplier
        const { data: rels } = await supabase
          .from('supplier_sellers')
          .select(`
            id,
            supplier_id,
            seller_id,
            valid_from,
            valid_to,
            is_active,
            notes,
            created_at,
            sellers (
              id,
              code,
              first_name,
              last_name,
              display_name,
              phone,
              email,
              is_active
            )
          `)
          .eq('supplier_id', supplierId)
          .order('valid_from', { ascending: false });

        setRelationships(rels || []);

        // Fetch all active sellers to populate dropdown
        const { data: sels } = await supabase
          .from('sellers')
          .select('id, code, display_name, email, phone')
          .eq('is_active', true)
          .order('display_name');

        setAvailableOptions(sels || []);
      }
    } catch (err) {
      console.error('Error loading supplier_seller relationships:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerId, supplierId, mode]);

  const handleLinkEntity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntityId) {
      setError('Debe seleccionar una entidad.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const supId = mode === 'FOR_SELLER' ? Number(selectedEntityId) : supplierId!;
      const selId = mode === 'FOR_SELLER' ? sellerId! : Number(selectedEntityId);

      const { data, error: rpcErr } = await supabase.rpc('rpc_link_supplier_seller', {
        p_supplier_id: supId,
        p_seller_id: selId,
        p_valid_from: validFrom,
        p_valid_to: validTo || null,
        p_notes: notes.trim() || null,
      });

      if (rpcErr) throw rpcErr;
      if (data && !data.success) {
        throw new Error(data.message || 'No se pudo vincular la relación');
      }

      setShowAddModal(false);
      setSelectedEntityId('');
      setNotes('');
      setValidTo('');
      await loadData();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      console.error('Error linking supplier and seller:', err);
      setError(err.message || 'Error al vincular la relación');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEndRelationship = async () => {
    if (!endingRelId) return;
    setIsSubmitting(true);
    try {
      const { data, error: rpcErr } = await supabase.rpc('rpc_end_supplier_seller_relationship', {
        p_relationship_id: endingRelId,
        p_end_date: endDate,
      });

      if (rpcErr) throw rpcErr;
      if (data && !data.success) {
        throw new Error(data.message || 'Error al finalizar relación');
      }

      setEndingRelId(null);
      await loadData();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      console.error('Error ending relationship:', err);
      alert(err.message || 'Error al finalizar la relación');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isRelationshipCurrentlyValid = (rel: any) => {
    const today = new Date().toISOString().split('T')[0];
    const started = rel.valid_from <= today;
    const notEnded = !rel.valid_to || rel.valid_to >= today;
    return rel.is_active && started && notEnded;
  };

  return (
    <div className="space-y-3">
      {/* Header & Add Button */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-2">
            {mode === 'FOR_SELLER' ? (
              <>
                <Building2 className="w-4 h-4 text-sky-400" />
                <span>Proveedores Representados ({relationships.length})</span>
              </>
            ) : (
              <>
                <UserCheck className="w-4 h-4 text-emerald-400" />
                <span>Vendedores Asignados ({relationships.length})</span>
              </>
            )}
          </h3>
          <p className="text-[11px] text-slate-400">
            Relaciones comerciales con histórico inmutable de vigencia
          </p>
        </div>

        {hasPermission('seller_supplier.manage') && (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setShowAddModal(true);
            }}
            className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sky-400 hover:text-white px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>
              {mode === 'FOR_SELLER' ? '+ Asociar Proveedor' : '+ Asociar Vendedor'}
            </span>
          </button>
        )}
      </div>

      {/* Relationships Table */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-2xl overflow-hidden shadow-inner">
        {relationships.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 italic">
            {mode === 'FOR_SELLER'
              ? 'Este vendedor no tiene proveedores vinculados actualmente.'
              : 'Este proveedor no tiene vendedores vinculados actualmente.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 border-b border-slate-800 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2.5">
                    {mode === 'FOR_SELLER' ? 'Proveedor' : 'Vendedor'}
                  </th>
                  <th className="px-3 py-2.5">Vigencia Desde</th>
                  <th className="px-3 py-2.5">Vigencia Hasta</th>
                  <th className="px-3 py-2.5">Estado</th>
                  <th className="px-3 py-2.5">Observaciones</th>
                  <th className="px-4 py-2.5 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {relationships.map((rel) => {
                  const currentlyValid = isRelationshipCurrentlyValid(rel);
                  const isFinished = rel.valid_to && rel.valid_to < new Date().toISOString().split('T')[0];

                  const entityName =
                    mode === 'FOR_SELLER'
                      ? rel.suppliers?.trade_name || 'Proveedor'
                      : rel.sellers?.display_name || 'Vendedor';

                  const entityCode =
                    mode === 'FOR_SELLER'
                      ? rel.suppliers?.tax_id
                      : rel.sellers?.code || rel.sellers?.email;

                  return (
                    <tr
                      key={rel.id}
                      className="hover:bg-slate-900/40 transition-colors group"
                    >
                      <td className="px-4 py-3">
                        <div className="font-bold text-white text-xs">{entityName}</div>
                        {entityCode && (
                          <div className="text-[10px] text-slate-400 font-mono">
                            {entityCode}
                          </div>
                        )}
                      </td>

                      <td className="px-3 py-3 text-slate-300 font-mono text-[11px]">
                        {formatDate(rel.valid_from)}
                      </td>

                      <td className="px-3 py-3 font-mono text-[11px]">
                        {rel.valid_to ? (
                          <span className={isFinished ? 'text-rose-400' : 'text-slate-300'}>
                            {formatDate(rel.valid_to)}
                          </span>
                        ) : (
                          <span className="text-emerald-400 font-medium italic">Indefinida</span>
                        )}
                      </td>

                      <td className="px-3 py-3">
                        {currentlyValid ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 inline-flex items-center space-x-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                            <span>Vigente</span>
                          </span>
                        ) : isFinished ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                            Finalizada
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Inactiva
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-3 text-slate-400 text-[11px] max-w-xs truncate">
                        {rel.notes || '-'}
                      </td>

                      <td className="px-4 py-3 text-right">
                        {currentlyValid && hasPermission('seller_supplier.manage') && (
                          <button
                            type="button"
                            onClick={() => {
                              setEndingRelId(rel.id);
                              setEndDate(new Date().toISOString().split('T')[0]);
                            }}
                            className="text-[11px] text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-2.5 py-1 rounded-lg border border-amber-500/30 transition-all"
                          >
                            Finalizar Vigencia
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Vincular Nueva Relación */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/40">
              <h3 className="text-sm font-bold text-white">
                {mode === 'FOR_SELLER' ? 'Vincular Proveedor al Vendedor' : 'Vincular Vendedor al Proveedor'}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleLinkEntity} className="p-6 space-y-4 text-xs">
              {error && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  {mode === 'FOR_SELLER' ? 'Seleccionar Proveedor *' : 'Seleccionar Vendedor *'}
                </label>
                <select
                  required
                  value={selectedEntityId}
                  onChange={(e) => setSelectedEntityId(Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-medium focus:ring-2 focus:ring-sky-500/50"
                >
                  <option value="" disabled>
                    -- Seleccione una opción --
                  </option>
                  {availableOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {mode === 'FOR_SELLER'
                        ? `${opt.trade_name} (${opt.tax_id})`
                        : `${opt.display_name} ${opt.code ? `(${opt.code})` : ''}`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Válido Desde *
                  </label>
                  <input
                    type="date"
                    required
                    value={validFrom}
                    onChange={(e) => setValidFrom(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Válido Hasta (Opcional)
                  </label>
                  <input
                    type="date"
                    value={validTo}
                    onChange={(e) => setValidTo(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Observaciones de la relación
                </label>
                <textarea
                  rows={2}
                  placeholder="Ej: Cobertura exclusiva para línea repuestos..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold flex items-center space-x-2"
                >
                  <Check className="w-4 h-4" />
                  <span>Vincular Relación</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Finalizar Relación Comercial */}
      {endingRelId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl shadow-2xl p-6 space-y-4 text-xs">
            <div className="flex items-center space-x-3 text-amber-400">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <div>
                <h4 className="text-sm font-bold text-white">Finalizar Relación Comercial</h4>
                <p className="text-[11px] text-slate-400">
                  La relación quedará archivada históricamente. Los comprobantes existentes no serán modificados.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                Fecha de Finalización
              </label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-mono"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setEndingRelId(null)}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleEndRelationship}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold shadow-md shadow-amber-900/30"
              >
                Confirmar Finalización
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
