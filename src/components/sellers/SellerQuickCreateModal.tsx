import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Seller } from '../../types/database';
import { useAuth } from '../../context/AuthContext';
import { X, UserCheck, Check, AlertCircle } from 'lucide-react';

interface SellerQuickCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSellerCreated: (seller: Seller) => void;
  initialName?: string;
}

export const SellerQuickCreateModal: React.FC<SellerQuickCreateModalProps> = ({
  isOpen,
  onClose,
  onSellerCreated,
  initialName = '',
}) => {
  const { profile } = useAuth();
  const [firstName, setFirstName] = useState(initialName);
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      setError('El nombre y apellido son obligatorios.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const displayName = `${firstName.trim()} ${lastName.trim()}`;

      const { data, error: insErr } = await supabase
        .from('sellers')
        .insert({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          display_name: displayName,
          phone: phone.trim() || null,
          email: email.trim() || null,
          is_active: true,
          created_by: profile?.id,
        })
        .select()
        .single();

      if (insErr) throw insErr;
      if (data) {
        onSellerCreated(data as Seller);
        onClose();
      }
    } catch (err: any) {
      console.error('Error al crear viajante:', err);
      setError(err.message || 'Error al dar de alta el viajante');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-800/60">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <UserCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Nuevo Viajante / Vendedor</h3>
              <p className="text-[11px] text-slate-400">Alta rápida en el sistema</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Nombre *
              </label>
              <input
                type="text"
                required
                autoFocus
                placeholder="ej: Carlos"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:ring-2 focus:ring-emerald-500/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Apellido *
              </label>
              <input
                type="text"
                required
                placeholder="ej: Gómez"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:ring-2 focus:ring-emerald-500/50 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Teléfono / WhatsApp
            </label>
            <input
              type="text"
              placeholder="+54 9 381 444-5555"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:ring-2 focus:ring-emerald-500/50 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Email
            </label>
            <input
              type="email"
              placeholder="viajante@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:ring-2 focus:ring-emerald-500/50 focus:outline-none"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:scale-95 rounded-xl shadow-lg shadow-emerald-900/30 flex items-center space-x-1.5 transition-all disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{loading ? 'Guardando...' : 'Guardar Viajante'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
