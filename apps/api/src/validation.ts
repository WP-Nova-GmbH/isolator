import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

/** Closing, ending, reopening or deleting something always says why. */
export const reasonInput = z.object({
  reason: z.string('Say why.').trim().min(1, 'Say why.'),
});

/** Validates a request body. The first problem is shown to the Member as written in the schema. */
export function parseBody<S extends z.ZodType>(schema: S, body: unknown): z.output<S> {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestException(result.error.issues[0].message);
  return result.data;
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}
