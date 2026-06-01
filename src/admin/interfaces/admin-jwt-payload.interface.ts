export interface AdminJwtPayload {
  sub: string;
  email: string;
  isAdmin: true;
}
