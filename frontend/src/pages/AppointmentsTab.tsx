import { FormEvent, useMemo, useState } from 'react';
import {
  APPOINTMENT_STATUS_LABELS,
  appointmentsSubscriptionForRole,
  cancelAppointment,
  compareAppointmentsByScheduledAt,
  createAppointment,
  fetchAppointments,
  formatScheduledAt,
  isAppointmentToday,
  localDatetimeToIso,
  type Appointment,
} from '../api/appointments';
import { recalculatePatientAttendance } from '../api/patientInsights';
import { formatPatientName, patientsListSubscriptionForRole, type Patient } from '../api/patients';
import { PatientAutocomplete } from '../components/PatientAutocomplete';
import { useAuth } from '../auth/AuthContext';
import { useGraphqlSubscription } from '../hooks/useGraphqlSubscription';
import { matchesSearch } from '../utils/searchText';
import type { VisitNavigationTarget } from '../navigation/visitNavigation';

const emptyForm = {
  patient_id: '',
  scheduled_at: '',
  duration_minutes: '30',
  notes: '',
};

type AppointmentsView = 'all' | 'today';

const VIEW_TABS: { id: AppointmentsView; label: string }[] = [
  { id: 'today', label: 'Сегодня' },
  { id: 'all', label: 'Все' },
];

function isTodayActiveAppointment(appointment: Appointment): boolean {
  return isAppointmentToday(appointment.scheduled_at) && appointment.status === 'scheduled';
}

