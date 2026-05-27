ALTER TABLE public.appointments
    ADD COLUMN IF NOT EXISTS complaints text,
    ADD COLUMN IF NOT EXISTS treatment_done boolean NOT NULL DEFAULT false;

ALTER TABLE public.appointments
    DROP CONSTRAINT IF EXISTS appointments_status_check;

ALTER TABLE public.appointments
    ADD CONSTRAINT appointments_status_check CHECK (
        status = ANY (
            ARRAY[
                'scheduled'::text,
                'arrived'::text,
                'no_show'::text,
                'completed'::text,
                'cancelled'::text
            ]
        )
    );
