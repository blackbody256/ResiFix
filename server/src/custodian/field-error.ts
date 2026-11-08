// A field that is well-formed but not acceptable: an id from another property, a time in the past.
// Answered as 400 VALIDATION_FAILED with the same `details` as a schema validation error, so the
// client shows every field error the same way: { formErrors: [], fieldErrors: { field: [message] } }.
import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/app-exception';

export function fieldError(field: string, message: string, summary = message): AppException {
  return new AppException(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', summary, {
    formErrors: [],
    fieldErrors: { [field]: [message] },
  });
}
