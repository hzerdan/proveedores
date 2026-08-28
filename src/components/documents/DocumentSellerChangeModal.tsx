import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { EligibleSellerForDocument } from '../../types/database';
import { formatDate } from '../../lib/formatters';
import {
  X,
  UserCheck,
  Building2,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  History,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';

interface DocumentSellerChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: number;
  supplierId: number;
  supplierName: string;
  humanReference: string;
  issueDate: string;
  currentSellerId?: number | null;
  currentSellerName?: string | null;
  onSaved: () => void;
}

export const DocumentSellerChangeModal: React.FC<DocumentSellerChangeModalProps> = ({
  isOpen,
  onClose,
  documentId,
  supplierName,
  humanReference,
  issueDate,
  currentSellerId = null,
  currentSellerName = null,
  onSaved,
}) => {
  const [eligibleSellers, setEligibleSellers] = useState<EligibleSellerForDocument[]>([]);
  const [selectedSellerId, setSelectedSellerId] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isHistoricalAssignment = currentSellerId === null || currentSellerId === undefined;

  useEffect(() => {
    if (!isOpen || !documentId) return;

    const fetchEligibleSellers = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const { data, error } = await supabase.rpc('fn_get_eligible_sellers_for_document', {
          p_document_id: documentId,
        });

        if (error) throw error;
        setEligibleSellers(data || []);
      } catch (err: any) {
        console.error('Error fetching eligible sellers:', err);
        setErrorMessage(err.message || 'Error al cargar los vendedores elegibles.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchEligibleSellers();
  }, [isOpen, documentId]);

  if (!isOpen) return null;

  const selectedSeller = eligibleSellers.find((s) => s.seller_id === selectedSellerId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSellerId) {
      setErrorMessage('Debe seleccionar un nuevo vendedor.');
      return;
    }

    if (selectedSellerId === currentSellerId) {
      setErrorMessage('El vendedor seleccionado es idéntico al vendedor actual.');
      return;
    }

    const trimmedReason = reason.trim();
    if (!trimmedReason || trimmedReason.length < 5) {
      setErrorMessage('El motivo del cambio es obligatorio y debe tener al menos 5 caracteres.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const { data, error } = await supabase.rpc('rpc_change_document_seller', {
        p_document_id: documentId,
        p_new_seller_id: selectedSellerId,
        p_reason: trimmedReason,
        p_expected_current_seller_id: currentSellerId || null,
      });

      if (error) throw error;

      if (data && data.success) {
        onSaved();
        onClose();
      } else {
        throw new Error(data?.message || 'Error al actualizar el vendedor del comprobante.');
      }
    } catch (err: any) {
      console.error('Error in rpc_change_document_seller:', err);
      setErrorMessage(err.message || 'Error al procesar el cambio de vendedor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/40">
          <div className="flex items-center space-x-3">
            <div className="p-3 rounded-2xl bg-gradient-to-tr from-sky-600 to-indigo-600 text-white shadow-lg shadow-sky-500/20">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>{isHistoricalAssignment ? 'Asignar Vendedor a Comprobante' : 'Corregir Vendedor Asignado'}</span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  {isHistoricalAssignment ? 'Regularización' : 'Corrección Auditada'}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Operación de clasificación analítica • No modifica saldos económicos del proveedor
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
          {/* Document Context Card */}
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-4 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Proveedor</span>
                <span className="text-xs font-bold text-white flex items-center gap-1.5 mt-0.5 truncate">
                  <Building2 className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                  <span className="truncate">{supplierName}</span>
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Comprobante</span>
                <span className="text-xs font-bold text-white font-mono flex items-center gap-1.5 mt-0.5">
                  <FileText className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  <span>{humanReference}</span>
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Fecha Emisión</span>
                <span className="text-xs font-bold text-slate-200 font-mono flex items-center gap-1.5 mt-0.5">
                  <Clock className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                  <span>{formatDate(issueDate)}</span>
                </span>
              </div>
            </div>

            {/* Current Seller Info */}
            <div className="pt-2 border-t border-slate-700/40 flex items-center justify-between text-xs">
              <span className="text-slate-400">Vendedor actualmente asignado:</span>
              {currentSellerName ? (
                <span className="font-semibold text-sky-300 bg-sky-500/10 px-2.5 py-0.5 rounded-lg border border-sky-500/20">
                  {currentSellerName}
                </span>
              ) : (
                <span className="font-semibold text-amber-300 bg-amber-500/10 px-2.5 py-0.5 rounded-lg border border-amber-500/20">
                  Sin asignar (seller_id = NULL)
                </span>
              )}
            </div>
          </div>

          {/* Seller Selection Section */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
              <span>Seleccionar Nuevo Vendedor *</span>
              <span className="text-[10px] text-slate-400 font-normal">
                {eligibleSellers.length} vendedor(es) vinculados al proveedor
              </span>
            </label>

            {isLoading ? (
              <div className="py-8 text-center text-slate-400">Cargando vendedores vinculados...</div>
            ) : eligibleSellers.length === 0 ? (
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">No existen vendedores vinculados a este proveedor.</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Para asignar un vendedor, primero debe crear la relación en el maestro de <strong>Vendedores</strong>.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {eligibleSellers.map((seller) => {
                  const isCurrent = seller.seller_id === currentSellerId;
                  const isSelected = seller.seller_id === selectedSellerId;

                  let badgeColor: string;
                  let icon: React.ReactNode;

                  if (seller.relation_validity_status === 'VALID_FOR_DOCUMENT_DATE') {
                    badgeColor = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
                    icon = <CheckCircle2 className="w-3 h-3 text-emerald-400" />;
                  } else if (seller.relation_validity_status === 'CURRENT_RELATION_OUTSIDE_DOCUMENT_DATE') {
                    badgeColor = 'bg-amber-500/15 text-amber-300 border-amber-500/30';
                    icon = <AlertTriangle className="w-3 h-3 text-amber-400" />;
                  } else {
                    badgeColor = 'bg-violet-500/15 text-violet-300 border-violet-500/30';
                    icon = <History className="w-3 h-3 text-violet-400" />;
                  }

                  return (
                    <div
                      key={seller.relationship_id}
                      onClick={() => {
                        if (!isCurrent) setSelectedSellerId(seller.seller_id);
                      }}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                        isCurrent
                          ? 'opacity-40 cursor-not-allowed bg-slate-800/30 border-slate-800'
                          : isSelected
                          ? 'bg-sky-500/15 border-sky-500 text-white shadow-md shadow-sky-500/10'
                          : 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800/80 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <input
                          type="radio"
                          name="seller_choice"
                          checked={isSelected}
                          disabled={isCurrent}
                          onChange={() => setSelectedSellerId(seller.seller_id)}
                          className="text-sky-500 focus:ring-sky-500 bg-slate-900 border-slate-700"
                        />
                        <div className="truncate">
                          <div className="font-bold text-xs flex items-center gap-2 truncate">
                            <span>{seller.display_name}</span>
                            {seller.seller_code && (
                              <span className="text-[10px] font-mono text-slate-400">
                                ({seller.seller_code})
                              </span>
                            )}
                            {isCurrent && (
                              <span className="text-[9px] px-1.5 py-0.2 bg-slate-700 text-slate-300 rounded font-normal">
                                Actual
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Vigencia relación: {formatDate(seller.valid_from)} al{' '}
                            {seller.valid_to ? formatDate(seller.valid_to) : 'actualidad'}
                          </div>
                        </div>
                      </div>

                      <div className={`px-2 py-1 rounded text-[10px] border flex items-center gap-1.5 flex-shrink-0 ml-2 ${badgeColor}`}>
                        {icon}
                        <span className="hidden sm:inline font-medium">{seller.relation_validity_label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Warning if selected seller was not valid for document date */}
          {selectedSeller && selectedSeller.relation_validity_status !== 'VALID_FOR_DOCUMENT_DATE' && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs flex items-start gap-2.5 animate-in fade-in">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">Advertencia de Vigencia Histórica:</span>
                <span className="text-[11px] text-slate-300 block mt-0.5">
                  El vendedor seleccionado no estaba registrado como vigente en la fecha de emisión del comprobante ({formatDate(issueDate)}).
                  La operación se registrará como excepción auditada con motivo obligatorio.
                </span>
              </div>
            </div>
          )}

          {/* Mandatory Reason Input */}
          <div className="space-y-1.5">
            <label htmlFor="change_reason" className="text-xs font-bold text-slate-200 flex items-center justify-between">
              <span>Motivo del Cambio / Regularización *</span>
              <span className={`text-[10px] ${reason.trim().length < 5 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {reason.trim().length} caracteres (mín. 5)
              </span>
            </label>
            <textarea
              id="change_reason"
              rows={3}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: Regularización de factura histórica anterior al módulo de vendedores / Corrección por error de carga original..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          {/* Explicit Confirmation Preview Box */}
          {selectedSeller && (
            <div className="p-3.5 bg-sky-500/10 border border-sky-500/30 rounded-2xl space-y-1.5 animate-in fade-in">
              <div className="flex items-center gap-2 text-xs font-bold text-sky-300">
                <ShieldCheck className="w-4 h-4 text-sky-400" />
                <span>Confirmación de Transición:</span>
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <span className="text-slate-400 font-mono">
                  {currentSellerName || 'Sin vendedor'}
                </span>
                <span className="text-sky-400 font-bold">➔</span>
                <span className="text-emerald-400 font-mono">
                  {selectedSeller.display_name}
                </span>
                <span className="text-[10px] text-slate-400 font-normal">
                  ({isHistoricalAssignment ? 'HISTORICAL_ASSIGNMENT' : 'CORRECTION'})
                </span>
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 bg-rose-500/15 border border-rose-500/40 rounded-xl text-rose-300 text-xs flex items-center gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !selectedSellerId || reason.trim().length < 5}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 transition-all shadow-lg shadow-sky-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Procesando...</span>
                </>
              ) : (
                <span>Confirmar Cambio Auditado</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
