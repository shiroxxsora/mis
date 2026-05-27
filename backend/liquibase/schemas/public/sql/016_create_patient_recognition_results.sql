CREATE TABLE public.patient_recognition_results (
    id integer NOT NULL,
    patient_id integer NOT NULL,
    patient_image_id integer,
    status text NOT NULL,
    message text NOT NULL,
    job_id text,
    label text,
    confidence double precision,
    prob_healthy double precision,
    shap_image_base64 text,
    lime_image_base64 text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.patient_recognition_results_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.patient_recognition_results_id_seq
    OWNED BY public.patient_recognition_results.id;

ALTER TABLE ONLY public.patient_recognition_results
    ALTER COLUMN id SET DEFAULT nextval('public.patient_recognition_results_id_seq'::regclass);

ALTER TABLE ONLY public.patient_recognition_results
    ADD CONSTRAINT patient_recognition_results_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.patient_recognition_results
    ADD CONSTRAINT patient_recognition_results_patient_id_fkey
    FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.patient_recognition_results
    ADD CONSTRAINT patient_recognition_results_patient_image_id_fkey
    FOREIGN KEY (patient_image_id) REFERENCES public.patient_images(id) ON DELETE SET NULL;

CREATE INDEX patient_recognition_results_patient_id_idx
    ON public.patient_recognition_results USING btree (patient_id);

CREATE INDEX patient_recognition_results_created_at_idx
    ON public.patient_recognition_results USING btree (created_at DESC);
