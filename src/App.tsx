import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppLayout } from './components/layout/AppLayout';
import { NavigationTab } from './config/navigation';
import { LoginForm } from './components/auth/LoginForm';
import { SupplierList } from './components/suppliers/SupplierList';
import { SupplierFormModal } from './components/suppliers/SupplierFormModal';
import { SellerList } from './components/sellers/SellerList';
import { AccountStatement } from './components/accounts/AccountStatement';
import { SupplierAgingView } from './components/aging/SupplierAgingView';
import { PaymentProjectionView } from './components/projection/PaymentProjectionView';
import { DocumentDetailModal } from './components/accounts/DocumentDetailModal';
import { ReferenceMovementsModal } from './components/accounts/ReferenceMovementsModal';
import { DocumentIntakeModal } from './components/documents/DocumentIntakeModal';
import { MobileCaptureQRModal } from './components/documents/MobileCaptureQRModal';
import { MobileCapturePage } from './components/documents/MobileCapturePage';
import { DocumentFormModal } from './components/documents/DocumentFormModal';
import { PaymentOrderModal } from './components/documents/PaymentOrderModal';
import { ApplyBalanceModal } from './components/applications/ApplyBalanceModal';
import { DesimputeModal } from './components/applications/DesimputeModal';
import { DocumentReversalModal } from './components/reversals/DocumentReversalModal';
import { DocumentTypesMaster } from './components/masters/DocumentTypesMaster';
import { UsersSecurityMaster } from './components/masters/UsersSecurityMaster';
import { AuditLogsMaster } from './components/masters/AuditLogsMaster';
import { Supplier, DocumentSummaryView, IntakeSource } from './types/database';
import { ExtractedInvoicePayload } from './lib/aiExtractor';

