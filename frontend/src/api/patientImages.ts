import { authorizedFetch } from './authorizedFetch';

export type PatientImage = {
  id: number;
  patientId: number;
  type: string;
  filePath: string;
  storageUri: string;
  downloadUrl: string;
};

export async function uploadPatientImage(
  patientId: number,
  file: File,
  type: string,
  options?: {
    takenAt?: string;
    toothNumber?: string;
    notes?: string;
  },
): Promise<PatientImage> {
  const form = new FormData();
  form.append('file', file);
  form.append('type', type);
  if (options?.takenAt) form.append('takenAt', options.takenAt);
  if (options?.toothNumber) form.append('toothNumber', options.toothNumber);
  if (options?.notes) form.append('notes', options.notes);

  const response = await authorizedFetch(`/api/patients/${patientId}/images`, {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }

  return response.json() as Promise<PatientImage>;
}

export function patientImageFileUrl(imageId: number): string {
  return `/api/patients/images/${imageId}/file`;
}

export async function fetchAuthorizedImageBlobUrl(path: string): Promise<string> {
  const response = await authorizedFetch(path);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
