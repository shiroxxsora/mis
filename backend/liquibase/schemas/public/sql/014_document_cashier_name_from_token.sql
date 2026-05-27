-- Поле «кассир» в чеке заполняется из JWT на клиенте.

UPDATE public.document_templates
SET attributes = (
    SELECT jsonb_agg(
        CASE
            WHEN elem->>'key' = 'cashier_name'
            THEN elem || '{"readonly": true, "source": "token"}'::jsonb
            ELSE elem
        END
        ORDER BY ordinality
    )
    FROM jsonb_array_elements(attributes) WITH ORDINALITY AS t(elem, ordinality)
)
WHERE code = 'receipt_services';
