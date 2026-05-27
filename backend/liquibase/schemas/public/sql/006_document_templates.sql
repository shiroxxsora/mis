CREATE TABLE IF NOT EXISTS public.document_templates (
    id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    document_type text NOT NULL,
    target text,
    attributes jsonb NOT NULL DEFAULT '[]'::jsonb,
    template text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.document_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.document_templates_id_seq OWNED BY public.document_templates.id;
ALTER TABLE ONLY public.document_templates ALTER COLUMN id SET DEFAULT nextval('public.document_templates_id_seq'::regclass);

ALTER TABLE ONLY public.document_templates
    ADD CONSTRAINT document_templates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.document_templates
    ADD CONSTRAINT document_templates_code_key UNIQUE (code);

ALTER TABLE ONLY public.document_templates
    ADD CONSTRAINT document_templates_document_type_check CHECK (
        document_type = ANY (ARRAY['referral'::text, 'receipt'::text, 'certificate'::text, 'other'::text])
    );

INSERT INTO public.document_templates (code, name, document_type, target, attributes, template, is_active)
VALUES
    (
        'referral_xray',
        'Направление на рентген',
        'referral',
        'Рентген-кабинет',
        '[
          {"key":"clinic_name","label":"Клиника/кабинет","type":"text","required":true},
          {"key":"reason","label":"Показания","type":"textarea","required":true},
          {"key":"doctor_name","label":"Врач","type":"text","required":true},
          {"key":"appointment_date","label":"Дата направления","type":"date","required":true}
        ]'::jsonb,
        'НАПРАВЛЕНИЕ НА РЕНТГЕН

Пациент: {{patient_full_name}}
Дата рождения: {{patient_birth_date}}
Телефон: {{patient_phone}}

Направляется в: {{clinic_name}}
Цель исследования: {{reason}}
Дата направления: {{appointment_date}}

Врач: {{doctor_name}}

Подпись: ____________________',
        true
    ),
    (
        'referral_specialist',
        'Направление к профильному специалисту',
        'referral',
        'Стоматологическая клиника',
        '[
          {"key":"clinic_name","label":"Клиника","type":"text","required":true},
          {"key":"specialist","label":"Специалист","type":"text","required":true},
          {"key":"reason","label":"Причина направления","type":"textarea","required":true},
          {"key":"doctor_name","label":"Лечащий врач","type":"text","required":true},
          {"key":"appointment_date","label":"Дата направления","type":"date","required":true}
        ]'::jsonb,
        'НАПРАВЛЕНИЕ К СПЕЦИАЛИСТУ

Пациент: {{patient_full_name}}
Дата рождения: {{patient_birth_date}}
Телефон: {{patient_phone}}

Направляется в: {{clinic_name}}
К специалисту: {{specialist}}
Основание: {{reason}}
Дата направления: {{appointment_date}}

Лечащий врач: {{doctor_name}}

Подпись: ____________________',
        true
    ),
    (
        'receipt_services',
        'Чек на оплату услуг',
        'receipt',
        'Касса клиники',
        '[
          {"key":"service_name","label":"Услуга","type":"text","required":true},
          {"key":"quantity","label":"Количество","type":"number","required":true},
          {"key":"unit_price","label":"Цена за единицу","type":"number","required":true},
          {"key":"payment_method","label":"Способ оплаты","type":"text","required":true},
          {"key":"cashier_name","label":"Кассир","type":"text","required":true},
          {"key":"payment_date","label":"Дата оплаты","type":"date","required":true}
        ]'::jsonb,
        'ЧЕК ОБ ОПЛАТЕ УСЛУГ

Пациент: {{patient_full_name}}
Телефон: {{patient_phone}}

Услуга: {{service_name}}
Количество: {{quantity}}
Цена: {{unit_price}}
Сумма: {{total_amount}}
Способ оплаты: {{payment_method}}
Дата оплаты: {{payment_date}}

Кассир: {{cashier_name}}

Подпись: ____________________',
        true
    )
ON CONFLICT (code) DO NOTHING;
