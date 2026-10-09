// The users upload's columns, named as in the users table. Shared by the
// upload's reader, its template and the Quality page's downloads, which are
// meant to be filled in and uploaded
export const USER_UPLOAD_COLUMNS = {
  sapId: "SAPID",
  fullName: "FullName",
  email: "Email",
} as const;
