-- Типы полей направлений в шаблонах документов + направление для referral_specialist.

UPDATE public.document_templates
SET attributes = (
    SELECT jsonb_agg(
        CASE
            WHEN elem->>'key' = 'clinic_name'
            THEN elem || '{"type": "referral_clinic"}'::jsonb
            WHEN elem->>'key' = 'specialist'
            THEN elem || '{"type": "referral_specialist"}'::jsonb
            ELSE elem
        END
        ORDER BY ordinality
    )
    FROM jsonb_array_elements(attributes) WITH ORDINALITY AS t(elem, ordinality)
)
WHERE code IN ('referral_xray', 'referral_specialist');

UPDATE public.document_templates
SET attributes = jsonb_build_array(
    jsonb_build_object(
        'key', 'referral_direction',
        'label', 'Направление',
        'type', 'referral_direction',
        'required', true
    )
) || attributes
WHERE code = 'referral_specialist'
  AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(attributes) AS elem
      WHERE elem->>'key' = 'referral_direction'
  );
