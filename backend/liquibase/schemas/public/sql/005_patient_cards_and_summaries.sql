ALTER TABLE public.patients
    ADD COLUMN IF NOT EXISTS attendance_probability smallint,
    ADD COLUMN IF NOT EXISTS visit_summary text;

ALTER TABLE public.patients
    DROP CONSTRAINT IF EXISTS patients_attendance_probability_check;

ALTER TABLE public.patients
    ADD CONSTRAINT patients_attendance_probability_check CHECK (
        attendance_probability IS NULL
        OR (attendance_probability >= 0 AND attendance_probability <= 100)
    );

CREATE TABLE public.patient_summaries (
    id integer NOT NULL,
    patient_id integer NOT NULL,
    summary text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.patient_summaries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.patient_summaries_id_seq OWNED BY public.patient_summaries.id;
ALTER TABLE ONLY public.patient_summaries ALTER COLUMN id SET DEFAULT nextval('public.patient_summaries_id_seq'::regclass);

ALTER TABLE ONLY public.patient_summaries
    ADD CONSTRAINT patient_summaries_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.patient_summaries
    ADD CONSTRAINT patient_summaries_patient_id_fkey
    FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;

CREATE INDEX patient_summaries_patient_id_idx ON public.patient_summaries USING btree (patient_id);
