-- Поле «лечащий врач» заполняется из JWT на клиенте, редактирование отключено.

UPDATE public.document_templates
SET attributes = (
    SELECT jsonb_agg(
        CASE
            WHEN elem->>'key' = 'doctor_name'
            THEN elem || '{"readonly": true, "source": "token"}'::jsonb
            ELSE elem
        END
        ORDER BY ordinality
    )
    FROM jsonb_array_elements(attributes) WITH ORDINALITY AS t(elem, ordinality)
)
WHERE EXISTS (
    SELECT 1
    FROM jsonb_array_elements(attributes) AS elem
    WHERE elem->>'key' = 'doctor_name'
);
