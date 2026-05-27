import { authorizedFetch } from './authorizedFetch';
import { graphqlRequest } from './graphql';
import type { MisRole } from '../auth/roles';
import type { Patient } from './patients';

export type AppointmentStatus = 'scheduled' | 'arrived' | 'no_show' | 'completed' | 'cancelled';

export type Appointment = {
  id: number;
  patient_id: number;
  scheduled_at: string;
  duration_minutes: number;
  status: AppointmentStatus;
  complaints: string | null;
  treatment_done: boolean;
  notes: string | null;
  created_at?: string;
  patient?: Pick<Patient, 'id' | 'last_name' | 'first_name' | 'middle_name'>;
};

export type NewAppointmentInput = {
  patient_id: number;
  scheduled_at: string;
  duration_minutes?: number;
  notes?: string | null;
};

const LIST_APPOINTMENTS = `
  query ListAppointments {
    appointments(order_by: { scheduled_at: asc }) {
      id
      patient_id
      scheduled_at
      duration_minutes
      status
      complaints
      treatment_done
      notes
      created_at
      patient {
        id
        last_name
        first_name
        middle_name
      }
    }
  }
`;

export const APPOINTMENTS_SUBSCRIPTION = `
  subscription AppointmentsList {
    appointments(order_by: { scheduled_at: asc }) {
      id
      patient_id
      scheduled_at
      duration_minutes
      status
      complaints
      treatment_done
      notes
      created_at
      patient {
        id
        last_name
        first_name
        middle_name
      }
    }
  }
`;

export const REGISTRAR_APPOINTMENTS_SUBSCRIPTION = `
  subscription RegistrarAppointmentsList {
    appointments(order_by: { scheduled_at: asc }) {
      id
      patient_id
      scheduled_at
      duration_minutes
      status
      notes
      created_at
      patient {
        id
        last_name
        first_name
        middle_name
      }
    }
  }
`;

export function appointmentsSubscriptionForRole(role: 'user' | 'registrar'): string {
  return role === 'registrar'
    ? REGISTRAR_APPOINTMENTS_SUBSCRIPTION
    : APPOINTMENTS_SUBSCRIPTION;
}

const REGISTRAR_LIST_APPOINTMENTS = `
  query RegistrarListAppointments {
    appointments(order_by: { scheduled_at: asc }) {
      id
      patient_id
      scheduled_at
      duration_minutes
      status
      notes
      created_at
      patient {
        id
        last_name
        first_name
        middle_name
      }
    }
  }
`;

const INSERT_APPOINTMENT = `
  mutation InsertAppointment($object: appointments_insert_input!) {
    insert_appointments_one(object: $object) {
      id
      patient_id
      scheduled_at
      duration_minutes
      status
      complaints
      treatment_done
      notes
    }
  }
`;

const REGISTRAR_INSERT_APPOINTMENT = `
  mutation RegistrarInsertAppointment($object: appointments_insert_input!) {
    insert_appointments_one(object: $object) {
      id
      patient_id
      scheduled_at
      duration_minutes
      status
      notes
    }
  }
`;

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: 'Запланирован',
  arrived: 'Явился',
  no_show: 'Не явился',
  completed: 'Завершён',
  cancelled: 'Отменён',
};

function normalizeRegistrarAppointment(
  row: Omit<Appointment, 'complaints' | 'treatment_done'> &
    Partial<Pick<Appointment, 'complaints' | 'treatment_done'>>,
): Appointment {
  return {
    ...row,
    complaints: row.complaints ?? null,
    treatment_done: row.treatment_done ?? false,
  };
}

export async function fetchAppointments(role: MisRole = 'user'): Promise<Appointment[]> {
  const query =
    role === 'registrar' ? REGISTRAR_LIST_APPOINTMENTS : LIST_APPOINTMENTS;
  const data = await graphqlRequest<{ appointments: Appointment[] }>(query);
  if (role === 'registrar') {
    return data.appointments.map((row) => normalizeRegistrarAppointment(row));
  }
  return data.appointments;
}

export async function createAppointment(
  input: NewAppointmentInput,
  role: MisRole = 'user',
): Promise<Appointment> {
  const object = {
    patient_id: input.patient_id,
    scheduled_at: input.scheduled_at,
    duration_minutes: input.duration_minutes ?? 30,
    notes: input.notes?.trim() || null,
  };

  const query = role === 'registrar' ? REGISTRAR_INSERT_APPOINTMENT : INSERT_APPOINTMENT;
  const data = await graphqlRequest<{ insert_appointments_one: Appointment }>(
    query,
    { object },
  );
  if (role === 'registrar') {
    return normalizeRegistrarAppointment(data.insert_appointments_one);
  }
  return data.insert_appointments_one;
}

export async function cancelAppointment(id: number): Promise<void> {
  const response = await authorizedFetch(`/api/appointments/${id}/cancel`, {
    method: 'POST',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
}

export async function processAppointment(input: {
  id: number;
  status: AppointmentStatus;
  complaints?: string | null;
  notes?: string | null;
  treatment_done: boolean;
}): Promise<void> {
  const response = await authorizedFetch(`/api/appointments/${input.id}/process`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: input.status,
      complaints: input.complaints?.trim() || null,
      notes: input.notes?.trim() || null,
      treatmentDone: input.treatment_done,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
}

/** datetime-local → ISO для Hasura timestamptz */
export function localDatetimeToIso(localValue: string): string {
  return new Date(localValue).toISOString();
}

export function formatScheduledAt(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export function isAppointmentToday(scheduledAt: string, now = new Date()): boolean {
  const date = new Date(scheduledAt);
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

export function compareAppointmentsByScheduledAt(
  a: Appointment,
  b: Appointment,
  direction: 'asc' | 'desc',
): number {
  const diff = new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
  if (diff !== 0) {
    return direction === 'asc' ? diff : -diff;
  }
  return direction === 'asc' ? a.id - b.id : b.id - a.id;
}
