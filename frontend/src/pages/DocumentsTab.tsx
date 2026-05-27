import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyTokenUserAttributes,
  buildPatientContext,
  escapeHtml,
  fetchDocumentTemplates,
  isReferralClinicAttribute,
  isReferralDirectionAttribute,
  isReferralSpecialistAttribute,
  isTokenUserAttribute,
  renderDocumentTemplate,
  validateDocumentAttributes,
  type DocumentTemplate,
  type DocumentTemplateAttribute,
} from '../api/documents';
import {
  fetchReferralOptions,
  formatSpecialistLabel,
  type ReferralClinic,
  type ReferralDirection,
  type ReferralSpecialist,
} from '../api/referrals';
import { patientsListSubscriptionForRole, type Patient } from '../api/patients';
import { PatientAutocomplete } from '../components/PatientAutocomplete';
import { CardLayout } from '../components/CardLayout';
import { useAuth } from '../auth/AuthContext';
import { useRefreshOnFocus } from '../hooks/useLiveDataRefresh';
import { useGraphqlSubscription } from '../hooks/useGraphqlSubscription';
import { localTodayIsoDate } from '../utils/localDate';
import type { DocumentNavigationTarget } from '../navigation/documentNavigation';

const CARD_TABS = [
  { id: 'params', label: 'Параметры' },
  { id: 'preview', label: 'Предпросмотр' },
];

function getInputType(attr: DocumentTemplateAttribute): string {
  if (attr.type === 'number') {
    return 'number';
  }
  if (attr.type === 'date') {
    return 'date';
  }
  return 'text';
}

