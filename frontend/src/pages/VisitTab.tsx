import { useEffect, useMemo, useRef, useState } from 'react';
import {
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENTS_SUBSCRIPTION,
  fetchAppointments,
  processAppointment,
  type Appointment,
  type AppointmentStatus,
} from '../api/appointments';
import { recalculatePatientAttendance } from '../api/patientInsights';
import {
  PATIENTS_LIST_SUBSCRIPTION,
  savePatientSummary,
  type Patient,
} from '../api/patients';
import { fetchAuthorizedImageBlobUrl, uploadPatientImage } from '../api/patientImages';
import {
  fetchPatientRecognitions,
  savePatientRecognition,
  type SavedPatientRecognition,
} from '../api/patientRecognitions';
import { fileToBase64, recognizeTooth, type RecognitionResult } from '../api/recognition';
import { RecognitionResultView } from '../components/RecognitionResultView';
import { summarizeVisits } from '../api/summary';
import {
  applyAppointmentVisitUpdate,
  buildSummaryInput,
  shouldRecalculateAttendance,
  sortAppointmentsByDateDesc,
} from '../api/visitHistory';
import { PatientAutocomplete } from '../components/PatientAutocomplete';
import { CardLayout } from '../components/CardLayout';
import { VisitSummaryView } from '../components/VisitSummaryView';
import { useGraphqlSubscription } from '../hooks/useGraphqlSubscription';
import { getStatusSelectOptions } from '../utils/appointmentStatusTransitions';
import type { VisitNavigationTarget } from '../navigation/visitNavigation';
import {
  buildDocumentNavigationFromVisit,
  type DocumentNavigationTarget,
} from '../navigation/documentNavigation';

type VisitForm = {
  status: AppointmentStatus;
  complaints: string;
  notes: string;
  treatment_done: boolean;
};

const defaultVisitForm: VisitForm = {
  status: 'arrived',
  complaints: '',
  notes: '',
  treatment_done: false,
};

const CARD_TABS = [
  { id: 'visit', label: 'Данные приёма' },
  { id: 'recognition', label: 'Распознавание' },
  { id: 'summary', label: 'Суммаризация' },
];

const SUMMARY_STATUSES: AppointmentStatus[] = ['arrived', 'completed'];

function appointmentToVisitForm(appointment: Appointment): VisitForm {
  return {
    status: appointment.status,
    complaints: appointment.complaints ?? '',
    notes: appointment.notes ?? '',
    treatment_done: appointment.treatment_done ?? false,
  };
}

function visitFormSnapshotKey(form: VisitForm): string {
  return JSON.stringify(form);
}

async function refreshPatientSummary(
  patientId: number,
  appointments: Appointment[],
): Promise<string> {
  const input = buildSummaryInput(appointments);
  const text = await summarizeVisits(input);
  await savePatientSummary(patientId, text);
  return text;
}

type VisitTabProps = {
  navigationTarget: VisitNavigationTarget | null;
  navigationSeq: number;
  onOpenDocuments?: (target: DocumentNavigationTarget) => void;
};

