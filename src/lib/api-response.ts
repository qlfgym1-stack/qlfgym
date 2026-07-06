import { NextResponse } from 'next/server';
import type { ApiSuccess, ApiError } from '@/types/api';

export function apiSuccess<T>(data: T, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ success: true, data }, { status });
}

export function apiError(error: string | { code: string; message: string }, status = 400): NextResponse<ApiError> {
  const err = typeof error === 'string'
    ? { code: 'ERROR', message: error }
    : error;
  return NextResponse.json({ success: false, error: err }, { status });
}
