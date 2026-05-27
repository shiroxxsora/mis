-- Код клиники уникален в рамках направления, а не глобально.

ALTER TABLE public.referral_clinics
    DROP CONSTRAINT IF EXISTS referral_clinics_code_key;

ALTER TABLE public.referral_clinics
    ADD CONSTRAINT referral_clinics_direction_id_code_key UNIQUE (direction_id, code);