export function VisitTab({
  navigationTarget,
  navigationSeq,
  onOpenDocuments,
}: VisitTabProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeCardTab, setActiveCardTab] = useState('visit');
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [selectedAppointmentId, setSelectedAppointmentId] = useState('');
  const [visitForm, setVisitForm] = useState<VisitForm>(defaultVisitForm);
  const [summary, setSummary] = useState('');
  const [saving, setSaving] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [recognitionLoading, setRecognitionLoading] = useState(false);
  const [recognitionHistoryLoading, setRecognitionHistoryLoading] = useState(false);
  const [recognitionHistory, setRecognitionHistory] = useState<SavedPatientRecognition[]>([]);
  const [activeRecognitionId, setActiveRecognitionId] = useState<number | null>(null);
  const [recognitionResult, setRecognitionResult] = useState<RecognitionResult | null>(null);
  const [savedPreviewUrl, setSavedPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const activePatientIdRef = useRef('');
  const lastLocalSummaryPatientIdRef = useRef<string | null>(null);
  const summarizingPatientIdRef = useRef<string | null>(null);
  const loadedAppointmentIdRef = useRef('');
  const loadedServerKeyRef = useRef('');
  const visitFormDirtyRef = useRef(false);
  const savedVisitByAppointmentIdRef = useRef<Map<number, VisitForm>>(new Map());
  const lastSavedSnapshotKeyByAppointmentIdRef = useRef<Map<number, string>>(new Map());
  const savingInFlightRef = useRef(false);
  const pendingNavigationRef = useRef<VisitNavigationTarget | null>(null);

  const {
    data: patientsData,
    error: patientsError,
    loading: patientsLoading,
    transport: patientsTransport,
  } = useGraphqlSubscription<{ patients: Patient[] }>(PATIENTS_LIST_SUBSCRIPTION);

  const {
    data: appointmentsData,
    error: appointmentsError,
    loading: appointmentsLoading,
    transport: appointmentsTransport,
  } = useGraphqlSubscription<{ appointments: Appointment[] }>(APPOINTMENTS_SUBSCRIPTION);

  const patients = patientsData?.patients ?? [];
  const appointments = appointmentsData?.appointments ?? [];
  const loading = patientsLoading || appointmentsLoading;
  const loadError = patientsError?.message ?? appointmentsError?.message ?? null;
  const usingPolling =
    patientsTransport === 'poll' || appointmentsTransport === 'poll';

  useEffect(() => {
    activePatientIdRef.current = selectedPatientId;
  }, [selectedPatientId]);

  useEffect(() => {
    if (!navigationTarget) {
      return;
    }
    if (visitFormDirtyRef.current) {
      const confirmed = window.confirm(
        'Есть несохранённые изменения приёма. Открыть другой приём без сохранения?',
      );
      if (!confirmed) {
        return;
      }
    }
    pendingNavigationRef.current = navigationTarget;
    visitFormDirtyRef.current = false;
    loadedAppointmentIdRef.current = '';
    loadedServerKeyRef.current = '';
    setActiveCardTab('visit');
    setError(null);
    setWarn(null);
    setSelectedPatientId(String(navigationTarget.patientId));
    setSelectedAppointmentId(String(navigationTarget.appointmentId));
    setSelectedFile(null);
    setRecognitionResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
  }, [navigationSeq, navigationTarget]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      if (savedPreviewUrl) {
        URL.revokeObjectURL(savedPreviewUrl);
      }
    };
  }, [previewUrl, savedPreviewUrl]);

  const activeRecognition = useMemo(
    () => recognitionHistory.find((item) => item.id === activeRecognitionId) ?? null,
    [recognitionHistory, activeRecognitionId],
  );

  useEffect(() => {
    if (!selectedPatientId) {
      setRecognitionHistory([]);
      setActiveRecognitionId(null);
      setRecognitionResult(null);
      return;
    }

    let cancelled = false;
    setRecognitionHistoryLoading(true);
    fetchPatientRecognitions(Number(selectedPatientId))
      .then((items) => {
        if (cancelled) {
          return;
        }
        setRecognitionHistory(items);
        const latest = items[0] ?? null;
        setActiveRecognitionId(latest?.id ?? null);
        setRecognitionResult(latest);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Не удалось загрузить распознавания');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setRecognitionHistoryLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedPatientId]);

  useEffect(() => {
    if (previewUrl) {
      return;
    }

    const imagePath = activeRecognition?.imageDownloadUrl;
    if (!imagePath) {
      setSavedPreviewUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }
        return null;
      });
      return;
    }

    let cancelled = false;
    fetchAuthorizedImageBlobUrl(imagePath)
      .then((url) => {
        if (!cancelled) {
          setSavedPreviewUrl((current) => {
            if (current) {
              URL.revokeObjectURL(current);
            }
            return url;
          });
        } else {
          URL.revokeObjectURL(url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSavedPreviewUrl((current) => {
            if (current) {
              URL.revokeObjectURL(current);
            }
            return null;
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeRecognition?.imageDownloadUrl, previewUrl]);

  const selectedPatient = useMemo(
    () => patients.find((p) => String(p.id) === selectedPatientId) ?? null,
    [patients, selectedPatientId],
  );

  const patientAppointments = useMemo(() => {
    if (!selectedPatientId) {
      return [];
    }
    const id = Number(selectedPatientId);
    return sortAppointmentsByDateDesc(appointments.filter((a) => a.patient_id === id));
  }, [appointments, selectedPatientId]);

  const selectedAppointment = useMemo(
    () => patientAppointments.find((a) => String(a.id) === selectedAppointmentId) ?? null,
    [patientAppointments, selectedAppointmentId],
  );

  const statusOptions = useMemo(
    () => getStatusSelectOptions(visitForm.status ?? selectedAppointment?.status),
    [visitForm.status, selectedAppointment?.status],
  );

  const selectedAppointmentServerKey = selectedAppointment
    ? visitFormSnapshotKey(appointmentToVisitForm(selectedAppointment))
    : '';

  useEffect(() => {
    if (!selectedAppointmentId) {
      loadedAppointmentIdRef.current = '';
      loadedServerKeyRef.current = '';
      visitFormDirtyRef.current = false;
      setVisitForm(defaultVisitForm);
      return;
    }
    if (savingInFlightRef.current) {
      return;
    }
    if (!selectedAppointment) {
      const pending = pendingNavigationRef.current;
      const matchesPendingNavigation =
        pending &&
        String(pending.appointmentId) === selectedAppointmentId &&
        String(pending.patientId) === selectedPatientId;

      if (loading || matchesPendingNavigation) {
        return;
      }

      const existsInData = appointments.some(
        (a) =>
          String(a.id) === selectedAppointmentId &&
          String(a.patient_id) === selectedPatientId,
      );
      if (existsInData) {
        return;
      }

      pendingNavigationRef.current = null;
      setSelectedAppointmentId('');
      loadedAppointmentIdRef.current = '';
      loadedServerKeyRef.current = '';
      visitFormDirtyRef.current = false;
      setVisitForm(defaultVisitForm);
      return;
    }

    pendingNavigationRef.current = null;

    const lastSavedKey = lastSavedSnapshotKeyByAppointmentIdRef.current.get(
      selectedAppointment.id,
    );
    if (
      lastSavedKey &&
      selectedAppointmentServerKey !== lastSavedKey &&
      !visitFormDirtyRef.current
    ) {
      savedVisitByAppointmentIdRef.current.delete(selectedAppointment.id);
      lastSavedSnapshotKeyByAppointmentIdRef.current.delete(selectedAppointment.id);
      setWarn('Данные приёма обновились на сервере. Форма синхронизирована.');
    }

    if (
      visitFormDirtyRef.current &&
      loadedAppointmentIdRef.current === selectedAppointmentId
    ) {
      return;
    }

    const savedVisit = savedVisitByAppointmentIdRef.current.get(selectedAppointment.id);
    const nextForm = savedVisit ?? appointmentToVisitForm(selectedAppointment);
    const nextLoadedKey = savedVisit
      ? visitFormSnapshotKey(savedVisit)
      : selectedAppointmentServerKey;

    if (
      loadedAppointmentIdRef.current === selectedAppointmentId &&
      loadedServerKeyRef.current === nextLoadedKey
    ) {
      if (lastSavedKey && selectedAppointmentServerKey === lastSavedKey) {
        savedVisitByAppointmentIdRef.current.delete(selectedAppointment.id);
        lastSavedSnapshotKeyByAppointmentIdRef.current.delete(selectedAppointment.id);
      }
      return;
    }

    loadedAppointmentIdRef.current = selectedAppointmentId;
    loadedServerKeyRef.current = nextLoadedKey;
    visitFormDirtyRef.current = false;
    setVisitForm(nextForm);

    if (lastSavedKey && selectedAppointmentServerKey === lastSavedKey) {
      savedVisitByAppointmentIdRef.current.delete(selectedAppointment.id);
      lastSavedSnapshotKeyByAppointmentIdRef.current.delete(selectedAppointment.id);
    }
  }, [selectedAppointmentId, selectedAppointment, selectedAppointmentServerKey, loading, appointments]);

  function patchVisitForm(patch: Partial<VisitForm>) {
    visitFormDirtyRef.current = true;
    setVisitForm((prev) => ({ ...prev, ...patch }));
  }

  useEffect(() => {
    lastLocalSummaryPatientIdRef.current = null;
    summarizingPatientIdRef.current = null;
    setSummarizing(false);
    savedVisitByAppointmentIdRef.current.clear();
    lastSavedSnapshotKeyByAppointmentIdRef.current.clear();
  }, [selectedPatientId]);

  useEffect(() => {
    if (summarizingPatientIdRef.current === selectedPatientId) {
      return;
    }
    if (lastLocalSummaryPatientIdRef.current === selectedPatientId) {
      return;
    }
    setSummary(selectedPatient?.visit_summary ?? '');
  }, [selectedPatient, selectedPatientId]);

  useEffect(() => {
    if (
      lastLocalSummaryPatientIdRef.current === selectedPatientId &&
      selectedPatient?.visit_summary === summary
    ) {
      lastLocalSummaryPatientIdRef.current = null;
    }
  }, [selectedPatient?.visit_summary, selectedPatientId, summary]);

  function resetRecognitionState() {
    setSelectedFile(null);
    setRecognitionResult(null);
    setActiveRecognitionId(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setSavedPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
  }

  function selectRecognition(item: SavedPatientRecognition) {
    setActiveRecognitionId(item.id);
    setRecognitionResult(item);
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  }

  function handlePatientChange(patientId: string) {
    setSelectedPatientId(patientId);
    setSelectedAppointmentId('');
    visitFormDirtyRef.current = false;
    resetRecognitionState();
    setRecognitionHistory([]);
  }

  function handleAppointmentChange(nextAppointmentId: string) {
    if (
      visitFormDirtyRef.current &&
      selectedAppointmentId &&
      nextAppointmentId !== selectedAppointmentId
    ) {
      const confirmed = window.confirm(
        'Есть несохранённые изменения приёма. Переключить приём без сохранения?',
      );
      if (!confirmed) {
        return;
      }
      visitFormDirtyRef.current = false;
    }
    setSelectedAppointmentId(nextAppointmentId);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setRecognitionResult(null);
    setActiveRecognitionId(null);
    setSelectedFile(file);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  async function handleSaveVisit() {
    if (!selectedAppointment || !selectedPatientId) {
      setError('Выберите приём для обработки');
      return;
    }

    const patientId = Number(selectedPatientId);
    const requestPatientId = selectedPatientId;
    const savingAppointmentId = selectedAppointment.id;
    const previousStatus = selectedAppointment.status;

    setSaving(true);
    setError(null);
    setWarn(null);
    savingInFlightRef.current = true;
    const savedStatus = visitForm.status;
    let patientAppointmentsFresh: Appointment[] = [];
    let appointmentsFetchSucceeded = false;

    const savedForm = { ...visitForm };
    const savedKey = visitFormSnapshotKey(savedForm);
    savedVisitByAppointmentIdRef.current.set(savingAppointmentId, savedForm);
    lastSavedSnapshotKeyByAppointmentIdRef.current.set(savingAppointmentId, savedKey);
    loadedAppointmentIdRef.current = String(savingAppointmentId);
    loadedServerKeyRef.current = savedKey;

    try {
      await processAppointment({
        id: selectedAppointment.id,
        status: visitForm.status,
        complaints: visitForm.complaints,
        notes: visitForm.notes,
        treatment_done: visitForm.treatment_done,
      });
      visitFormDirtyRef.current = false;

      try {
        const freshAppointments = sortAppointmentsByDateDesc(await fetchAppointments('user'));
        appointmentsFetchSucceeded = true;
        patientAppointmentsFresh = freshAppointments.filter((a) => a.patient_id === patientId);
        const savedAppointment = patientAppointmentsFresh.find(
          (a) => a.id === selectedAppointment.id,
        );
        if (savedAppointment) {
          const confirmedForm = appointmentToVisitForm(savedAppointment);
          const confirmedKey = visitFormSnapshotKey(confirmedForm);
          savedVisitByAppointmentIdRef.current.set(savedAppointment.id, confirmedForm);
          lastSavedSnapshotKeyByAppointmentIdRef.current.set(savedAppointment.id, confirmedKey);
          loadedServerKeyRef.current = confirmedKey;
          if (selectedAppointmentId === String(savingAppointmentId)) {
            setVisitForm(confirmedForm);
          }
        }
      } catch {
        setWarn('Приём сохранён, но не удалось обновить данные на экране. Обновите страницу.');
      }

      if (SUMMARY_STATUSES.includes(savedStatus)) {
        if (!appointmentsFetchSucceeded) {
          setWarn(
            (current) =>
              current ??
              'Приём сохранён, но суммаризация не обновлена: не удалось загрузить историю приёмов.',
          );
        } else {
          setSummarizing(true);
          summarizingPatientIdRef.current = requestPatientId;
          try {
            const text = await refreshPatientSummary(patientId, patientAppointmentsFresh);
            if (activePatientIdRef.current === requestPatientId) {
              lastLocalSummaryPatientIdRef.current = requestPatientId;
              setSummary(text);
            }
          } catch (err) {
            setError(
              err instanceof Error ? err.message : 'Приём сохранён, но суммаризация не обновилась',
            );
          } finally {
            summarizingPatientIdRef.current = null;
            setSummarizing(false);
          }
        }
      }

      if (shouldRecalculateAttendance(previousStatus, savedStatus)) {
        if (!appointmentsFetchSucceeded) {
          setWarn(
            (current) =>
              current ??
              'Приём сохранён, но вероятность явки не пересчитана: не удалось загрузить историю приёмов.',
          );
        } else {
          let appointmentsForRecalc = patientAppointmentsFresh;
          appointmentsForRecalc = applyAppointmentVisitUpdate(
            appointmentsForRecalc,
            selectedAppointment.id,
            {
              status: savedStatus,
              complaints: visitForm.complaints.trim() || null,
              notes: visitForm.notes.trim() || null,
              treatment_done: visitForm.treatment_done,
            },
          );

          const result = await recalculatePatientAttendance(
            patientId,
            appointmentsForRecalc,
          );
          if (!result.ok) {
            setWarn(`Приём сохранён, но вероятность явки не обновлена: ${result.error}`);
          }
        }
      }
    } catch (err) {
      savedVisitByAppointmentIdRef.current.delete(savingAppointmentId);
      lastSavedSnapshotKeyByAppointmentIdRef.current.delete(savingAppointmentId);
      visitFormDirtyRef.current = true;
      setError(err instanceof Error ? err.message : 'Не удалось сохранить данные приёма');
    } finally {
      savingInFlightRef.current = false;
      setSaving(false);
    }
  }

  async function handleSummarize() {
    if (!selectedPatientId) {
      setError('Выберите пациента');
      return;
    }
    if (patientAppointments.length === 0) {
      setSummary('У пациента пока нет истории приёмов.');
      return;
    }

    const requestPatientId = selectedPatientId;
    setSummarizing(true);
    summarizingPatientIdRef.current = requestPatientId;
    setError(null);
    try {
      const freshAppointments = sortAppointmentsByDateDesc(await fetchAppointments('user')).filter(
        (a) => a.patient_id === Number(selectedPatientId),
      );
      const text = await refreshPatientSummary(Number(selectedPatientId), freshAppointments);
      if (activePatientIdRef.current === requestPatientId) {
        lastLocalSummaryPatientIdRef.current = requestPatientId;
        setSummary(text);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось получить суммаризацию');
    } finally {
      summarizingPatientIdRef.current = null;
      setSummarizing(false);
    }
  }

  async function handleRecognize() {
    if (!selectedPatientId) {
      setError('Выберите пациента');
      return;
    }
    if (!selectedFile) {
      setError('Загрузите изображение зуба');
      return;
    }
    const patientId = Number(selectedPatientId);
    const requestPatientId = selectedPatientId;
    setRecognitionLoading(true);
    setError(null);
    setRecognitionResult(null);
    try {
      const payload = await fileToBase64(selectedFile);
      const result = await recognizeTooth(payload, `mis-ui:patient-${patientId}`);
      const image = await uploadPatientImage(patientId, selectedFile, 'tooth', {
        takenAt: new Date().toISOString(),
      });
      const saved = await savePatientRecognition(patientId, {
        ...result,
        patientImageId: image.id,
      });
      if (activePatientIdRef.current !== requestPatientId) {
        return;
      }
      setRecognitionHistory((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setActiveRecognitionId(saved.id);
      setRecognitionResult(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось выполнить распознавание');
    } finally {
      setRecognitionLoading(false);
    }
  }

  function handleOpenDocuments() {
    if (!selectedPatientId || !onOpenDocuments) {
      return;
    }

    if (visitFormDirtyRef.current) {
      const confirmed = window.confirm(
        'Есть несохранённые изменения приёма. Перейти к документам без сохранения?',
      );
      if (!confirmed) {
        return;
      }
    }

    onOpenDocuments(
      buildDocumentNavigationFromVisit({
        patientId: Number(selectedPatientId),
        appointment: selectedAppointment,
        complaints: visitForm.complaints,
        notes: visitForm.notes,
      }),
    );
  }

  const sidebar = (
    <>
      <div className="field">
        <span className="field__label">Пациент</span>
        <PatientAutocomplete
          patients={patients}
          value={selectedPatientId}
          onChange={handlePatientChange}
          disabled={loading}
        />
      </div>

      <div className="field">
        <span className="field__label">Приём</span>
        <select
          value={selectedAppointmentId}
          onChange={(e) => handleAppointmentChange(e.target.value)}
          disabled={!selectedPatientId || loading}
        >
          <option value="">— выберите приём —</option>
          {patientAppointments.map((a) => (
            <option key={a.id} value={a.id}>
              {new Date(a.scheduled_at).toLocaleString('ru-RU')} —{' '}
              {APPOINTMENT_STATUS_LABELS[a.status]}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <span className="field__label">Статус</span>
        <select
          value={visitForm.status}
          onChange={(e) =>
            patchVisitForm({ status: e.target.value as AppointmentStatus })
          }
          disabled={!selectedAppointment || statusOptions.length <= 1}
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <span className="field__label">Лечение выполнено</span>
        <select
          value={visitForm.treatment_done ? 'yes' : 'no'}
          onChange={(e) =>
            patchVisitForm({ treatment_done: e.target.value === 'yes' })
          }
          disabled={!selectedAppointment}
        >
          <option value="no">Нет</option>
          <option value="yes">Да</option>
        </select>
      </div>
    </>
  );

  const footer =
    activeCardTab === 'visit' ? (
      <>
        <button
          type="button"
          className="btn-secondary"
          onClick={handleOpenDocuments}
          disabled={!selectedPatientId || loading || !onOpenDocuments}
        >
          Оформить документ
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            void handleSaveVisit();
          }}
          disabled={!selectedAppointment || saving || loading}
        >
          {saving ? 'Сохранение…' : 'Сохранить'}
        </button>
      </>
    ) : activeCardTab === 'recognition' ? (
      <button
        type="button"
        className="btn-primary"
        onClick={handleRecognize}
        disabled={!selectedPatientId || !selectedFile || recognitionLoading || loading}
      >
        {recognitionLoading ? 'Анализ…' : 'Распознать'}
      </button>
    ) : (
      <button
        type="button"
        className="btn-primary"
        onClick={handleSummarize}
        disabled={!selectedPatientId || summarizing || loading}
      >
        {summarizing ? 'Суммаризация…' : 'Обновить суммаризацию'}
      </button>
    );

  const alerts = (
    <>
      {error && <p className="message message--error">{error}</p>}
      {loadError && <p className="message message--error">{loadError}</p>}
      {usingPolling && (
        <p className="message message--warn">
          Live-обновления недоступны по WebSocket — данные обновляются каждые 5 секунд.
        </p>
      )}
      {warn && <p className="message message--warn">{warn}</p>}
    </>
  );

  const loadingHint = <p className="panel-hint panel-hint--inline">Загрузка…</p>;

  const panels = {
    visit: loading ? (
      loadingHint
    ) : (
      <form
        id="visit-form"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSaveVisit();
        }}
      >
        <section className="form-section">
          <h3 className="form-section__title">Жалобы и заметки</h3>
          <div className="form-section__grid form-section__grid--2">
            <div className="field form-span-2">
              <span className="field__label">Жалобы</span>
              <textarea
                rows={3}
                value={visitForm.complaints}
                onChange={(e) => patchVisitForm({ complaints: e.target.value })}
                disabled={!selectedAppointment}
              />
            </div>
            <div className="field form-span-2">
              <span className="field__label">Заметки по приёму</span>
              <textarea
                rows={3}
                value={visitForm.notes}
                onChange={(e) => patchVisitForm({ notes: e.target.value })}
                disabled={!selectedAppointment}
              />
            </div>
          </div>
        </section>
      </form>
    ),
    recognition: loading || recognitionHistoryLoading ? (
      loadingHint
    ) : (
      <section className="form-section">
        <h3 className="form-section__title">Распознавание зуба</h3>
        <div className="form-section__grid form-section__grid--2">
          <div className="field form-span-2">
            <span className="field__label">Изображение</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              disabled={!selectedPatientId}
            />
          </div>
          {(previewUrl ?? savedPreviewUrl) && (
            <div className="form-span-2">
              <img
                src={previewUrl ?? savedPreviewUrl ?? undefined}
                alt="Превью зуба"
                className="recognition-preview"
              />
            </div>
          )}
          {recognitionResult && (
            <div className="form-span-2">
              <RecognitionResultView result={recognitionResult} />
            </div>
          )}
          {recognitionHistory.length > 0 && (
            <div className="form-span-2 recognition-history">
              <span className="field__label">Сохранённые результаты ({recognitionHistory.length})</span>
              <ul className="recognition-history__list">
                {recognitionHistory.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={
                        item.id === activeRecognitionId
                          ? 'recognition-history__item recognition-history__item--active'
                          : 'recognition-history__item'
                      }
                      onClick={() => selectRecognition(item)}
                    >
                      <time dateTime={item.createdAt}>
                        {new Date(item.createdAt).toLocaleString('ru-RU')}
                      </time>
                      <span>
                        {item.label ?? item.status}
                        {item.confidence != null
                          ? ` · ${(item.confidence * 100).toFixed(1)}%`
                          : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
    ),
    summary: loading ? (
      loadingHint
    ) : (
      <section className="form-section">
        <h3 className="form-section__title">Суммаризация визитов</h3>
        <VisitSummaryView text={summary} emptyMessage="Суммаризация пока пуста" />
      </section>
    ),
  };

  return (
    <CardLayout
      title="Приём"
      sidebar={sidebar}
      tabs={CARD_TABS}
      activeTab={activeCardTab}
      onTabChange={setActiveCardTab}
      footer={footer}
      alerts={alerts}
      panels={panels}
      busy={saving}
      busyLabel="Сохраняем приём..."
    />
  );
}
