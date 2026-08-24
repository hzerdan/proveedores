import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { DocumentType } from '../../types/database';
import { useAuth } from '../../context/AuthContext';
import {
  FileCode2,
  Plus,
  Check,
  X,
  AlertCircle,
} from 'lucide-react';

export const DocumentTypesMaster: React.FC = () => {
  const { hasPermission } = useAuth();
  const [docTypes, setDocTypes] = useState<DocumentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State for new Document Type
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [balanceNature, setBalanceNature] = useState<'DEBIT' | 'CREDIT' | 'NEUTRAL'>('DEBIT');
  const [affectsAccountBalance, setAffectsAccountBalance] = useState(true);
  const [canBeSource, setCanBeSource] = useState(false);
  const [canBeTarget, setCanBeTarget] = useState(true);
  const [requiresDueDate, setRequiresDueDate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchDocTypes = async () => {
    setLoading(true);
    try {
      const { data, error: err } = await supabase
        .from('document_types')
        .select('*')
        .order('id', { ascending: true });

      if (err) throw err;
      setDocTypes(data || []);
    } catch (err) {
      console.error('Error fetching document types:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocTypes();
  }, []);

  const handleToggleActive = async (type: DocumentType) => {
    if (!hasPermission('system.manage')) return;
    try {
      const { error: updErr } = await supabase
        .from('document_types')
        .update({ is_active: !type.is_active })
        .eq('id', type.id);

      if (updErr) throw updErr;
      fetchDocTypes();
    } catch (err: any) {
      console.error('Error toggling document type:', err);
    }
  };

  const handleCreateType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasPermission('system.manage')) return;
    setError(null);
    setSaving(true);

    try {
      const { error: insErr } = await supabase.from('document_types').insert({
        code: code.trim().toUpperCase().replace(/\s+/g, '_'),
        name: name.trim(),
        description: description.trim() || null,
        balance_nature: balanceNature,
        affects_account_balance: affectsAccountBalance,
        can_be_source_application: canBeSource,
        can_be_target_application: canBeTarget,
        requires_due_date: requiresDueDate,
        is_system_internal: false,
        is_active: true,
      });

      if (insErr) throw insErr;

      setIsModalOpen(false);
      setCode('');
      setName('');
      setDescription('');
      fetchDocTypes();
    } catch (err: any) {
      console.error('Error creating document type:', err);
      setError(err.message || 'Error al crear tipo de comprobante');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl shadow-black/20">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <FileCode2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Maestro: Tipos de Documentos</h1>
            <p className="text-xs text-slate-400">
              Parametrización dinámica de naturalezas, reglas de imputación y vencimientos sin modificar código
            </p>
          </div>
        </div>

        {hasPermission('system.manage') && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center space-x-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-sky-900/30 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Tipo de Comprobante</span>
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl shadow-black/30">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-800/60 text-[11px] uppercase text-slate-400 font-semibold border-b border-slate-800">
              <tr>
                <th className="px-6 py-4">Código & Nombre</th>
                <th className="px-6 py-4">Naturaleza Contable</th>
                <th className="px-6 py-4 text-center">Afecta CC</th>
                <th className="px-6 py-4 text-center">Origen Imputación</th>
                <th className="px-6 py-4 text-center">Destino Imputación</th>
                <th className="px-6 py-4 text-center">Requiere Venc.</th>
                <th className="px-6 py-4 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-normal">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    Cargando catálogo...
                  </td>
                </tr>
              ) : (
                docTypes.map((type) => (
                  <tr key={type.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-white font-mono text-sm">{type.code}</div>
                      <div className="text-slate-400 text-xs">{type.name}</div>
                      {type.description && (
                        <div className="text-[10px] text-slate-500 mt-0.5">{type.description}</div>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      <span
                        className={`inline-block px-2.5 py-1 rounded text-[10px] font-bold border ${
                          type.balance_nature === 'DEBIT'
                            ? 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                            : type.balance_nature === 'CREDIT'
                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                            : 'bg-violet-500/10 text-violet-300 border-violet-500/20'
                        }`}
                      >
                        {type.balance_nature}
                      </span>
                    </td>

                    <td className="px-6 py-4 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                          type.affects_account_balance
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-slate-800 text-slate-500 border border-slate-700'
                        }`}
                      >
                        {type.affects_account_balance ? 'SÍ' : 'NO'}
                      </span>
                    </td>

                    <td className="px-6 py-4 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                          type.can_be_source_application
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-slate-800 text-slate-500 border border-slate-700'
                        }`}
                      >
                        {type.can_be_source_application ? 'SÍ' : 'NO'}
                      </span>
                    </td>

                    <td className="px-6 py-4 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                          type.can_be_target_application
                            ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                            : 'bg-slate-800 text-slate-500 border border-slate-700'
                        }`}
                      >
                        {type.can_be_target_application ? 'SÍ' : 'NO'}
                      </span>
                    </td>

                    <td className="px-6 py-4 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                          type.requires_due_date
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'bg-slate-800 text-slate-500 border border-slate-700'
                        }`}
                      >
                        {type.requires_due_date ? 'SÍ' : 'NO'}
                      </span>
                    </td>

                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => handleToggleActive(type)}
                        disabled={!hasPermission('system.manage')}
                        className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                          type.is_active
                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20 hover:bg-emerald-500/20'
                            : 'bg-slate-800 text-slate-500 border-slate-700 hover:bg-slate-700'
                        }`}
                      >
                        {type.is_active ? 'Activo' : 'Inactivo'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Alta Tipo de Comprobante */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/40">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  <Plus className="w-5 h-5" />
                </div>
                <h2 className="text-base font-bold text-white">Nuevo Tipo de Comprobante</h2>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateType} className="p-6 space-y-4 text-xs">
              {error && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Código Único *</label>
                  <input
                    type="text"
                    required
                    placeholder="ej: RETENCION_IIBB"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono uppercase"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Nombre Descriptivo *</label>
                  <input
                    type="text"
                    required
                    placeholder="ej: Retención de IIBB"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Descripción / Finalidad</label>
                <input
                  type="text"
                  placeholder="Detalle operativo..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Naturaleza Contable *</label>
                <select
                  value={balanceNature}
                  onChange={(e) => setBalanceNature(e.target.value as any)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold"
                >
                  <option value="DEBIT">DEBIT (Incrementa deuda con proveedor)</option>
                  <option value="CREDIT">CREDIT (Disminuye deuda o genera crédito a favor)</option>
                  <option value="NEUTRAL">NEUTRAL (Informativo, sin impacto en CC)</option>
                </select>
              </div>

              {/* Switches */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <label className="flex items-center space-x-2.5 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={affectsAccountBalance}
                    onChange={(e) => setAffectsAccountBalance(e.target.checked)}
                    className="rounded bg-slate-800 border-slate-700 text-sky-600 focus:ring-sky-500 h-4 w-4"
                  />
                  <span>Afecta Saldo de Cuenta Corriente</span>
                </label>

                <label className="flex items-center space-x-2.5 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={canBeSource}
                    onChange={(e) => setCanBeSource(e.target.checked)}
                    className="rounded bg-slate-800 border-slate-700 text-sky-600 focus:ring-sky-500 h-4 w-4"
                  />
                  <span>Puede ser Origen de Aplicación (Cancela otros comprobantes)</span>
                </label>

                <label className="flex items-center space-x-2.5 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={canBeTarget}
                    onChange={(e) => setCanBeTarget(e.target.checked)}
                    className="rounded bg-slate-800 border-slate-700 text-sky-600 focus:ring-sky-500 h-4 w-4"
                  />
                  <span>Puede ser Destino de Aplicación (Recibe pagos o créditos)</span>
                </label>

                <label className="flex items-center space-x-2.5 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requiresDueDate}
                    onChange={(e) => setRequiresDueDate(e.target.checked)}
                    className="rounded bg-slate-800 border-slate-700 text-sky-600 focus:ring-sky-500 h-4 w-4"
                  />
                  <span>Requiere Fecha de Vencimiento obligatoria</span>
                </label>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center space-x-2 bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 rounded-xl font-bold transition-all disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{saving ? 'Guardando...' : 'Crear Tipo'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
