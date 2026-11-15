import { z } from 'zod';

const failureSchema = z.object({
  error: z.string(),
  fields: z.record(z.string(), z.string()).optional(),
});

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status = 0,
    public readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function requestJson<Schema extends z.ZodType>(
  url: string,
  schema: Schema,
  options: RequestInit = {},
): Promise<z.output<Schema>> {
  let response: Response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError('Could not connect. Check your connection and try again.');
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = failureSchema.safeParse(body);
    throw new ApiError(
      failure.success
        ? failure.data.error
        : 'Your request could not be completed. Please try again.',
      response.status,
      failure.success ? failure.data.fields : undefined,
    );
  }
  const result = schema.safeParse(body);
  if (!result.success)
    throw new ApiError('The response could not be read. Please try again.', response.status);
  return result.data;
}
