export type UserTokenClaims = {
  name?: string;
  given_name?: string;
  family_name?: string;
  middle_name?: string;
  preferred_username?: string;
};

/** ФИО врача из JWT: фамилия, имя, отчество; затем claim name; затем логин. */
export function getUserDisplayName(
  claims: UserTokenClaims | null | undefined,
): string | null {
  if (!claims) {
    return null;
  }

  const familyName = claims.family_name?.trim();
  const givenName = claims.given_name?.trim();
  const middleName = claims.middle_name?.trim();
  if (familyName || givenName || middleName) {
    return [familyName, givenName, middleName].filter(Boolean).join(' ');
  }

  const name = claims.name?.trim();
  if (name) {
    return name;
  }

  const username = claims.preferred_username?.trim();
  return username || null;
}
