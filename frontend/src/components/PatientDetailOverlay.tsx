import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';import { formatPatientName, type Patient } from '../api/patients';
import { useAuth } from '../auth/AuthContext';
import { PatientCard } from './PatientCard';

type Props = {
  patient: Patient;
  onClose: () => void;
};

export function PatientDetailOverlay({ patient, onClose }: Props) {
  const { isDoctor } = useAuth();
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) {
        return;
      }

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return createPortal(
    <div className="patient-detail-overlay" role="presentation" onClick={onClose}>
      <div
        ref={panelRef}
        className="patient-detail-overlay__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="patient-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="patient-detail-overlay__header">
          <h2 id="patient-detail-title">{formatPatientName(patient)}</h2>
          <button
            ref={closeRef}
            type="button"
            className="patient-detail-overlay__close"
            onClick={onClose}
            aria-label="Закрыть карточку"
          >
            ×
          </button>
        </header>
        <div className="patient-detail-overlay__body">
          <PatientCard
            patient={patient}
            showHeader={false}
            showClinicalDetails={isDoctor}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
