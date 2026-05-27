import type { Appointment } from '../api/appointments';
import { localIsoDateFromTimestamp } from '../utils/localDate';

export type DocumentNavigationTarget = {
  patientId: number;
  appointmentId?: number;
  templateCode?: string;
  prefillAttributes?: Record<string, string>;
};

export function buildDocumentNavigationFromVisit(input: {
  patientId: number;
  appointment?: Appointment | null;
  complaints?: string;
  notes?: string;
  templateCode?: string;
}): DocumentNavigationTarget {
  const reasonParts = [input.complaints?.trim(), input.notes?.trim()].filter(Boolean);
  const prefillAttributes: Record<string, string> = {};

  if (reasonParts.length > 0) {
    prefillAttributes.reason = reasonParts.join('\n');
  }

  if (input.appointment) {
    const appointmentDate = localIsoDateFromTimestamp(input.appointment.scheduled_at);
    prefillAttributes.appointment_date = appointmentDate;
    prefillAttributes.payment_date = appointmentDate;
  }

  return {
    patientId: input.patientId,
    appointmentId: input.appointment?.id,
    templateCode: input.templateCode,
    prefillAttributes:
      Object.keys(prefillAttributes).length > 0 ? prefillAttributes : undefined,
  };
}
