import { graphqlRequest } from './graphql';

export type ReferralSpecialist = {
  id: number;
  direction_id: number;
  clinic_id: number | null;
  last_name: string;
  first_name: string;
  middle_name: string | null;
  position_title: string | null;
};

export type ReferralClinic = {
  id: number;
  direction_id: number;
  name: string;
  address: string | null;
  phone: string | null;
  specialists: ReferralSpecialist[];
};

export type ReferralDirection = {
  id: number;
  code: string;
  name: string;
  clinics: ReferralClinic[];
};

const REFERRAL_OPTIONS_QUERY = `
  query ReferralOptions {
    referral_directions(
      where: { is_active: { _eq: true } }
      order_by: { name: asc }
    ) {
      id
      code
      name
      clinics(
        where: { is_active: { _eq: true } }
        order_by: { name: asc }
      ) {
        id
        direction_id
        name
        address
        phone
        specialists(
          where: { is_active: { _eq: true } }
          order_by: [{ last_name: asc }, { first_name: asc }]
        ) {
          id
          direction_id
          clinic_id
          last_name
          first_name
          middle_name
          position_title
        }
      }
    }
  }
`;

export async function fetchReferralOptions(): Promise<ReferralDirection[]> {
  const data = await graphqlRequest<{ referral_directions: ReferralDirection[] }>(
    REFERRAL_OPTIONS_QUERY,
  );
  return data.referral_directions;
}

export function formatSpecialistName(
  specialist: Pick<ReferralSpecialist, 'last_name' | 'first_name' | 'middle_name'>,
): string {
  return [specialist.last_name, specialist.first_name, specialist.middle_name]
    .filter(Boolean)
    .join(' ');
}

export function formatSpecialistLabel(specialist: ReferralSpecialist): string {
  const name = formatSpecialistName(specialist);
  if (specialist.position_title) {
    return `${name} (${specialist.position_title})`;
  }
  return name;
}
