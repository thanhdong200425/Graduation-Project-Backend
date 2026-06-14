import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';

/**
 * Triggers the Google OAuth handshake. Runs without a server-side session and
 * forwards the chosen portal role (?role=TEACHER|STUDENT) through the OAuth
 * `state` parameter so the callback knows which role to give new accounts.
 */
@Injectable()
export class GoogleOAuthGuard extends AuthGuard('google') {
  getAuthenticateOptions(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const role =
      typeof request.query.role === 'string' ? request.query.role : undefined;

    return {
      session: false,
      ...(role ? { state: role } : {}),
    };
  }
}
