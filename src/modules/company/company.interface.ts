/** The caller identity used for company-scoped access checks. */
export interface UserContext {
  userId: string;
  permissions: readonly string[];
}
