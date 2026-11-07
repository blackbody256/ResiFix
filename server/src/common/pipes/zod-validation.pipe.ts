// Usage: @Body(new ZodValidationPipe(schema)) body: z.infer<typeof schema>
// Failures become 400 VALIDATION_FAILED with field errors in `details`.
import { PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    return this.schema.parse(value);
  }
}
