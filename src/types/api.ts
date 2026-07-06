export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface Session {
  username: string;
  role: 'admin' | 'reception';
  supabaseUserId: string;
  profileId: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  user: {
    username: string;
    role: string;
  };
  redirect: string;
}
