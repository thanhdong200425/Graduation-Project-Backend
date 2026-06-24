import { ForbiddenException } from '@nestjs/common';

/**
 * Thrown when a user tries to upload a file but has already reached their
 * per-user upload quota (counting only non-FAILED uploads).
 *
 * Carries a stable `code` in the response body so the frontend can tell this
 * apart from any other 403 and show a quota-specific message.
 */
export class UploadQuotaExceededException extends ForbiddenException {
  constructor(limit: number) {
    super({
      code: 'UPLOAD_QUOTA_EXCEEDED',
      limit,
      message: `Upload limit reached. You can have at most ${limit} files. Delete an existing file to upload a new one.`,
    });
  }
}
