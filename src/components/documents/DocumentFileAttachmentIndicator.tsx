import React from 'react';
import { FileText, Paperclip } from 'lucide-react';

interface DocumentFileAttachmentIndicatorProps {
  filesCount?: number | null;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
  showText?: boolean;
}

export const DocumentFileAttachmentIndicator: React.FC<DocumentFileAttachmentIndicatorProps> = ({
  filesCount,
  onClick,
  className = '',
  showText = false
}) => {
  const count = filesCount ?? 0;

  if (count <= 0) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={`Ver comprobante original (${count} ${count === 1 ? 'archivo adjunto' : 'archivos adjuntos'})`}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800 dark:hover:bg-blue-900/60 transition-colors cursor-pointer ${className}`}
      aria-label={`Ver comprobante original, ${count} archivos`}
    >
      {count === 1 ? (
        <FileText size={12} className="shrink-0 text-blue-600 dark:text-blue-400" />
      ) : (
        <Paperclip size={12} className="shrink-0 text-blue-600 dark:text-blue-400" />
      )}
      {showText && <span>Comprobante</span>}
      <span className="text-[11px] font-semibold">{count}</span>
    </button>
  );
};
