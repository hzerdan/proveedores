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
  Search,
  Edit2,
  Power,
  Lock,
} from 'lucide-react';

export const DocumentTypesMaster: React.FC = () => {
  const { hasPermission } = useAuth();
  const [docTypes, setDocTypes] = useState<DocumentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [natureFilter, setNatureFilter] = useState<'ALL' | 'DEBIT' | 'CREDIT' | 'NEUTRAL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<DocumentType | null>(null);

  // Form State
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [balanceNature, setBalanceNature] = useState<'DEBIT' | 'CREDIT' | 'NEUTRAL'>('DEBIT');
  const [affectsAccountBalance, setAffectsAccountBalance] = useState(true);
  const [canBeSource, setCanBeSource] = useState(false);
  const [canBeTarget, setCanBeTarget] = useState(true);
  const [requiresDueDate, setRequiresDueDate] = useState(false);
  const [isActive, setIsActive] = useState(true);
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

  const handleOpenCreate = () => {
    setEditingType(null);
    setCode('');
    setName('');
    setDescription('');
    setBalanceNature('DEBIT');
    setAffectsAccountBalance(true);
    setCanBeSource(false);
    setCanBeTarget(true);
    setRequiresDueDate(false);
    setIsActive(true);
    setError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (type: DocumentType) => {
    setEditingType(type);
    setCode(type.code);
    setName(type.name);
    setDescription(type.description || '');
    setBalanceNature(type.balance_nature);
    setAffectsAccountBalance(type.affects_account_balance);
    setCanBeSource(type.can_be_source_application);
    setCanBeTarget(type.can_be_target_application);
    setRequiresDueDate(Boolean(type.requires_due_date));
    setIsActive(type.is_active);
    setError(null);
    setIsModalOpen(true);
  };

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasPermission('system.manage')) return;
    setError(null);
    setSaving(true);

    try {
      if (!name.trim()) {
        throw new Error('Debe ingresar un nombre descriptivo para el tipo de comprobante.');
      }

      if (!editingType && !code.trim()) {
        throw new Error('Debe ingresar un código identificador único.');
      }

      if (editingType) {
        // Update existing document type
        const { error: updErr } = await supabase
          .from('document_types')
          .update({
            name: name.trim(),
            description: description.trim() || null,
            balance_nature: balanceNature,
            affects_account_balance: affectsAccountBalance,
            can_be_source_application: canBeSource,
            can_be_target_application: canBeTarget,
            requires_due_date: requiresDueDate,
            is_active: isActive,
          })
          .eq('id', editingType.id);

        if (updErr) throw updErr;
      } else {
        // Create new document type
        const cleanCode = code.trim().toUpperCase().replace(/\s+/g, '_');
        const { error: insErr } = await supabase.from('document_types').insert({
          code: cleanCode,
          name: name.trim(),
          description: description.trim() || null,
          balance_nature: balanceNature,
          affects_account_balance: affectsAccountBalance,
          can_be_source_application: canBeSource,
          can_be_target_application: canBeTarget,
          requires_due_date: requiresDueDate,
          is_system_internal: false,
          is_active: isActive,
        });

        if (insErr) throw insErr;
      }

      setIsModalOpen(false);
      fetchDocTypes();
    } catch (err: any) {
      console.error('Error saving document type:', err);
      setError(err.message || 'Error al guardar el tipo de comprobante');
    } finally {
      setSaving(false);
    }
  };

  // Filtered List
  const filteredDocTypes = docTypes.filter((t) => {
    const matchesSearch =
      t.code.toLowerCase().includes(search.toLowerCase()) ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      (t.description && t.description.toLowerCase().includes(search.toLowerCase()));

    const matchesNature = natureFilter === 'ALL' || t.balance_nature === natureFilter;
    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && t.is_active) ||
      (statusFilter === 'INACTIVE' && !t.is_active);

    return matchesSearch && matchesNature && matchesStatus;
  });

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/90 p-5 rounded-3xl border border-slate-800 shadow-xl shadow-black/20">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-sky-600 to-indigo-600 text-white shadow-lg shadow-sky-500/20">
            <FileCode2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">ABM: Tipos de Comprobantes</h1>
            <p className="text-xs text-slate-400">
              Gestión y parametrización de comprobantes, naturalezas contables y reglas de imputación en el Ledger
            </p>
          </div>
        </div>

        {hasPermission('system.manage') && (
          <button
            onClick={handleOpenCreate}
            className="flex items-center space-x-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white px-4 py-2.5 rounded-2xl text-xs font-bold shadow-lg shadow-sky-900/30 transition-all shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>+ Nuevo Tipo de Comprobante</span>
          </button>
        )}
      </div>

      {/* Filters Bar */}
      <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por código o nombre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:ring-2 focus:ring-sky-500/50"
          />
        </div>

        {/* Nature and Status Filters */}
        <div className="flex items-center space-x-2.5 w-full md:w-auto overflow-x-auto text-xs">
          <select
            value={natureFilter}
            onChange={(e) => setNatureFilter(e.target.value as any)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 font-medium"
          >
            <option value="ALL">Todas las Naturalezas</option>
            <option value="DEBIT">Débito (+ Saldo)</option>
            <option value="CREDIT">Crédito (- Saldo)</option>
            <option value="NEUTRAL">Neutro (Informativo)</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 font-medium"
          >
            <option value="ALL">Todos los Estados</option>
            <option value="ACTIVE">Solo Activos</option>
            <option value="INACTIVE">Solo Inactivos</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl shadow-black/30">
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
                <th className="px-6 py-4 text-center">Tipo</th>
                <th className="px-6 py-4 text-center">Estado</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-normal">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-slate-400">
                    Cargando catálogo de tipos de comprobantes...
                  </td>
                </tr>
              ) : filteredDocTypes.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-slate-400">
                    No se encontraron tipos de comprobantes con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filteredDocTypes.map((type) => (
                  <tr key={type.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-white font-mono text-sm">{type.code}</span>
                        {type.is_system_internal && (
                          <span title="Comprobante interno del sistema" className="text-amber-400">
                            <Lock className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>
                      <div className="text-slate-300 font-medium text-xs mt-0.5">{type.name}</div>
                      {type.description && (
                        <div className="text-[11px] text-slate-500 mt-0.5">{type.description}</div>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-lg text-[10px] font-bold border ${
                          type.balance_nature === 'DEBIT'
                            ? 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                            : type.balance_nature === 'CREDIT'
                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                            : 'bg-violet-500/10 text-violet-300 border-violet-500/20'
                        }`}
                      >
                        {type.balance_nature === 'DEBIT'
                          ? 'DÉBITO (+)'
                          : type.balance_nature === 'CREDIT'
                          ? 'CRÉDITO (-)'
                          : 'NEUTRO (0)'}
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
                      <span className="text-[10px] font-mono text-slate-400">
                        {type.is_system_internal ? 'Sistema' : 'Personalizado'}
                      </span>
                    </td>

                    <td className="px-6 py-4 text-center">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                          type.is_active
                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        {type.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>

                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        <button
                          onClick={() => handleOpenEdit(type)}
                          title="Editar tipo de comprobante"
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleToggleActive(type)}
                          disabled={type.is_system_internal}
                          title={
                            type.is_system_internal
                              ? 'Los comprobantes del sistema no pueden desactivarse'
                              : type.is_active
                              ? 'Desactivar comprobante'
                              : 'Activar comprobante'
                          }
                          className={`p-1.5 rounded-lg transition-colors ${
                            type.is_system_internal
                              ? 'opacity-30 cursor-not-allowed bg-slate-800 text-slate-600'
                              : type.is_active
                              ? 'bg-slate-800 hover:bg-rose-950/40 text-slate-400 hover:text-rose-300'
                              : 'bg-slate-800 hover:bg-emerald-950/40 text-slate-400 hover:text-emerald-300'
                          }`}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal ABM: Alta / Edición */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/40">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  <FileCode2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {editingType ? `Editar Tipo de Comprobante: ${editingType.code}` : 'Nuevo Tipo de Comprobante'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Definí el comportamiento contable y reglas de imputación
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
              {error && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Código Identificador *
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: NOTA_CREDITO_ESP"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    disabled={Boolean(editingType)}
                    required
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono uppercase placeholder-slate-500 focus:ring-2 focus:ring-sky-500/50 disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Nombre Descriptivo *
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Nota de Crédito Especial"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:ring-2 focus:ring-sky-500/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Descripción / Finalidad Operativa
                </label>
                <textarea
                  rows={2}
                  placeholder="Detalle o justificación de uso de este tipo de comprobante"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:ring-2 focus:ring-sky-500/50"
                />
              </div>

              {/* Balance Nature */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Naturaleza Económica en el Ledger *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setBalanceNature('DEBIT')}
                    className={`p-2.5 rounded-xl border text-center font-bold text-xs transition-all ${
                      balanceNature === 'DEBIT'
                        ? 'bg-rose-500/20 border-rose-500 text-rose-300 shadow-md shadow-rose-950/40'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    DÉBITO (+)
                    <span className="block text-[10px] font-normal text-slate-400 mt-0.5">Aumenta deuda</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBalanceNature('CREDIT')}
                    className={`p-2.5 rounded-xl border text-center font-bold text-xs transition-all ${
                      balanceNature === 'CREDIT'
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-md shadow-emerald-950/40'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    CRÉDITO (-)
                    <span className="block text-[10px] font-normal text-slate-400 mt-0.5">Disminuye deuda</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBalanceNature('NEUTRAL')}
                    className={`p-2.5 rounded-xl border text-center font-bold text-xs transition-all ${
                      balanceNature === 'NEUTRAL'
                        ? 'bg-violet-500/20 border-violet-500 text-violet-300 shadow-md shadow-violet-950/40'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    NEUTRO (0)
                    <span className="block text-[10px] font-normal text-slate-400 mt-0.5">Solo informativo</span>
                  </button>
                </div>
              </div>

              {/* Behavior Checkboxes */}
              <div className="space-y-2.5 pt-2 border-t border-slate-800">
                <label className="flex items-center space-x-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={affectsAccountBalance}
                    onChange={(e) => setAffectsAccountBalance(e.target.checked)}
                    className="w-4 h-4 rounded text-sky-600 bg-slate-800 border-slate-700 focus:ring-sky-500"
                  />
                  <span className="text-slate-300">Afecta el saldo global de Cuenta Corriente</span>
                </label>

                <label className="flex items-center space-x-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={canBeSource}
                    onChange={(e) => setCanBeSource(e.target.checked)}
                    className="w-4 h-4 rounded text-sky-600 bg-slate-800 border-slate-700 focus:ring-sky-500"
                  />
                  <span className="text-slate-300">Puede ser comprobante ORIGEN de imputación (genera crédito aplicable)</span>
                </label>

                <label className="flex items-center space-x-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={canBeTarget}
                    onChange={(e) => setCanBeTarget(e.target.checked)}
                    className="w-4 h-4 rounded text-sky-600 bg-slate-800 border-slate-700 focus:ring-sky-500"
                  />
                  <span className="text-slate-300">Puede ser comprobante DESTINO de imputación (recibe pagos o aplicaciones)</span>
                </label>

                <label className="flex items-center space-x-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requiresDueDate}
                    onChange={(e) => setRequiresDueDate(e.target.checked)}
                    className="w-4 h-4 rounded text-sky-600 bg-slate-800 border-slate-700 focus:ring-sky-500"
                  />
                  <span className="text-slate-300">Exigir fecha de vencimiento de pago obligatoria</span>
                </label>

                <label className="flex items-center space-x-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    disabled={editingType?.is_system_internal}
                    className="w-4 h-4 rounded text-emerald-600 bg-slate-800 border-slate-700 focus:ring-emerald-500"
                  />
                  <span className="text-slate-300">Comprobante Activo y disponible para carga</span>
                </label>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end space-x-2.5 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center space-x-1.5 px-4 py-2 rounded-xl font-bold text-white bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 shadow-md shadow-sky-900/30 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{saving ? 'Guardando...' : editingType ? 'Guardar Cambios' : 'Crear Tipo de Comprobante'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
