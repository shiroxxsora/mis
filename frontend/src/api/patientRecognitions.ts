import { authorizedFetch } from './authorizedFetch';
import type { RecognitionResult } from './recognition';

export type SavedPatientRecognition = RecognitionResult & {
  id: number;
  patientId: number;
  patientImageId: number | null;
  imageDownloadUrl: string | null;
  createdAt: string;
};

export async function fetchPatientRecognitions(
  patientId: number,
): Promise<SavedPatientRecognition[]> {
  const response = await authorizedFetch(`/api/patients/${patientId}/recognitions`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  return response.json() as Promise<SavedPatientRecognition[]>;
}

export async function savePatientRecognition(
  patientId: number,
  payload: RecognitionResult & { patientImageId?: number | null },
): Promise<SavedPatientRecognition> {
  const response = await authorizedFetch(`/api/patients/${patientId}/recognitions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      patientImageId: payload.patientImageId ?? null,
      status: payload.status,
      message: payload.message,
      jobId: payload.jobId,
      label: payload.label ?? null,
      confidence: payload.confidence ?? null,
      probHealthy: payload.probHealthy ?? null,
      shapImageBase64: payload.shapImageBase64 ?? null,
      limeImageBase64: payload.limeImageBase64 ?? null,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }

  return response.json() as Promise<SavedPatientRecognition>;
}