function toPrintableHtml(content: string, title: string): string {
  const escapedContent = escapeHtml(content);
  const escapedTitle = escapeHtml(title);
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>${escapedTitle}</title>
  <style>
    body { font-family: "Segoe UI", Arial, sans-serif; margin: 24px; color: #111; }
    .doc { white-space: pre-wrap; line-height: 1.45; }
    @page { size: A4; margin: 16mm; }
  </style>
</head>
<body>
  <div class="doc">${escapedContent}</div>
</body>
</html>`;
}

function fixedDirectionCode(template: DocumentTemplate | null): string | null {
  if (template?.code === 'referral_xray') {
    return 'xray';
  }
  return null;
}

function findSpecialistById(
  directions: ReferralDirection[],
  specialistId: string,
): ReferralSpecialist | null {
  for (const direction of directions) {
    for (const clinic of direction.clinics) {
      const specialist = clinic.specialists.find((item) => String(item.id) === specialistId);
      if (specialist) {
        return specialist;
      }
    }
  }
  return null;
}

export function DocumentsTab({
  navigationTarget = null,
  navigationSeq = 0,
}: {
  navigationTarget?: DocumentNavigationTarget | null;
  navigationSeq?: number;
}) {
  const { displayName, misRole, isDoctor } = useAuth();
  const patientsSubscription = patientsListSubscriptionForRole(misRole!);
  const pendingPrefillRef = useRef<Record<string, string> | null>(null);
  const [activeCardTab, setActiveCardTab] = useState('params');
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [referralDirections, setReferralDirections] = useState<ReferralDirection[]>([]);
  const [selectedReferralClinicId, setSelectedReferralClinicId] = useState('');
  const [selectedReferralSpecialistId, setSelectedReferralSpecialistId] = useState('');
  const {
    data: patientsData,
    error: patientsError,
    loading: patientsLoading,
  } = useGraphqlSubscription<{ patients: Patient[] }>(patientsSubscription);

  const patients = patientsData?.patients ?? [];
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [attributes, setAttributes] = useState<Record<string, string>>({});
  const [generatedDocument, setGeneratedDocument] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const tpls = await fetchDocumentTemplates();
      setTemplates(tpls);
      if (isDoctor) {
        const referrals = await fetchReferralOptions();
        setReferralDirections(referrals);
      } else {
        setReferralDirections([]);
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Не удалось загрузить шаблоны документов',
      );
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [isDoctor]);

  useEffect(() => {
    void load();
  }, [load]);

  useRefreshOnFocus(() => load({ silent: true }));

  useEffect(() => {
    if (!navigationTarget) {
      return;
    }

    pendingPrefillRef.current = navigationTarget.prefillAttributes ?? null;
    setError(null);
    setGeneratedDocument('');
    setActiveCardTab('params');
    setSelectedPatientId(String(navigationTarget.patientId));

    if (navigationTarget.templateCode) {
      const template = templates.find((item) => item.code === navigationTarget.templateCode);
      setSelectedTemplateId(template ? String(template.id) : '');
    }
  }, [navigationSeq, navigationTarget, templates]);

  const patientsLoadError = patientsError?.message ?? null;
  const isLoading = loading || patientsLoading;

  const selectedTemplate = useMemo(
    () =>
      templates.find((t) => String(t.id) === selectedTemplateId) ?? null,
    [templates, selectedTemplateId],
  );

  const selectedPatient = useMemo(
    () =>
      patients.find((p) => String(p.id) === selectedPatientId) ?? null,
    [patients, selectedPatientId],
  );

  useEffect(() => {
    if (!selectedTemplate) {
      setAttributes({});
      setGeneratedDocument('');
      return;
    }

    const defaults: Record<string, string> = {};
    selectedTemplate.attributes.forEach((attr) => {
      if (isTokenUserAttribute(attr)) {
        defaults[attr.key] = displayName ?? '';
      } else if (attr.type === 'date') {
        defaults[attr.key] = localTodayIsoDate();
      } else {
        defaults[attr.key] = '';
      }
    });

    const prefill = pendingPrefillRef.current ?? {};
    const merged = { ...defaults, ...prefill };
    selectedTemplate.attributes.forEach((attr) => {
      if (isTokenUserAttribute(attr)) {
        merged[attr.key] = displayName ?? '';
      }
    });

    setAttributes(merged);
    setSelectedReferralClinicId('');
    setSelectedReferralSpecialistId('');
    setGeneratedDocument('');
  }, [selectedTemplate, displayName, navigationSeq]);

  const activeReferralDirectionId = useMemo(() => {
    const fixedCode = fixedDirectionCode(selectedTemplate);
    if (fixedCode) {
      return referralDirections.find((direction) => direction.code === fixedCode)?.id ?? null;
    }
    const selectedDirectionId = attributes.referral_direction;
    if (!selectedDirectionId) {
      return null;
    }
    return Number(selectedDirectionId);
  }, [attributes.referral_direction, referralDirections, selectedTemplate]);

  const availableReferralClinics = useMemo(() => {
    if (!activeReferralDirectionId) {
      return [] as ReferralClinic[];
    }
    return (
      referralDirections.find((direction) => direction.id === activeReferralDirectionId)
        ?.clinics ?? []
    );
  }, [activeReferralDirectionId, referralDirections]);

  const availableReferralSpecialists = useMemo(() => {
    if (!selectedReferralClinicId) {
      return [] as ReferralSpecialist[];
    }
    return (
      availableReferralClinics.find(
        (clinic) => String(clinic.id) === selectedReferralClinicId,
      )?.specialists ?? []
    );
  }, [availableReferralClinics, selectedReferralClinicId]);

  useEffect(() => {
    if (!selectedTemplate) {
      return;
    }

    setAttributes((prev) => {
      let changed = false;
      const next = { ...prev };

      selectedTemplate.attributes.forEach((attr) => {
        if (!isTokenUserAttribute(attr)) {
          return;
        }
        const value = displayName ?? '';
        if (next[attr.key] !== value) {
          next[attr.key] = value;
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [displayName, selectedTemplate]);

  useEffect(() => {
    setGeneratedDocument('');
  }, [selectedPatientId]);

  useEffect(() => {
    setActiveCardTab('params');
  }, [selectedPatientId, selectedTemplateId]);

  function updateAttribute(key: string, value: string) {
    if (
      selectedTemplate?.attributes.some(
        (attr) => attr.key === key && isTokenUserAttribute(attr),
      )
    ) {
      return;
    }
    setAttributes((prev) => ({ ...prev, [key]: value }));
    setGeneratedDocument('');
  }

  function handleReferralDirectionChange(directionId: string) {
    updateAttribute('referral_direction', directionId);
    updateAttribute('clinic_name', '');
    updateAttribute('specialist', '');
    setSelectedReferralClinicId('');
    setSelectedReferralSpecialistId('');
  }

  function handleReferralClinicChange(clinicId: string) {
    setSelectedReferralClinicId(clinicId);
    const clinic = availableReferralClinics.find((item) => String(item.id) === clinicId);
    updateAttribute('clinic_name', clinic?.name ?? '');
    updateAttribute('specialist', '');
    setSelectedReferralSpecialistId('');
  }

  function handleReferralSpecialistChange(specialistId: string) {
    setSelectedReferralSpecialistId(specialistId);
    const specialist = findSpecialistById(referralDirections, specialistId);
    updateAttribute('specialist', specialist ? formatSpecialistLabel(specialist) : '');
  }

  function renderAttributeField(attr: DocumentTemplateAttribute) {
    if (isReferralDirectionAttribute(attr)) {
      if (fixedDirectionCode(selectedTemplate)) {
        return null;
      }
      return (
        <div key={attr.key} className="field form-span-3">
          <span className="field__label">{attr.label}</span>
          <select
            value={attributes.referral_direction ?? ''}
            onChange={(e) => handleReferralDirectionChange(e.target.value)}
            required={Boolean(attr.required)}
          >
            <option value="">— выберите направление —</option>
            {referralDirections.map((direction) => (
              <option key={direction.id} value={direction.id}>
                {direction.name}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (isReferralClinicAttribute(attr)) {
      return (
        <div key={attr.key} className="field form-span-3">
          <span className="field__label">{attr.label}</span>
          <select
            value={selectedReferralClinicId}
            onChange={(e) => handleReferralClinicChange(e.target.value)}
            required={Boolean(attr.required)}
            disabled={!activeReferralDirectionId}
          >
            <option value="">— выберите клинику —</option>
            {availableReferralClinics.map((clinic) => (
              <option key={clinic.id} value={clinic.id}>
                {clinic.name}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (isReferralSpecialistAttribute(attr)) {
      return (
        <div key={attr.key} className="field form-span-3">
          <span className="field__label">{attr.label}</span>
          <select
            value={selectedReferralSpecialistId}
            onChange={(e) => handleReferralSpecialistChange(e.target.value)}
            required={Boolean(attr.required)}
            disabled={!selectedReferralClinicId}
          >
            <option value="">— выберите специалиста —</option>
            {availableReferralSpecialists.map((specialist) => (
              <option key={specialist.id} value={specialist.id}>
                {formatSpecialistLabel(specialist)}
              </option>
            ))}
          </select>
        </div>
      );
    }

    const isReadOnly = isTokenUserAttribute(attr);
    const value = isReadOnly
      ? displayName ?? attributes[attr.key] ?? ''
      : attributes[attr.key] ?? '';

    return (
      <div
        key={attr.key}
        className={`field${attr.type === 'textarea' ? ' form-span-3' : ''}`}
      >
        <span className="field__label">{attr.label}</span>
        {attr.type === 'textarea' ? (
          <textarea
            rows={3}
            value={value}
            onChange={(e) => updateAttribute(attr.key, e.target.value)}
            required={Boolean(attr.required)}
            readOnly={isReadOnly}
            aria-readonly={isReadOnly}
            className={isReadOnly ? 'field__input--readonly' : undefined}
          />
        ) : (
          <input
            type={getInputType(attr)}
            min={attr.type === 'number' ? 0 : undefined}
            value={value}
            onChange={(e) => updateAttribute(attr.key, e.target.value)}
            required={Boolean(attr.required)}
            readOnly={isReadOnly}
            aria-readonly={isReadOnly}
            className={isReadOnly ? 'field__input--readonly' : undefined}
          />
        )}
      </div>
    );
  }

  function resolveAttributes(): Record<string, string> {
    if (!selectedTemplate) {
      return attributes;
    }
    return applyTokenUserAttributes(
      selectedTemplate.attributes,
      attributes,
      displayName,
    );
  }

  function buildContext(): Record<string, string> {
    const base = buildPatientContext(selectedPatient);
    const merged = { ...base, ...resolveAttributes() };

    const qty = Number(resolveAttributes().quantity ?? '');
    const price = Number(resolveAttributes().unit_price ?? '');
    if (!Number.isNaN(qty) && !Number.isNaN(price) && qty >= 0 && price >= 0) {
      merged.total_amount = String(qty * price);
    }

    return merged;
  }

  function handleGenerate(e: FormEvent) {
    e.preventDefault();
    if (!selectedTemplate) {
      setError('Выберите шаблон документа');
      return;
    }

    const validationError = validateDocumentAttributes(
      selectedTemplate.attributes,
      resolveAttributes(),
      displayName,
    );
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    const context = buildContext();
    const rendered = renderDocumentTemplate(selectedTemplate.template, context);
    setGeneratedDocument(rendered);
    setActiveCardTab('preview');
  }

  function handlePrint() {
    if (!generatedDocument || !selectedTemplate) {
      return;
    }
    setError(null);

    const html = toPrintableHtml(generatedDocument, selectedTemplate.name);
    const iframe = document.createElement('iframe');
    iframe.setAttribute('title', 'Печать документа');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText =
      'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;pointer-events:none';

    document.body.appendChild(iframe);

    const win = iframe.contentWindow;
    const doc = iframe.contentDocument;
    if (!win || !doc) {
      iframe.remove();
      setError('Не удалось подготовить окно печати');
      return;
    }

    const cleanup = () => {
      iframe.remove();
    };

    doc.open();
    doc.write(html);
    doc.close();

    const runPrint = () => {
      try {
        win.focus();
        win.addEventListener('afterprint', cleanup, { once: true });
        win.print();
      } catch {
        cleanup();
        setError('Не удалось открыть диалог печати');
        return;
      }
      window.setTimeout(() => {
        if (iframe.isConnected) {
          cleanup();
        }
      }, 90_000);
    };

    window.setTimeout(runPrint, 150);
  }

  const sidebar = (
    <>
      <div className="field">
        <span className="field__label">Шаблон документа</span>
        <select
          value={selectedTemplateId}
          onChange={(e) => setSelectedTemplateId(e.target.value)}
          disabled={isLoading}
        >
          <option value="">— выберите шаблон —</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </div>

      {selectedTemplate && (
        <p className="card-sidebar__meta">
          Тип: {selectedTemplate.document_type}
          {selectedTemplate.target ? ` · ${selectedTemplate.target}` : ''}
        </p>
      )}

      <div className="field">
        <span className="field__label">Пациент</span>
        <PatientAutocomplete
          patients={patients}
          value={selectedPatientId}
          onChange={setSelectedPatientId}
          placeholder="ФИО для автоподстановки"
          disabled={isLoading}
        />
      </div>
    </>
  );

  const footer =
    activeCardTab === 'params' ? (
      <button
        type="submit"
        form="documents-form"
        className="btn-primary"
        disabled={!selectedTemplate || isLoading}
      >
        Сформировать документ
      </button>
    ) : (
      <button
        type="button"
        className="btn-primary"
        disabled={!generatedDocument}
        onClick={handlePrint}
      >
        Печать
      </button>
    );

  const alerts = (
    <>
      {error && <p className="message message--error">{error}</p>}
      {patientsLoadError && <p className="message message--error">{patientsLoadError}</p>}
    </>
  );

  const loadingHint = <p className="panel-hint panel-hint--inline">Загрузка…</p>;

  const panels = {
    params: isLoading ? (
      loadingHint
    ) : (
      <form id="documents-form" onSubmit={handleGenerate}>
        <section className="form-section">
          <h3 className="form-section__title">Параметры документа</h3>
          {selectedTemplate ? (
            <div className="form-section__grid">
              {selectedTemplate.attributes.map((attr) => renderAttributeField(attr))}
            </div>
          ) : (
            <p className="panel-hint panel-hint--inline">
              Выберите шаблон документа в боковой панели.
            </p>
          )}
        </section>
      </form>
    ),
    preview: isLoading ? (
      loadingHint
    ) : (
      <section className="form-section">
        <h3 className="form-section__title">Предпросмотр</h3>
        <div className="document-preview">
          {generatedDocument ? (
            <pre>{generatedDocument}</pre>
          ) : (
            <p className="panel-hint panel-hint--inline">
              Сформируйте документ на вкладке «Параметры».
            </p>
          )}
        </div>
      </section>
    ),
  };

  return (
    <CardLayout
      title="Документ"
      sidebar={sidebar}
      tabs={CARD_TABS}
      activeTab={activeCardTab}
      onTabChange={setActiveCardTab}
      footer={footer}
      alerts={alerts}
      panels={panels}
    />
  );
}
