import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PatientDetailOverlay } from '../components/PatientDetailOverlay';
import { useAuth } from '../auth/AuthContext';
import {
  createPatient,
  formatPatientName,
  patientCardsSubscriptionForRole,
  type Patient,
} from '../api/patients';
import { useGraphqlSubscription } from '../hooks/useGraphqlSubscription';
import { matchesSearch } from '../utils/searchText';
import { formatVisitSummaryPlain } from '../utils/parseVisitSummary';

const emptyForm = {
  last_name: '',
  first_name: '',
  middle_name: '',
  birth_date: '',
  phone: '',
};

function truncate(text: string | null, max = 60): string {
  if (!text) {
    return '—';
  }
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function formatAttendance(probability: number | null): string {
  if (probability == null) {
    return '—';
  }
  return `${probability}%`;
}

type Props = {
  isActive: boolean;
};

export function PatientsTab({ isActive }: Props) {
  const { misRole, isRegistrar } = useAuth();
  const patientsSubscription = patientCardsSubscriptionForRole(misRole!);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const {
    data,
    error: subscriptionError,
    loading,
  } = useGraphqlSubscription<{ patients: Patient[] }>(patientsSubscription);

  const patients = data?.patients ?? [];
  const loadError = subscriptionError?.message ?? null;

  const filteredPatients = useMemo(() => {
    return patients.filter((p) =>
      matchesSearch(
        [
          p.last_name,
          p.first_name,
          p.middle_name,
          p.phone,
          p.birth_date,
          p.visit_summary,
          p.attendance_probability != null ? String(p.attendance_probability) : null,
        ],
        search,
      ),
    );
  }, [patients, search]);

  const selectedPatient = useMemo(
    () => patients.find((p) => p.id === selectedPatientId) ?? null,
    [patients, selectedPatientId],
  );

  useEffect(() => {
    if (!isActive) {
      setSelectedPatientId(null);
    }
  }, [isActive]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.last_name.trim() || !form.first_name.trim()) {
      setError('Укажите фамилию и имя');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await createPatient({
        last_name: form.last_name,
        first_name: form.first_name,
        middle_name: form.middle_name || null,
        birth_date: form.birth_date || null,
        phone: form.phone || null,
      });
      setForm(emptyForm);
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить пациента');
    } finally {
      setSaving(false);
    }
  }

  const closePatientCard = useCallback(() => {
    setSelectedPatientId(null);
    requestAnimationFrame(() => {
      returnFocusRef.current?.focus();
    });
  }, []);

  function openPatientCard(patientId: number, row: HTMLElement) {
    returnFocusRef.current = row;
    setSelectedPatientId(patientId);
  }

  return (
    <div className="registry-page">
      <div className="registry-page__header">
        <h1 className="registry-page__title">Пациенты</h1>
        <button
          type="button"
          className="btn-primary"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? 'Скрыть форму' : 'Добавить пациента'}
        </button>
      </div>

      <div className="registry-page__toolbar">
        <div className="registry-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="11" cy="11" r="7" stroke="#999" strokeWidth="2" />
            <path d="M20 20l-3-3" stroke="#999" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            placeholder="Поиск…"
            aria-label="Поиск пациентов"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="registry-page__hint">
          Двойной клик или Enter — открыть карточку
        </span>
      </div>

      {showForm && (
        <form className="form-grid registry-form" onSubmit={handleSubmit}>
          <label>
            Фамилия *
            <input
              value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              required
            />
          </label>
          <label>
            Имя *
            <input
              value={form.first_name}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              required
            />
          </label>
          <label>
            Отчество
            <input
              value={form.middle_name}
              onChange={(e) => setForm({ ...form, middle_name: e.target.value })}
            />
          </label>
          <label>
            Дата рождения
            <input
              type="date"
              value={form.birth_date}
              onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
            />
          </label>
          <label className="form-span-2">
            Телефон
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </label>
          <div className="form-actions form-span-2">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        </form>
      )}

      {error && <p className="message message--error">{error}</p>}
      {loadError && <p className="message message--error">{loadError}</p>}

      <div className="registry-page__body">
        {loading ? (
          <p className="panel-hint">Загрузка…</p>
        ) : filteredPatients.length === 0 ? (
          <p className="panel-hint">
            {patients.length === 0
              ? 'Пациентов пока нет. Добавьте первого.'
              : 'По запросу ничего не найдено.'}
          </p>
        ) : (
          <div className="registry-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Фамилия</th>
                  <th>Имя</th>
                  <th>Отчество</th>
                  <th>Дата рождения</th>
                  <th>Телефон</th>
                  {!isRegistrar && <th>Вероятность явки</th>}
                  {!isRegistrar && <th>Суммаризация</th>}
                </tr>
              </thead>
              <tbody>
                {filteredPatients.map((patient) => (
                  <tr
                    key={patient.id}
                    className={
                      selectedPatientId === patient.id
                        ? 'data-table__row data-table__row--selected'
                        : 'data-table__row'
                    }
                    tabIndex={0}
                    role="button"
                    aria-label={`Открыть карточку: ${formatPatientName(patient)}`}
                    onDoubleClick={(e) => openPatientCard(patient.id, e.currentTarget)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openPatientCard(patient.id, e.currentTarget);
                      }
                    }}
                  >
                    <td>{patient.last_name}</td>
                    <td>{patient.first_name}</td>
                    <td>{patient.middle_name ?? '—'}</td>
                    <td>{patient.birth_date ?? '—'}</td>
                    <td>{patient.phone ?? '—'}</td>
                    {!isRegistrar && (
                      <td>{formatAttendance(patient.attendance_probability)}</td>
                    )}
                    {!isRegistrar && (
                      <td
                        className="data-table__truncate"
                        title={
                          patient.visit_summary
                            ? formatVisitSummaryPlain(patient.visit_summary)
                            : undefined
                        }
                      >
                        {truncate(
                          patient.visit_summary
                            ? formatVisitSummaryPlain(patient.visit_summary)
                            : null,
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isActive && selectedPatient && (
        <PatientDetailOverlay
          patient={selectedPatient}
          onClose={closePatientCard}
        />
      )}
    </div>
  );
}
