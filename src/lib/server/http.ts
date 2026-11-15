import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { validationFields } from '@/lib/validation';
import { ConfigurationError, RequestError } from './errors';

function checkRequest(request: Request, maximumBytes: number) {
  const origin = request.headers.get('origin');
  if (origin) {
    let originUrl: URL;
    try {
      originUrl = new URL(origin);
    } catch {
      throw new RequestError('This request could not be accepted.', 403);
    }
    const host = request.headers.get('host') ?? new URL(request.url).host;
    if (!['http:', 'https:'].includes(originUrl.protocol) || originUrl.host !== host)
      throw new RequestError('This request could not be accepted.', 403);
  }
  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length) || length < 0)
      throw new RequestError('This request could not be read.');
    if (length > maximumBytes) throw new RequestError('This upload is too large.', 413);
  }
}

export async function readRawBody(request: Request, maximumBytes: number) {
  checkRequest(request, maximumBytes);
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > maximumBytes) {
        await reader.cancel();
        throw new RequestError('This upload is too large.', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, receivedBytes);
}

export async function readJson(request: Request, maximumBytes: number): Promise<unknown> {
  const body = await readRawBody(request, maximumBytes);
  try {
    return JSON.parse(body.toString('utf8')) as unknown;
  } catch {
    throw new RequestError('This request could not be read.');
  }
}

export async function readForm(request: Request, maximumBytes: number) {
  const body = await readRawBody(request, maximumBytes);
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data'))
    throw new RequestError('This listing could not be read.');
  try {
    return await new Response(body, { headers: { 'Content-Type': contentType } }).formData();
  } catch {
    throw new RequestError('This listing could not be read.');
  }
}

export function parseInput<Schema extends z.ZodType>(
  schema: Schema,
  input: unknown,
): z.output<Schema> {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new RequestError('Check the highlighted fields.', 400, validationFields(result.error));
  return result.data;
}

export function errorResponse(error: unknown) {
  if (error instanceof RequestError)
    return NextResponse.json(
      { error: error.message, ...(error.fields ? { fields: error.fields } : {}) },
      { status: error.status },
    );
  if (error instanceof ConfigurationError)
    return NextResponse.json(
      { error: 'The marketplace is being connected. Please try again shortly.' },
      { status: 503 },
    );
  console.error(
    'Marketplace request failed:',
    error instanceof Error ? error.message : 'Unknown error',
  );
  return NextResponse.json(
    { error: 'Something went wrong. Your information is still here—please try again.' },
    { status: 500 },
  );
}
