/**
 * Normalized Google account details produced by GoogleStrategy.validate and
 * consumed by AuthService.loginWithGoogle.
 */
export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  avatarUrl?: string;
}
