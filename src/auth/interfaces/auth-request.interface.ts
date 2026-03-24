import { Request } from 'express';
import { SafeUser } from '../../users/users.service';

export interface AuthRequest extends Request {
  user: SafeUser;
}
