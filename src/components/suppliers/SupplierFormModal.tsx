import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Supplier, SupplierContact } from '../../types/database';
import { useAuth } from '../../context/AuthContext';
import { SellerSuppliersManager } from '../sellers/SellerSuppliersManager';
import { X, Building2, Plus, Trash2, Check, AlertCircle } from 'lucide-react';

interface SupplierFormModalProps {
  supplier?: Supplier | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const SupplierFormModal: React.FC<SupplierFormModalProps> = ({
  supplier,
  isOpen,
  onClose,
  onSaved,
}) => {
  const { profile } = useAuth();
  const [code, setCode] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Contacts
  const [contacts, setContacts] = useState<Partial<SupplierContact>[]>([]);
  const [activeTab, setActiveTab] = useState<'DATA' | 'SELLERS'>('DATA');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (supplier) {
      setCode(supplier.code);
      setTradeName(supplier.trade_name);
      setLegalName(supplier.legal_name);
      setTaxId(supplier.tax_id);
      setEmail(supplier.email || '');
      setPhone(supplier.phone || '');
      setNotes(supplier.notes || '');
      setIsActive(supplier.is_active);
      fetchContacts(supplier.id);
    } else {
      // Reset form
      setCode('');
      setTradeName('');
      setLegalName('');
      setTaxId('');
      setEmail('');
      setPhone('');
      setNotes('');
      setIsActive(true);
      setContacts([]);
    }
    setActiveTab('DATA');
    setError(null);
  }, [supplier, isOpen]);

  const fetchContacts = async (supId: number) => {
    const { data } = await supabase
      .from('supplier_contacts')
      .select('*')
      .eq('supplier_id', supId);
    if (data) setContacts(data);
  };

  const handleAddContact = () => {
    setContacts([
      ...contacts,
      { first_name: '', last_name: '', role_title: 'Cobranzas', email: '', phone: '', is_active: true },
    ]);
  };

  const handleRemoveContact = (index: number) => {
    setContacts(contacts.filter((_, i) => i !== index));
  };

  const handleContactChange = (index: number, field: keyof SupplierContact, value: any) => {
    const updated = [...contacts];
    updated[index] = { ...updated[index], [field]: value };
    setContacts(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setLoading(true);
    setError(null);

    try {
      let savedSupplierId = supplier?.id;

      if (supplier) {
        // Update
        const { error: updErr } = await supabase
          .from('suppliers')
          .update({
            code: code.trim(),
            trade_name: tradeName.trim(),
            legal_name: legalName.trim(),
            tax_id: taxId.trim(),
            email: email.trim() || null,
            phone: phone.trim() || null,
            notes: notes.trim() || null,
            is_active: isActive,
            updated_at: new Date().toISOString(),
          })
          .eq('id', supplier.id);

        if (updErr) throw updErr;
      } else {
        // Insert
        const { data: newSup, error: insErr } = await supabase
          .from('suppliers')
          .insert({
            code: code.trim(),
            trade_name: tradeName.trim(),
            legal_name: legalName.trim(),
            tax_id: taxId.trim(),
            email: email.trim() || null,
            phone: phone.trim() || null,
            notes: notes.trim() || null,
            is_active: isActive,
            created_by: profile.id,
          })
          .select()
          .single();

        if (insErr) throw insErr;
        savedSupplierId = newSup.id;
      }

      // Save contacts
      if (savedSupplierId) {
        for (const c of contacts) {
          if (c.first_name && c.last_name) {
            if (c.id) {
              await supabase
                .from('supplier_contacts')
                .update({
                  first_name: c.first_name,
                  last_name: c.last_name,
                  role_title: c.role_title || 'General',
                  email: c.email || null,
                  phone: c.phone || null,
                  is_active: c.is_active ?? true,
                })
                .eq('id', c.id);
            } else {
              await supabase.from('supplier_contacts').insert({
                supplier_id: savedSupplierId,
                first_name: c.first_name,
                last_name: c.last_name,
                role_title: c.role_title || 'General',
                email: c.email || null,
                phone: c.phone || null,
                is_active: true,
              });
            }
          }
        }
      }

      onSaved();
      onClose();
    } catch (err: any) {
      console.error('Error saving supplier:', err);
      setError(err.message || 'Error al guardar el proveedor');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/40">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">
                {supplier ? `Proveedor: ${supplier.trade_name}` : 'Nuevo Proveedor'}
              </h2>
              <p className="text-xs text-slate-400">
                Ficha comercial, contactos administrativos y vendedores asignados
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

        {/* Tab switcher if editing */}
        {supplier && (
          <div className="flex space-x-2 px-6 pt-3 border-b border-slate-800 bg-slate-950/40">
            <button
              type="button"
              onClick={() => setActiveTab('DATA')}
              className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition-all border-b-2 ${
                activeTab === 'DATA'
                  ? 'border-sky-500 text-sky-300 bg-slate-800/60'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Datos Generales & Contactos
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('SELLERS')}
              className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition-all border-b-2 ${
                activeTab === 'SELLERS'
                  ? 'border-sky-500 text-sky-300 bg-slate-800/60'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Vendedores Asignados (M:N)
            </button>
          </div>
        )}

        {/* Content / Form */}
        {activeTab === 'SELLERS' && supplier ? (
          <div className="p-6 overflow-y-auto flex-1">
            <SellerSuppliersManager mode="FOR_SUPPLIER" supplierId={supplier.id} />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1">
            {error && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Código de Proveedor *
              </label>
              <input
                type="text"
                required
                placeholder="ej: PRV-001"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:ring-2 focus:ring-sky-500/50 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                CUIT / Identificación Fiscal *
              </label>
              <input
                type="text"
                required
                placeholder="ej: 30-71234567-9"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:ring-2 focus:ring-sky-500/50 focus:outline-none font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Nombre de Fantasía (Comercial) *
              </label>
              <input
                type="text"
                required
                placeholder="ej: Distribuidora Norte"
                value={tradeName}
                onChange={(e) => setTradeName(e.target.value)}
                className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:ring-2 focus:ring-sky-500/50 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Razón Social *
              </label>
              <input
                type="text"
                required
                placeholder="ej: Distribuidora Norte S.A."
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:ring-2 focus:ring-sky-500/50 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Email Principal
              </label>
              <input
                type="email"
                placeholder="contacto@proveedor.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:ring-2 focus:ring-sky-500/50 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Teléfono Principal
              </label>
              <input
                type="text"
                placeholder="+54 11 4444-5555"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:ring-2 focus:ring-sky-500/50 focus:outline-none"
              />
            </div>
          </div>

          {/* Contacts Section */}
          <div className="pt-4 border-t border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-200">Personas de Contacto</h3>
              <button
                type="button"
                onClick={handleAddContact}
                className="flex items-center space-x-1 text-xs text-sky-400 hover:text-sky-300 font-semibold"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar Contacto</span>
              </button>
            </div>

            {contacts.length === 0 ? (
              <div className="text-xs text-slate-500 italic bg-slate-800/30 p-3 rounded-xl border border-slate-800/60 text-center">
                No hay contactos asociados todavía.
              </div>
            ) : (
              <div className="space-y-3">
                {contacts.map((c, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-1 sm:grid-cols-4 gap-2 bg-slate-800/40 p-3 rounded-xl border border-slate-700/40 items-center text-xs"
                  >
                    <input
                      type="text"
                      placeholder="Nombre"
                      required
                      value={c.first_name || ''}
                      onChange={(e) => handleContactChange(idx, 'first_name', e.target.value)}
                      className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                    />
                    <input
                      type="text"
                      placeholder="Apellido"
                      required
                      value={c.last_name || ''}
                      onChange={(e) => handleContactChange(idx, 'last_name', e.target.value)}
                      className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                    />
                    <input
                      type="text"
                      placeholder="Función (ej: Cobranzas)"
                      value={c.role_title || ''}
                      onChange={(e) => handleContactChange(idx, 'role_title', e.target.value)}
                      className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                    />
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        placeholder="Tel / Email"
                        value={c.phone || c.email || ''}
                        onChange={(e) => handleContactChange(idx, 'phone', e.target.value)}
                        className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveContact(idx)}
                        className="text-slate-400 hover:text-rose-400 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center space-x-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white px-5 py-2 rounded-xl text-sm font-semibold shadow-lg shadow-sky-900/30 transition-all disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{loading ? 'Guardando...' : 'Guardar Proveedor'}</span>
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  );
};
