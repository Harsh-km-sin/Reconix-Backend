export interface AuthUser {
  userId: string;
  email: string;
  roleId?: string;
  roleName?: string;
  companyId?: string;
  permissions: string[];
}

declare global {
  namespace Express {
    export interface Request {
      user?: AuthUser;
    }
  }
}
