import React, { useState, useEffect, useRef } from 'react';
import { formatDate, parseCanonicalDate, toIsoDate } from '../../lib/formatters';
import { Calendar } from 'lucide-react';

interface DateInputProps {
  value: string; // ISO string 'YYYY-MM-DD' o ''
  onChange: (isoDate: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

export const DateInput: React.FC<DateInputProps> = ({
  value,
  onChange,
  className = '',
  placeholder = 'DD/MM/AAAA',
  disabled = false,
}) => {
  const [displayValue, setDisplayValue] = useState(value ? formatDate(value) : '');
  const nativeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDisplayValue(value ? formatDate(value) : '');
  }, [value]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setDisplayValue(raw);

    const trimmed = raw.trim();
    if (trimmed.length === 10) {
      const parsed = parseCanonicalDate(trimmed);
      if (parsed) {
        const iso = toIsoDate(parsed);
        if (iso && iso !== value) {
          onChange(iso);
        }
      }
    } else if (trimmed === '') {
      if (value !== '') {
        onChange('');
      }
    }
  };

  const handleBlur = () => {
    const trimmed = displayValue.trim();
    if (!trimmed) {
      if (value !== '') onChange('');
      return;
    }
    const parsed = parseCanonicalDate(trimmed);
    if (parsed) {
      const iso = toIsoDate(parsed)!;
      onChange(iso);
      setDisplayValue(formatDate(iso));
    } else {
      // Si la fecha ingresada es inválida, restaurar al valor previo válido
      setDisplayValue(value ? formatDate(value) : '');
    }
  };

  const handleOpenPicker = () => {
    if (disabled) return;
    if (nativeInputRef.current) {
      try {
        if ('showPicker' in HTMLInputElement.prototype) {
          nativeInputRef.current.showPicker();
        } else {
          nativeInputRef.current.focus();
        }
      } catch {
        nativeInputRef.current.focus();
      }
    }
  };

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <input
        type="text"
        disabled={disabled}
        placeholder={placeholder}
        value={displayValue}
        onChange={handleTextChange}
        onBlur={handleBlur}
        className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-2.5 pr-8 py-1 text-xs text-white font-mono placeholder-slate-500 focus:ring-1 focus:ring-sky-500 focus:outline-none focus:border-sky-500 disabled:opacity-50"
      />
      <button
        type="button"
        disabled={disabled}
        onClick={handleOpenPicker}
        className="absolute right-2 text-slate-400 hover:text-sky-400 focus:outline-none transition-colors p-0.5"
        title="Abrir calendario"
      >
        <Calendar className="w-3.5 h-3.5" />
      </button>
      {/* Input nativo oculto para disparar el popup de calendario */}
      <input
        ref={nativeInputRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled}
        value={value || ''}
        onChange={(e) => {
          if (e.target.value) {
            onChange(e.target.value);
            setDisplayValue(formatDate(e.target.value));
          }
        }}
        className="sr-only absolute opacity-0 pointer-events-none w-0 h-0"
      />
    </div>
  );
};
