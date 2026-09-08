import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Supplier } from '../../types/database';
import { isValidCuit, formatCuit, cleanCuit } from '../../lib/cuitValidator';
import { X, Building2, Check, AlertCircle, AlertTriangle } from 'lucide-react';

interface SupplierQuickCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSupplierCreated: (supplier: Supplier) => void;
  initialTaxId?: string;
  initialName?: string;
}

export const SupplierQuickCreateModal: React.FC<SupplierQuickCreateModalProps> = ({
  isOpen,
  onClose,
  onSupplierCreated,
  initialTaxId = '',
  initialName = '',
}) => {
  const [taxId, setTaxId] = useState(initialTaxId);
  const [tradeName, setTradeName] = useState(initialName);
  const [legalName, setLegalName] = useState(initialName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const clean = cleanCuit(taxId);
    if (clean.length !== 11) {
      setError('El CUIT debe contener exactamente 11 dígitos.');
      return;
    }

    if (!isValidCuit(clean)) {
      setError('El CUIT ingresado no es válido (dígito verificador incorrecto).');
      return;
    }

    if (!tradeName.trim()) {
      setError('Debe ingresar el nombre o razón social del proveedor.');
      return;
    }

    setLoading(true);
    try {
      const { data, error: rpcErr } = await supabase.rpc('rpc_quick_create_supplier', {
        p_tax_id: clean,
        p_trade_name: tradeName.trim(),
        p_legal_name: legalName.trim() || tradeName.trim(),
      });

      if (rpcErr) throw rpcErr;
      if (data && data.supplier) {
        onSupplierCreated(data.supplier);
        onClose();
      } else {
        throw new Error('No se pudo crear el proveedor');
      }
    } catch (err: any) {
      console.error('Error in quick create supplier:', err);
      setError(err.message || 'Error al dar de alta el proveedor');
    } finally {
      setLoading(false);
    }
  };

  const isCuitValid = taxId ? isValidCuit(taxId) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/40">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Alta Rápida de Proveedor</h3>
              <p className="text-[11px] text-slate-400">Crear proveedor sin salir de la carga del comprobante</p>
            </div>
          </div>
          <button
            onClick={onClose}
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

          <div>
            <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
              CUIT *
            </label>
            <input
              type="text"
              placeholder="30-12345678-9"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              onBlur={() => {
                if (isValidCuit(taxId)) setTaxId(formatCuit(taxId));
              }}
              required
              className={`w-full bg-slate-800 border rounded-xl px-3.5 py-2.5 text-white font-mono text-sm tracking-wider placeholder-slate-500 transition-colors ${
                isCuitValid === false
                  ? 'border-amber-500/80 focus:border-amber-400 focus:ring-1 focus:ring-amber-500'
                  : isCuitValid === true
                  ? 'border-emerald-500/60 focus:border-emerald-400'
                  : 'border-slate-700 focus:border-sky-500'
              }`}
            />
            {isCuitValid === false && (
              <p className="text-[11px] text-amber-400 mt-1.5 flex items-center gap-1.5 font-medium">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>CUIT con error de Módulo 11 o longitud no válida. Verificá los 11 dígitos.</span>
              </p>
            )}
            {isCuitValid === true && (
              <p className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1 font-medium">
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span>CUIT válido según algoritmo AFIP</span>
              </p>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
              Nombre de Fantasía / Comercial *
            </label>
            <input
              type="text"
              placeholder="Ej: Distribuidora Norte"
              value={tradeName}
              onChange={(e) => {
                setTradeName(e.target.value);
                if (!legalName || legalName === tradeName) setLegalName(e.target.value);
              }}
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:ring-2 focus:ring-sky-500/50"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
              Razón Social Legal (Opcional)
            </label>
            <input
              type="text"
              placeholder="Ej: Distribuidora Norte S.A."
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:ring-2 focus:ring-sky-500/50"
            />
          </div>

          <div className="flex items-center justify-end space-x-2.5 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-xl font-bold text-white bg-sky-600 hover:bg-sky-500 shadow-md shadow-sky-900/30 disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{loading ? 'Creando...' : 'Crear y Seleccionar'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
