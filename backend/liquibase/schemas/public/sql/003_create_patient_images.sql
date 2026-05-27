CREATE TABLE public.patient_images (
    id integer NOT NULL,
    patient_id integer NOT NULL,
    type text NOT NULL,
    file_path text NOT NULL,
    taken_at timestamp with time zone,
    tooth_number text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.patient_images_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.patient_images_id_seq OWNED BY public.patient_images.id;
ALTER TABLE ONLY public.patient_images ALTER COLUMN id SET DEFAULT nextval('public.patient_images_id_seq'::regclass);

ALTER TABLE ONLY public.patient_images
    ADD CONSTRAINT patient_images_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.patient_images
    ADD CONSTRAINT patient_images_patient_id_fkey
    FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;

CREATE INDEX patient_images_patient_id_idx ON public.patient_images USING btree (patient_id);
CREATE INDEX patient_images_taken_at_idx ON public.patient_images USING btree (taken_at);

