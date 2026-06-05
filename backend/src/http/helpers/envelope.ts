export interface SuccessEnvelope<T> {
  data: T;
}

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
  };
}

export function success<T>(data: T): SuccessEnvelope<T> {
  return { data };
}

export function failure(code: string, message: string): ErrorEnvelope {
  return { error: { code, message } };
}
