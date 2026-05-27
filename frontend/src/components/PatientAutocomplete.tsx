import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { formatPatientName, type Patient } from '../api/patients';
type PatientAutocompleteProps = {
  patients: Patient[];
  value: string;
  onChange: (patientId: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
};

function filterPatients(patients: Patient[], query: string): Patient[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return patients;
  }
  return patients.filter((patient) =>
    formatPatientName(patient).toLowerCase().includes(normalized),
  );
}

export function PatientAutocomplete({
  patients,
  value,
  onChange,
  placeholder = 'Начните вводить ФИО',
  disabled = false,
  required = false,
  id,
}: PatientAutocompleteProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({});
  const selectedPatient = useMemo(
    () => patients.find((patient) => String(patient.id) === value) ?? null,
    [patients, value],
  );

  const suggestions = useMemo(() => filterPatients(patients, query), [patients, query]);

  useEffect(() => {
    if (selectedPatient) {
      setQuery(formatPatientName(selectedPatient));
      return;
    }
    if (!value) {
      setQuery('');
    }
  }, [selectedPatient, value]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        const target = event.target as HTMLElement;
        if (target.closest('.patient-autocomplete__list--portal')) {
          return;
        }
        setOpen(false);
        setHighlightIndex(-1);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    function updateDropdownPosition() {
      const input = inputRef.current;
      if (!input) {
        return;
      }
      const rect = input.getBoundingClientRect();
      setDropdownStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        zIndex: 1000,
      });
    }

    updateDropdownPosition();
    window.addEventListener('scroll', updateDropdownPosition, true);
    window.addEventListener('resize', updateDropdownPosition);
    return () => {
      window.removeEventListener('scroll', updateDropdownPosition, true);
      window.removeEventListener('resize', updateDropdownPosition);
    };
  }, [open, query, suggestions.length]);
  function selectPatient(patient: Patient) {
    onChange(String(patient.id));
    setQuery(formatPatientName(patient));
    setOpen(false);
    setHighlightIndex(-1);
  }

  function handleInputChange(nextQuery: string) {
    setQuery(nextQuery);
    setOpen(true);
    setHighlightIndex(-1);

    if (!nextQuery.trim()) {
      onChange('');
      return;
    }

    const exactMatch = patients.find(
      (patient) => formatPatientName(patient).toLowerCase() === nextQuery.trim().toLowerCase(),
    );
    if (exactMatch) {
      onChange(String(exactMatch.id));
      return;
    }

    if (selectedPatient && formatPatientName(selectedPatient) !== nextQuery) {
      onChange('');
    }
  }

  function handleBlur() {
    window.setTimeout(() => {
      if (!open) {
        if (selectedPatient) {
          setQuery(formatPatientName(selectedPatient));
        } else {
          setQuery('');
          onChange('');
        }
      }
    }, 120);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      setOpen(true);
      return;
    }

    if (event.key === 'Escape') {
      setOpen(false);
      setHighlightIndex(-1);
      if (selectedPatient) {
        setQuery(formatPatientName(selectedPatient));
      }
      return;
    }

    if (!open || suggestions.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightIndex((prev) => (prev + 1) % suggestions.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (highlightIndex >= 0) {
        selectPatient(suggestions[highlightIndex]);
      } else if (suggestions.length === 1) {
        selectPatient(suggestions[0]);
      }
      return;
    }
  }

  const showSuggestions = open && !disabled && suggestions.length > 0;

  return (
    <div className="patient-autocomplete" ref={rootRef}>
      <input
        type="hidden"
        value={value}
        required={required}
        tabIndex={-1}
        aria-hidden="true"
        onChange={() => {}}
      />
      <input
        ref={inputRef}
        id={id}
        type="text"        role="combobox"
        aria-expanded={showSuggestions}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        value={query}
        disabled={disabled}
        onChange={(event) => handleInputChange(event.target.value)}
        onFocus={() => {
          setOpen(true);
          setHighlightIndex(-1);
        }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
      {showSuggestions &&
        createPortal(
          <ul
            id={listId}
            className="patient-autocomplete__list patient-autocomplete__list--portal"
            style={dropdownStyle}
            role="listbox"
          >
            {suggestions.map((patient, index) => (
              <li key={patient.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={String(patient.id) === value}
                  className={
                    index === highlightIndex
                      ? 'patient-autocomplete__option patient-autocomplete__option--active'
                      : 'patient-autocomplete__option'
                  }
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectPatient(patient)}
                >
                  {formatPatientName(patient)}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}
      {open &&
        !disabled &&
        query.trim() &&
        suggestions.length === 0 &&
        createPortal(
          <div
            className="patient-autocomplete__empty patient-autocomplete__list--portal"
            style={dropdownStyle}
          >
            Пациенты не найдены
          </div>,
          document.body,
        )}    </div>
  );
}
