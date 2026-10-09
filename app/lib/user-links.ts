// A person on the Users pages: everyone signing in with one email, or a SAP
// ID that has no email
export type PersonRef = { email: string } | { sapId: number };

// The person's page, optionally remembering the Users list to go back to
export function personPath(ref: PersonRef, back?: string) {
  const params = new URLSearchParams(
    "email" in ref ? { email: ref.email } : { sapId: String(ref.sapId) }
  );
  if (back) {
    params.set("back", back);
  }
  return `/users/edit?${params}`;
}

export function deletePersonPath(ref: PersonRef, back?: string) {
  return personPath(ref, back).replace("/users/edit?", "/users/delete?");
}
