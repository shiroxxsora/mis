import type { Appointment } from './appointments';
import { updatePatientAttendanceProbability } from './patients';
import { predictAttendanceProbability } from './summary';
import { buildAttendanceInput } from './visitHistory';

export type AttendanceRecalcResult =
  | { ok: true; probability: number }
  | { ok: false; error: string };

export async function recalculatePatientAttendance(
  patientId: number,
  appointments: Appointment[],
): Promise<AttendanceRecalcResult> {
  try {
    const input = buildAttendanceInput(appointments);
    const probability = await predictAttendanceProbability(input);
    await updatePatientAttendanceProbability(patientId, probability);
    return { ok: true, probability };
  } catch (e) {
    const error =
      e instanceof Error ? e.message : 'Не удалось рассчитать вероятность явки';
    console.warn('[attendance] recalc failed for patient', patientId, error);
    return { ok: false, error };
  }
}
