import {
  APPOINTMENT_STATUS_LABELS,
  formatScheduledAt,
  type Appointment,
} from '../api/appointments';
import { formatPatientName, type Patient, type PatientSummary } from '../api/patients';
import {
  findDisplayNextAppointment,
  getPastAppointments,
  isScheduledAppointmentOverdue,
} from '../api/visitHistory';
import { VisitSummaryView } from './VisitSummaryView';

type PatientCardProps = {
  patient: Patient;
  showHeader?: boolean;
  showClinicalDetails?: boolean;
};

function AttendanceSlider({ probability }: { probability: number | null }) {
  const hasValue = probability != null;
  const label = hasValue
    ? `Вероятность явки: ${probability}%`
    : 'Вероятность явки ещё не рассчитана';

  return (
    <div className="attendance-block">
      <div className="attendance-block__label">{label}</div>
      <div
        className={`attendance-slider${hasValue ? '' : ' attendance-slider--empty'}`}
        role="img"
        aria-label={label}
      >
        <div className="attendance-slider__track" />
        {hasValue && (
          <div
            className="attendance-slider__thumb"
            style={{ left: `${100 - probability}%` }}
          />
        )}
      </div>
      <div className="attendance-slider__scale">
        <span>Высокая</span>
        <span>Низкая</span>
      </div>
    </div>
  );
}

function SummaryHistory({ summaries }: { summaries: PatientSummary[] }) {
  if (summaries.length === 0) {
    return null;
  }

  return (
    <details className="patient-card__history">
      <summary>История суммаризаций ({summaries.length})</summary>
      <ul>
        {summaries.map((item) => (
          <li key={item.id}>
            <time dateTime={item.created_at}>
              {new Date(item.created_at).toLocaleString('ru-RU')}
            </time>
            <VisitSummaryView text={item.summary} compact />
          </li>
        ))}
      </ul>
    </details>
  );
}

function VisitHistoryList({ appointments }: { appointments: Appointment[] }) {
  const past = getPastAppointments(appointments);
  if (past.length === 0) {
    return <p className="patient-card__muted">История приёмов пока пуста.</p>;
  }

  return (
    <ul className="patient-card__visits">
      {past.map((a) => (
        <li key={a.id}>
          <span>{formatScheduledAt(a.scheduled_at)}</span>
          <span className={`status-badge status-badge--${a.status}`}>
            {APPOINTMENT_STATUS_LABELS[a.status]}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function PatientCard({
  patient,
  showHeader = true,
  showClinicalDetails = true,
}: PatientCardProps) {
  const appointments = patient.appointments ?? [];
  const summaries = patient.summaries ?? [];
  const nextAppointment = findDisplayNextAppointment(appointments);
  const nextIsOverdue = nextAppointment
    ? isScheduledAppointmentOverdue(nextAppointment)
    : false;

  return (
    <article className="patient-card">
      {showHeader && (
        <header className="patient-card__header">
          <h3>{formatPatientName(patient)}</h3>
          <div className="patient-card__meta">
            {patient.birth_date && <span>Д. р.: {patient.birth_date}</span>}
            {patient.phone && <span>{patient.phone}</span>}
          </div>
        </header>
      )}

      {!showHeader && (patient.birth_date || patient.phone) && (
        <div className="patient-card__meta">
          {patient.birth_date && <span>Д. р.: {patient.birth_date}</span>}
          {patient.phone && <span>{patient.phone}</span>}
        </div>
      )}

      {showClinicalDetails && (
        <AttendanceSlider probability={patient.attendance_probability} />
      )}

      <section className="patient-card__section">
        <h4>Ближайшая запись</h4>
        {nextAppointment ? (
          <p>
            {formatScheduledAt(nextAppointment.scheduled_at)} ·{' '}
            {nextAppointment.duration_minutes} мин
            {nextIsOverdue && (
              <>
                {' '}
                <span className="status-badge status-badge--no_show">Просрочен</span>
              </>
            )}
          </p>
        ) : (
          <p className="patient-card__muted">Нет запланированных приёмов</p>
        )}
      </section>

      {showClinicalDetails && (
        <section className="patient-card__section">
          <h4>Суммаризация</h4>
          {patient.visit_summary ? (
            <VisitSummaryView text={patient.visit_summary} compact />
          ) : (
            <p className="patient-card__muted">Суммаризация ещё не создана</p>
          )}
          <SummaryHistory summaries={summaries} />
        </section>
      )}

      <section className="patient-card__section">
        <h4>{showClinicalDetails ? 'История приёмов' : 'Записи на приём'}</h4>
        <VisitHistoryList appointments={appointments} />
      </section>
    </article>
  );
}
