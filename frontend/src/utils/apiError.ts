type ApiErrorPayload = {
  detail?: string | { message?: string; errors?: Record<string, string> };
};

type ApiErrorLike = {
  response?: {
    status?: number;
    data?: ApiErrorPayload;
  };
  message?: string;
  name?: string;
};

export const isApiErrorLike = (error: unknown): error is ApiErrorLike =>
  Boolean(error && typeof error === "object");

export const getApiStatus = (error: unknown) =>
  isApiErrorLike(error) ? error.response?.status : undefined;

export const getApiDetail = (error: unknown, fallback: string) => {
  if (!isApiErrorLike(error)) return fallback;
  const detail = error.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (detail?.message) return detail.message;
  return error.message || fallback;
};

export const getApiFieldErrors = (error: unknown) => {
  if (!isApiErrorLike(error)) return undefined;
  const detail = error.response?.data?.detail;
  return typeof detail === "object" ? detail.errors : undefined;
};

export const getErrorName = (error: unknown) =>
  isApiErrorLike(error) ? error.name : undefined;

export const getErrorMessage = (error: unknown) =>
  isApiErrorLike(error) ? error.message : undefined;
