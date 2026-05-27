import { graphqlRequest } from './graphql';
import { formatPatientName, type Patient } from './patients';

export type DocumentTemplateAttribute = {
  key: string;
  label: string;
  type?:
    | 'text'
    | 'textarea'
    | 'number'
    | 'date'
    | 'referral_direction'
    | 'referral_clinic'
    | 'referral_specialist';
  required?: boolean;
  readonly?: boolean;
  source?: 'token';
};

export function isTokenUserAttribute(attr: DocumentTemplateAttribute): boolean {
  return (
    attr.source === 'token' ||
    attr.key === 'doctor_name' ||
    attr.key === 'cashier_name'
  );
}

function tokenAttributeValidationMessage(key: string): string {
  if (key === 'cashier_name') {
    return 'Не удалось определить кассира из токена авторизации';
  }
  return 'Не удалось определить врача из токена авторизации';
}

export function isReferralDirectionAttribute(attr: DocumentTemplateAttribute): boolean {
  return attr.type === 'referral_direction' || attr.key === 'referral_direction';
}

export function isReferralClinicAttribute(attr: DocumentTemplateAttribute): boolean {
  return attr.type === 'referral_clinic' || attr.key === 'clinic_name';
}

export function isReferralSpecialistAttribute(attr: DocumentTemplateAttribute): boolean {
  return attr.type === 'referral_specialist' || attr.key === 'specialist';
}

export type DocumentTemplate = {
  id: number;
  code: string;
  name: string;
  document_type: string;
  target: string | null;
  attributes: DocumentTemplateAttribute[];
  template: string;
  is_active: boolean;
  created_at: string;
};

const LIST_DOCUMENT_TEMPLATES = `
  query ListDocumentTemplates {
    document_templates(
      where: { is_active: { _eq: true } }
      order_by: [{ document_type: asc }, { name: asc }]
    ) {
      id
      code
      name
      document_type
      target
      attributes
      template
      is_active
      created_at
    }
  }
`;

export async function fetchDocumentTemplates(): Promise<DocumentTemplate[]> {
  const data = await graphqlRequest<{ document_templates: DocumentTemplate[] }>(
    LIST_DOCUMENT_TEMPLATES,
  );
  return data.document_templates.map((template) => ({
    ...template,
    attributes: normalizeTemplateAttributes(template.attributes),
  }));
}

export type DocumentContext = Record<string, string>;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function normalizeTemplateAttributes(
  attributes: unknown,
): DocumentTemplateAttribute[] {
  if (!Array.isArray(attributes)) {
    return [];
  }

  return attributes
    .filter(
      (item): item is DocumentTemplateAttribute =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as DocumentTemplateAttribute).key === 'string' &&
        typeof (item as DocumentTemplateAttribute).label === 'string',
    )
    .map((item) => ({
      key: item.key,
      label: item.label,
      type: item.type,
      required: item.required,
      readonly: item.readonly,
      source: item.source,
    }));
}

export function buildPatientContext(patient: Patient | null): DocumentContext {
  if (!patient) {
    return {};
  }
  return {
    patient_full_name: formatPatientName(patient),
    patient_birth_date: patient.birth_date ?? '—',
    patient_phone: patient.phone ?? '—',
    today_date: new Date().toLocaleDateString('ru-RU'),
  };
}

export function renderDocumentTemplate(
  template: string,
  context: DocumentContext,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const value = context[key];
    return value && value.trim() ? value : '—';
  });
}

export function applyTokenUserAttributes(
  attributes: DocumentTemplateAttribute[],
  values: Record<string, string>,
  tokenUserName: string | null,
): Record<string, string> {
  const resolved = { ...values };

  for (const attr of attributes) {
    if (isTokenUserAttribute(attr)) {
      resolved[attr.key] = tokenUserName?.trim() ?? '';
    }
  }

  return resolved;
}

export function validateDocumentAttributes(
  attributes: DocumentTemplateAttribute[],
  values: Record<string, string>,
  tokenUserName?: string | null,
): string | null {
  for (const attr of attributes) {
    if (isTokenUserAttribute(attr)) {
      const raw = tokenUserName?.trim() ?? values[attr.key]?.trim() ?? '';
      if (attr.required && !raw) {
        return tokenAttributeValidationMessage(attr.key);
      }
      continue;
    }

    const raw = values[attr.key] ?? '';

    if (attr.required && !raw.trim()) {
      return `Заполните поле: ${attr.label}`;
    }

    if (!raw.trim()) {
      continue;
    }

    if (attr.type === 'number') {
      const num = Number(raw);
      if (Number.isNaN(num) || num < 0) {
        return `Поле «${attr.label}» должно быть числом не меньше 0`;
      }
    }

    if (attr.type === 'date' && Number.isNaN(Date.parse(raw))) {
      return `Поле «${attr.label}» содержит некорректную дату`;
    }
  }

  return null;
}
