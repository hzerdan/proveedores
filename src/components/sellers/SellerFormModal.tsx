import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Seller } from '../../types/database';
import { useAuth } from '../../context/AuthContext';
import { X, UserCheck, Check, AlertCircle } from 'lucide-react';

interface SellerFormModalProps {
  seller?: Seller | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const SellerFormModal: React.FC<SellerFormModalProps> = ({
  seller,
  isOpen,
  onClose,
  onSaved,
}) => {
  const { profile } = useAuth();
  const [code, setCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (seller) {
      setCode(seller.code || '');
      setFirstName(seller.first_name || '');
      setLastName(seller.last_name || '');
      setDisplayName(seller.display_name || '');
      setEmail(seller.email || '');
      setPhone(seller.phone || '');
      setNotes(seller.notes || '');
      setIsActive(seller.is_active);
    } else {
      setCode('');
      setFirstName('');
      setLastName('');
      setDisplayName('');
      setEmail('');
      setPhone('');
      setNotes('');
      setIsActive(true);
    }
    setError(null);
  }, [seller, isOpen]);

  // Auto-generate display name if user enters first/last name
  const handleNameChange = (first: string, last: string) => {
    setFirstName(first);
    setLastName(last);
    if (!seller || !seller.display_name) {
      setDisplayName(`${first} ${last}`.trim());
    }
  };

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
      const finalDisplayName = displayName.trim() || `${firstName.trim()} ${lastName.trim()}`;

      if (seller) {
        // Update existing seller
        const { error: updErr } = await supabase
          .from('sellers')
          .update({
            code: code.trim() || null,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            display_name: finalDisplayName,
            email: email.trim() || null,
            phone: phone.trim() || null,
            notes: notes.trim() || null,
            is_active: isActive,
            updated_at: new Date().toISOString(),
          })
          .eq('id', seller.id);

        if (updErr) throw updErr;
      } else {
        // Create new seller
        const { error: insErr } = await supabase
          .from('sellers')
          .insert({
            code: code.trim() || null,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            display_name: finalDisplayName,
            email: email.trim() || null,
            phone: phone.trim() || null,
            notes: notes.trim() || null,
            is_active: isActive,
            created_by: profile?.id,
          });

        if (insErr) throw insErr;
      }

      onSaved();
      onClose();
    } catch (err: any) {
      console.error('Error saving seller:', err);
      setError(err.message || 'Error al guardar el vendedor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/40">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {seller ? 'Editar Vendedor' : 'Nuevo Vendedor'}
              </h2>
              <p className="text-xs text-slate-400">
                Entidad comercial independiente para atribución de comprobantes y saldos
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                Nombre *
              </label>
              <input
                type="text"
                required
                placeholder="Ej: Juan"
                value={firstName}
                onChange={(e) => handleNameChange(e.target.value, lastName)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:ring-2 focus:ring-sky-500/50"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                Apellido *
              </label>
              <input
                type="text"
                required
                placeholder="Ej: Pérez"
                value={lastName}
                onChange={(e) => handleNameChange(firstName, e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:ring-2 focus:ring-sky-500/50"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                Nombre a Mostrar / Comercial
              </label>
              <input
                type="text"
                placeholder="Ej: Juan Pérez"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:ring-2 focus:ring-sky-500/50 font-medium"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                Código Interno (Opcional)
              </label>
              <input
                type="text"
                placeholder="Ej: VEND-001"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                Email
              </label>
              <input
                type="email"
                placeholder="juan@ventas.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                Teléfono / WhatsApp
              </label>
              <input
                type="text"
                placeholder="+54 9 11 ..."
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
              Notas / Observaciones
            </label>
            <textarea
              rows={2}
              placeholder="Zonas cubiertas, líneas de productos, acuerdos especiales..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white"
            />
          </div>

          {/* Active switch */}
          <div className="flex items-center space-x-3 pt-2">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
            <div>
              <span className="text-xs font-semibold text-white block">
                {isActive ? 'Vendedor Activo Globalmente' : 'Vendedor Inactivo Globalmente'}
              </span>
              <span className="text-[11px] text-slate-400">
                Si se desactiva, no estará disponible para nuevos comprobantes en ningún proveedor.
              </span>
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-300 hover:bg-slate-800 transition-colors font-semibold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-bold shadow-lg shadow-sky-900/30 flex items-center space-x-2 transition-all disabled:opacity-50"
            >
              {loading ? (
                <span>Guardando...</span>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>{seller ? 'Guardar Cambios' : 'Crear Vendedor'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
