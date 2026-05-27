-- Справочники для направлений (документы, направления к специалистам)

CREATE TABLE public.referral_directions (
    id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.referral_directions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.referral_directions_id_seq OWNED BY public.referral_directions.id;
ALTER TABLE ONLY public.referral_directions ALTER COLUMN id SET DEFAULT nextval('public.referral_directions_id_seq'::regclass);

ALTER TABLE ONLY public.referral_directions
    ADD CONSTRAINT referral_directions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.referral_directions
    ADD CONSTRAINT referral_directions_code_key UNIQUE (code);

CREATE TABLE public.referral_clinics (
    id integer NOT NULL,
    direction_id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    address text,
    phone text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.referral_clinics_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.referral_clinics_id_seq OWNED BY public.referral_clinics.id;
ALTER TABLE ONLY public.referral_clinics ALTER COLUMN id SET DEFAULT nextval('public.referral_clinics_id_seq'::regclass);

ALTER TABLE ONLY public.referral_clinics
    ADD CONSTRAINT referral_clinics_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.referral_clinics
    ADD CONSTRAINT referral_clinics_code_key UNIQUE (code);

ALTER TABLE ONLY public.referral_clinics
    ADD CONSTRAINT referral_clinics_direction_id_fkey
    FOREIGN KEY (direction_id) REFERENCES public.referral_directions(id) ON DELETE RESTRICT;

CREATE INDEX referral_clinics_direction_id_idx ON public.referral_clinics USING btree (direction_id);

CREATE TABLE public.referral_specialists (
    id integer NOT NULL,
    direction_id integer NOT NULL,
    clinic_id integer,
    last_name text NOT NULL,
    first_name text NOT NULL,
    middle_name text,
    position_title text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.referral_specialists_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.referral_specialists_id_seq OWNED BY public.referral_specialists.id;
ALTER TABLE ONLY public.referral_specialists ALTER COLUMN id SET DEFAULT nextval('public.referral_specialists_id_seq'::regclass);

ALTER TABLE ONLY public.referral_specialists
    ADD CONSTRAINT referral_specialists_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.referral_specialists
    ADD CONSTRAINT referral_specialists_direction_id_fkey
    FOREIGN KEY (direction_id) REFERENCES public.referral_directions(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.referral_specialists
    ADD CONSTRAINT referral_specialists_clinic_id_fkey
    FOREIGN KEY (clinic_id) REFERENCES public.referral_clinics(id) ON DELETE SET NULL;

CREATE INDEX referral_specialists_direction_id_idx ON public.referral_specialists USING btree (direction_id);
CREATE INDEX referral_specialists_clinic_id_idx ON public.referral_specialists USING btree (clinic_id);
