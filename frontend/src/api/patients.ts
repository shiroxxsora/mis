import { authorizedFetch } from './authorizedFetch';
import { graphqlRequest } from './graphql';
import type { Appointment } from './appointments';

export type PatientSummary = {
  id: number;
  patient_id: number;
  summary: string;
  created_at: string;
  updated_at: string;
};

export type Patient = {
  id: number;
  last_name: string;
  first_name: string;
  middle_name: string | null;
  birth_date: string | null;
  phone: string | null;
  attendance_probability: number | null;
  visit_summary: string | null;
  created_at?: string;
  appointments?: Appointment[];
  summaries?: PatientSummary[];
};

export type NewPatientInput = {
  last_name: string;
  first_name: string;
  middle_name?: string | null;
  birth_date?: string | null;
  phone?: string | null;
};

const LIST_PATIENTS = `
  query ListPatients {
    patients(order_by: [{ last_name: asc }, { first_name: asc }]) {
      id
      last_name
      first_name
      middle_name
      birth_date
      phone
      attendance_probability
      visit_summary
      created_at
    }
  }
`;

const LIST_PATIENT_CARDS = `
  query ListPatientCards {
    patients(order_by: [{ last_name: asc }, { first_name: asc }]) {
      id
      last_name
      first_name
      middle_name
      birth_date
      phone
      attendance_probability
      visit_summary
      created_at
      appointments(order_by: { scheduled_at: desc }) {
        id
        patient_id
        scheduled_at
        duration_minutes
        status
        complaints
        treatment_done
        notes
      }
      summaries(order_by: { created_at: desc }) {
        id
        patient_id
        summary
        created_at
        updated_at
      }
    }
  }
`;

export const PATIENT_CARDS_SUBSCRIPTION = `
  subscription PatientCards {
    patients(order_by: [{ last_name: asc }, { first_name: asc }]) {
      id
      last_name
      first_name
      middle_name
      birth_date
      phone
      attendance_probability
      visit_summary
      created_at
      appointments(order_by: { scheduled_at: desc }) {
        id
        patient_id
        scheduled_at
        duration_minutes
        status
        complaints
        treatment_done
        notes
      }
      summaries(order_by: { created_at: desc }) {
        id
        patient_id
        summary
        created_at
        updated_at
      }
    }
  }
`;

export const PATIENTS_LIST_SUBSCRIPTION = `
  subscription PatientsList {
    patients(order_by: [{ last_name: asc }, { first_name: asc }]) {
      id
      last_name
      first_name
      middle_name
      birth_date
      phone
      attendance_probability
      visit_summary
      created_at
    }
  }
`;

export const REGISTRAR_PATIENTS_LIST_SUBSCRIPTION = `
  subscription RegistrarPatientsList {
    patients(order_by: [{ last_name: asc }, { first_name: asc }]) {
      id
      last_name
      first_name
      middle_name
      birth_date
      phone
      created_at
    }
  }
`;

export const REGISTRAR_PATIENT_CARDS_SUBSCRIPTION = `
  subscription RegistrarPatientCards {
    patients(order_by: [{ last_name: asc }, { first_name: asc }]) {
      id
      last_name
      first_name
      middle_name
      birth_date
      phone
      created_at
      appointments(order_by: { scheduled_at: desc }) {
        id
        patient_id
        scheduled_at
        duration_minutes
        status
        notes
      }
    }
  }
`;

export function patientsListSubscriptionForRole(role: 'user' | 'registrar'): string {
  return role === 'registrar'
    ? REGISTRAR_PATIENTS_LIST_SUBSCRIPTION
    : PATIENTS_LIST_SUBSCRIPTION;
}

export function patientCardsSubscriptionForRole(role: 'user' | 'registrar'): string {
  return role === 'registrar'
    ? REGISTRAR_PATIENT_CARDS_SUBSCRIPTION
    : PATIENT_CARDS_SUBSCRIPTION;
}

const INSERT_PATIENT = `
  mutation InsertPatient($object: patients_insert_input!) {
    insert_patients_one(object: $object) {
      id
      last_name
      first_name
      middle_name
      birth_date
      phone
    }
  }
`;

export function formatPatientName(
  patient: Pick<Patient, 'last_name' | 'first_name' | 'middle_name'>,
): string {
  return [patient.last_name, patient.first_name, patient.middle_name]
    .filter(Boolean)
    .join(' ');
}

export async function fetchPatients(): Promise<Patient[]> {
  const data = await graphqlRequest<{ patients: Patient[] }>(LIST_PATIENTS);
  return data.patients;
}

export async function fetchPatientCards(): Promise<Patient[]> {
  const data = await graphqlRequest<{ patients: Patient[] }>(LIST_PATIENT_CARDS);
  return data.patients;
}

export async function createPatient(input: NewPatientInput): Promise<Patient> {
  const object = {
    last_name: input.last_name.trim(),
    first_name: input.first_name.trim(),
    middle_name: input.middle_name?.trim() || null,
    birth_date: input.birth_date || null,
    phone: input.phone?.trim() || null,
  };

  const data = await graphqlRequest<{ insert_patients_one: Patient }>(
    INSERT_PATIENT,
    { object },
  );
  return data.insert_patients_one;
}

export async function updatePatientAttendanceProbability(
  patientId: number,
  probability: number,
): Promise<void> {
  const response = await authorizedFetch(
    `/api/patients/${patientId}/attendance-probability`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        probability: Math.round(Math.min(100, Math.max(0, probability))),
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
}

export async function savePatientSummary(
  patientId: number,
  summary: string,
): Promise<void> {
  const response = await authorizedFetch(`/api/patients/${patientId}/summaries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ summary: summary.trim() }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
}