function MainContent() {
  const { profile, isLoading } = useAuth();
  const [currentTab, setCurrentTab] = useState<NavigationTab>('suppliers');
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);

  // Modals state
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  // Document Intake & Creation modals
  const [intakeModalOpen, setIntakeModalOpen] = useState(false);
  const [mobileQRModalOpen, setMobileQRModalOpen] = useState(false);
  const [docFormModalOpen, setDocFormModalOpen] = useState(false);
  const [docFormSupplierId, setDocFormSupplierId] = useState<number | null>(null);
  const [docFormExtractedData, setDocFormExtractedData] = useState<ExtractedInvoicePayload | null>(null);
  const [docFormFileId, setDocFormFileId] = useState<number | null>(null);
  const [docFormExtractionId, setDocFormExtractionId] = useState<number | null>(null);
  const [docFormIntakeSource, setDocFormIntakeSource] = useState<IntakeSource>('MANUAL');

  const [opModalOpen, setOpModalOpen] = useState(false);
  const [opSupplierId, setOpSupplierId] = useState<number | null>(null);

  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [applySourceDoc, setApplySourceDoc] = useState<DocumentSummaryView | null>(null);

  const [reversalModalOpen, setReversalModalOpen] = useState(false);
  const [reversalDoc, setReversalDoc] = useState<DocumentSummaryView | null>(null);

  const [desimputeModalOpen, setDesimputeModalOpen] = useState(false);
  const [desimputeSupplierId, setDesimputeSupplierId] = useState<number | null>(null);

  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailDocId, setDetailDocId] = useState<number | null>(null);

  const [refMovementsModalOpen, setRefMovementsModalOpen] = useState(false);
  const [refMovementsRefId, setRefMovementsRefId] = useState<number | null>(null);

  // Refresh trigger key
  const [refreshKey, setRefreshKey] = useState(0);
  const triggerRefresh = () => setRefreshKey((prev) => prev + 1);

  const handleSelectSupplierFromList = (supId: number) => {
    setSelectedSupplierId(supId);
    setCurrentTab('accounts');
  };

  // Open the 4-choice Intake Modal
  const handleNewDocument = (supId?: number) => {
    setDocFormSupplierId(supId || selectedSupplierId || null);
    setIntakeModalOpen(true);
  };

  const handleStartManualForm = () => {
    setDocFormExtractedData(null);
    setDocFormFileId(null);
    setDocFormExtractionId(null);
    setDocFormIntakeSource('MANUAL');
    setDocFormModalOpen(true);
  };

  const handleExtractionReady = (
    data: ExtractedInvoicePayload,
    fileId?: number,
    source: string = 'IMAGE',
    extractionId?: number
  ) => {
    setDocFormExtractedData(data);
    setDocFormFileId(fileId || null);
    setDocFormExtractionId(extractionId || null);
    setDocFormIntakeSource((source as IntakeSource) || 'IMAGE');
    setDocFormModalOpen(true);
  };

  const handleNewPaymentOrder = (supId?: number) => {
    setOpSupplierId(supId || selectedSupplierId || null);
    setOpModalOpen(true);
  };

  const handleOpenSupplierModal = (sup?: Supplier) => {
    setEditingSupplier(sup || null);
    setSupplierModalOpen(true);
  };

  const handleApplyBalance = (doc: DocumentSummaryView) => {
    setApplySourceDoc(doc);
    setApplyModalOpen(true);
  };

  const handleReverseDocument = (doc: DocumentSummaryView) => {
    setReversalDoc(doc);
    setReversalModalOpen(true);
  };

  const handleOpenDesimpute = (supId: number) => {
    setDesimputeSupplierId(supId);
    setDesimputeModalOpen(true);
  };

  const handleViewDocumentDetail = (docId: number) => {
    setDetailDocId(docId);
    setDetailModalOpen(true);
  };

  const handleViewReferenceMovements = (refId: number) => {
    setRefMovementsRefId(refId);
    setRefMovementsModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">
        Cargando sesión y permisos...
      </div>
    );
  }

  if (!profile) {
    return <LoginForm />;
  }

  return (
    <AppLayout currentTab={currentTab} onTabChange={setCurrentTab}>
      {currentTab === 'suppliers' && (
        <SupplierList
          key={`sup-${refreshKey}`}
          onSelectSupplier={handleSelectSupplierFromList}
          onNewDocument={handleNewDocument}
          onOpenSupplierModal={handleOpenSupplierModal}
        />
      )}

      {currentTab === 'sellers' && (
        <SellerList
          key={`seller-${refreshKey}`}
          onOpenSupplierAccount={handleSelectSupplierFromList}
          onOpenDocumentDetail={handleViewDocumentDetail}
        />
      )}

      {currentTab === 'accounts' && (
        <AccountStatement
          key={`acc-${refreshKey}-${selectedSupplierId}`}
          selectedSupplierId={selectedSupplierId}
          onSelectSupplier={setSelectedSupplierId}
          onNewDocument={handleNewDocument}
          onNewPaymentOrder={handleNewPaymentOrder}
          onApplyBalance={handleApplyBalance}
          onReverseDocument={handleReverseDocument}
          onDesimpute={handleOpenDesimpute}
          onViewDocumentDetail={handleViewDocumentDetail}
          onViewReferenceMovements={handleViewReferenceMovements}
        />
      )}

      {currentTab === 'aging' && (
        <SupplierAgingView
          key={`aging-${refreshKey}`}
          onSelectSupplierAccount={handleSelectSupplierFromList}
        />
      )}

      {currentTab === 'projection' && (
        <PaymentProjectionView
          key={`proj-${refreshKey}`}
          onSelectSupplierAccount={handleSelectSupplierFromList}
        />
      )}

      {currentTab === 'document_types' && <DocumentTypesMaster />}

      {currentTab === 'users_security' && <UsersSecurityMaster />}

      {currentTab === 'audit_logs' && <AuditLogsMaster />}

      {/* Intake Choice Modal (Manual / PDF / Image / QR) */}
      {intakeModalOpen && (
        <DocumentIntakeModal
          isOpen={intakeModalOpen}
          onClose={() => setIntakeModalOpen(false)}
          onSelectManual={handleStartManualForm}
          onOpenMobileQR={() => setMobileQRModalOpen(true)}
          onExtractionReady={handleExtractionReady}
        />
      )}

      {/* Mobile QR Capture Modal (PC side) */}
      {mobileQRModalOpen && (
        <MobileCaptureQRModal
          isOpen={mobileQRModalOpen}
          onClose={() => setMobileQRModalOpen(false)}
          onExtractionReady={(data, fileId, extId) => handleExtractionReady(data, fileId, 'MOBILE_CAPTURE', extId)}
        />
      )}

      {/* Document Form Review Modal (Canonical Form) */}
      {docFormModalOpen && (
        <DocumentFormModal
          isOpen={docFormModalOpen}
          onClose={() => {
            setDocFormModalOpen(false);
            setDocFormExtractedData(null);
            setDocFormFileId(null);
            setDocFormExtractionId(null);
          }}
          initialSupplierId={docFormSupplierId}
          initialData={docFormExtractedData}
          fileId={docFormFileId}
          extractionId={docFormExtractionId}
          intakeSource={docFormIntakeSource}
          onSaved={() => {
            triggerRefresh();
          }}
        />
      )}

      {/* Supplier Create/Edit Modal */}
      {supplierModalOpen && (
        <SupplierFormModal
          isOpen={supplierModalOpen}
          onClose={() => setSupplierModalOpen(false)}
          supplier={editingSupplier}
          onSaved={() => {
            triggerRefresh();
          }}
        />
      )}

      {/* Payment Order (OP) Modal */}
      {opModalOpen && (
        <PaymentOrderModal
          isOpen={opModalOpen}
          onClose={() => setOpModalOpen(false)}
          initialSupplierId={opSupplierId}
          onSaved={() => {
            triggerRefresh();
          }}
        />
      )}

      {/* Apply Balance (APL) Modal */}
      {applyModalOpen && applySourceDoc && (
        <ApplyBalanceModal
          isOpen={applyModalOpen}
          onClose={() => setApplyModalOpen(false)}
          sourceDoc={applySourceDoc}
          onSaved={() => {
            triggerRefresh();
          }}
        />
      )}

      {/* Desimpute (APL-REV) Modal */}
      {desimputeModalOpen && desimputeSupplierId && (
        <DesimputeModal
          isOpen={desimputeModalOpen}
          onClose={() => setDesimputeModalOpen(false)}
          supplierId={desimputeSupplierId}
          onSaved={() => {
            triggerRefresh();
          }}
        />
      )}

      {/* Document Reversal (REV) Modal */}
      {reversalModalOpen && reversalDoc && (
        <DocumentReversalModal
          isOpen={reversalModalOpen}
          onClose={() => setReversalModalOpen(false)}
          document={reversalDoc}
          onSaved={() => {
            triggerRefresh();
          }}
        />
      )}

      {/* Single Document Detail Modal */}
      {detailModalOpen && detailDocId && (
        <DocumentDetailModal
          isOpen={detailModalOpen}
          onClose={() => setDetailModalOpen(false)}
          documentId={detailDocId}
          onOpenDocumentDetail={(id) => setDetailDocId(id)}
        />
      )}

      {/* Reference Affected Movements Modal */}
      {refMovementsModalOpen && refMovementsRefId && (
        <ReferenceMovementsModal
          isOpen={refMovementsModalOpen}
          onClose={() => setRefMovementsModalOpen(false)}
          referenceId={refMovementsRefId}
        />
      )}
    </AppLayout>
  );
}

function getInitialMobileToken(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const queryToken = params.get('capture_token');
  if (queryToken) return queryToken;

  const path = window.location.pathname;
  if (path.startsWith('/capture/')) {
    const pathToken = path.replace('/capture/', '').trim();
    if (pathToken) return pathToken;
  }
  return null;
}

export function App() {
  // Check synchronously if current URL is for mobile QR capture
  const [mobileToken] = useState<string | null>(getInitialMobileToken);

  if (mobileToken) {
    return <MobileCapturePage captureToken={mobileToken} />;
  }

  return (
    <AuthProvider>
      <MainContent />
    </AuthProvider>
  );
}
export default App;
