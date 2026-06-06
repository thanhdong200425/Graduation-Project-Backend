import { Request } from 'express';
import { SafeAdmin } from '../admin.service';

export interface AdminAuthRequest extends Request {
  admin: SafeAdmin;
}