function AppointmentsTable({
  appointments,
  onCancel,
  onOpenVisit,
  canOpenVisit,
}: {
  appointments: Appointment[];
  onCancel: (id: number) => void;
  onOpenVisit: (appointment: Appointment) => void;
  canOpenVisit: boolean;
}) {
  return (
    <div className="registry-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Пациент</th>
            <th>Дата и время</th>
            <th>Длит.</th>
            <th>Статус</th>
            <th>Примечание</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {appointments.map((a) => {
            const name = a.patient ? formatPatientName(a.patient) : `ID ${a.patient_id}`;
            return (
              <tr
                key={a.id}
                className={canOpenVisit ? 'data-table__row' : undefined}
                tabIndex={canOpenVisit ? 0 : undefined}
                role={canOpenVisit ? 'button' : undefined}
                aria-label={
                  canOpenVisit
                    ? `Открыть приём: ${name}, ${formatScheduledAt(a.scheduled_at)}`
                    : undefined
                }
                onDoubleClick={canOpenVisit ? () => onOpenVisit(a) : undefined}
                onKeyDown={
                  canOpenVisit
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onOpenVisit(a);
                        }
                      }
                    : undefined
                }
              >
                <td>{name}</td>
                <td>{formatScheduledAt(a.scheduled_at)}</td>
                <td>{a.duration_minutes} мин</td>
                <td>
                  <span className={`status-badge status-badge--${a.status}`}>
                    {APPOINTMENT_STATUS_LABELS[a.status]}
                  </span>
                </td>
                <td className="data-table__truncate">{a.notes ?? '—'}</td>
                <td>
                  {a.status === 'scheduled' && (
                    <button
                      type="button"
                      className="btn-link"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCancel(a.id);
                      }}
                    >
                      Отменить
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function AppointmentsTab({
  onOpenVisit,
  canOpenVisit = true,
}: {
  onOpenVisit: (target: VisitNavigationTarget) => void;
  canOpenVisit?: boolean;
}) {
  const { misRole, isDoctor } = useAuth();
  const appointmentsSubscription = appointmentsSubscriptionForRole(misRole!);
  const patientsSubscription = patientsListSubscriptionForRole(misRole!);

  const [view, setView] = useState<AppointmentsView>('today');
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');

  const {
    data: appointmentsData,
    error: appointmentsError,
    loading: appointmentsLoading,
  } = useGraphqlSubscription<{ appointments: Appointment[] }>(appointmentsSubscription);

  const {
    data: patientsData,
    error: patientsError,
    loading: patientsLoading,
  } = useGraphqlSubscription<{ patients: Patient[] }>(patientsSubscription);

  const appointments = appointmentsData?.appointments ?? [];
  const patients = patientsData?.patients ?? [];
  const loading = appointmentsLoading || patientsLoading;
  const loadError = appointmentsError?.message ?? patientsError?.message ?? null;

  const displayedAppointments = useMemo(() => {
    const searched = appointments.filter((a) => {
      const name = a.patient ? formatPatientName(a.patient) : String(a.patient_id);
      return matchesSearch(
        [name, formatScheduledAt(a.scheduled_at), APPOINTMENT_STATUS_LABELS[a.status], a.notes],
        search,
      );
    });

    const filtered =
      view === 'today'
        ? searched.filter((a) => isTodayActiveAppointment(a))
        : searched;

    const sortDirection = view === 'today' ? 'asc' : 'desc';
    return [...filtered].sort((a, b) =>
      compareAppointmentsByScheduledAt(a, b, sortDirection),
    );
  }, [appointments, search, view]);

  const todayCount = useMemo(() => {
    return appointments.filter((a) => isTodayActiveAppointment(a)).length;
  }, [appointments]);

  function handleOpenVisit(appointment: Appointment) {
    onOpenVisit({
      patientId: appointment.patient_id,
      appointmentId: appointment.id,
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.patient_id || !form.scheduled_at) {
      setError('Выберите пациента и дату приёма');
      return;
    }

    setSaving(true);
    setError(null);
    setWarn(null);
    try {
      const patientId = Number(form.patient_id);
      await createAppointment(
        {
          patient_id: patientId,
          scheduled_at: localDatetimeToIso(form.scheduled_at),
          duration_minutes: Number(form.duration_minutes) || 30,
          notes: form.notes || null,
        },
        misRole!,
      );

      if (isDoctor) {
        const freshAppointments = await fetchAppointments(misRole!);
        const patientAppointments = freshAppointments.filter(
          (a) => a.patient_id === patientId,
        );

        const result = await recalculatePatientAttendance(patientId, patientAppointments);
        if (!result.ok) {
          setWarn(`Запись создана, но вероятность явки не обновлена: ${result.error}`);
        }
      }

      setForm(emptyForm);
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось записать на приём');
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel(id: number) {
    if (!window.confirm('Отменить запись на приём?')) {
      return;
    }
    setError(null);
    setWarn(null);
    try {
      const appointment = appointments.find((a) => a.id === id);
      await cancelAppointment(id);

      if (appointment && isDoctor) {
        const freshAppointments = await fetchAppointments(misRole!);
        const patientAppointments = freshAppointments.filter(
          (a) => a.patient_id === appointment.patient_id,
        );
        const result = await recalculatePatientAttendance(
          appointment.patient_id,
          patientAppointments,
        );
        if (!result.ok) {
          setWarn(`Запись отменена, но вероятность явки не обновлена: ${result.error}`);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось отменить приём');
    }
  }

  function emptyMessage(): string {
    if (appointments.length === 0) {
      return 'Записей на приём пока нет.';
    }
    if (search.trim()) {
      return 'По запросу ничего не найдено.';
    }
    if (view === 'today') {
      return 'На сегодня активных записей нет.';
    }
    return 'Записей не найдено.';
  }

  return (
    <div className="registry-page">
      <div className="registry-page__header">
        <h1 className="registry-page__title">Приёмы</h1>
        <button
          type="button"
          className="btn-primary"
          onClick={() => setShowForm((v) => !v)}
          disabled={patients.length === 0}
          title={patients.length === 0 ? 'Сначала добавьте пациента' : undefined}
        >
          {showForm ? 'Скрыть форму' : 'Записать на приём'}
        </button>
      </div>

      <nav className="registry-subtabs" aria-label="Фильтр приёмов">
        {VIEW_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={
              view === tab.id ? 'registry-subtab registry-subtab--active' : 'registry-subtab'
            }
            aria-current={view === tab.id ? 'page' : undefined}
            onClick={() => setView(tab.id)}
          >
            {tab.label}
            {tab.id === 'today' && todayCount > 0 && (
              <span className="registry-subtab__count">{todayCount}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="registry-page__toolbar">
        <div className="registry-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="11" cy="11" r="7" stroke="#999" strokeWidth="2" />
            <path d="M20 20l-3-3" stroke="#999" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            placeholder="Поиск…"
            aria-label="Поиск приёмов"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {canOpenVisit && (
          <span className="registry-page__hint">
            Двойной клик или Enter — открыть приём
          </span>
        )}
      </div>

      {patients.length === 0 && !loading && (
        <p className="message message--warn">
          Нет пациентов — добавьте их в разделе «Пациенты», затем создайте запись.
        </p>
      )}

      {showForm && patients.length > 0 && (
        <form className="form-grid registry-form" onSubmit={handleSubmit}>
          <label className="form-span-2">
            Пациент *
            <PatientAutocomplete
              patients={patients}
              value={form.patient_id}
              onChange={(patientId) => setForm({ ...form, patient_id: patientId })}
              required
            />
          </label>
          <label>
            Дата и время *
            <input
              type="datetime-local"
              value={form.scheduled_at}
              onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
              required
            />
          </label>
          <label>
            Длительность (мин)
            <input
              type="number"
              min={5}
              step={5}
              value={form.duration_minutes}
              onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
            />
          </label>
          <label className="form-span-2">
            Примечание
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
          <div className="form-actions form-span-2">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Сохранение…' : 'Записать'}
            </button>
          </div>
        </form>
      )}

      {error && <p className="message message--error">{error}</p>}
      {loadError && <p className="message message--error">{loadError}</p>}
      {warn && <p className="message message--warn">{warn}</p>}

      <div className="registry-page__body">
        {loading ? (
          <p className="panel-hint">Загрузка…</p>
        ) : displayedAppointments.length === 0 ? (
          <p className="panel-hint">{emptyMessage()}</p>
        ) : (
          <AppointmentsTable
            appointments={displayedAppointments}
            onCancel={handleCancel}
            onOpenVisit={handleOpenVisit}
            canOpenVisit={canOpenVisit}
          />
        )}
      </div>
    </div>
  );
}
