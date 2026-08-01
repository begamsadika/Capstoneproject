export type AuthFieldErrors<T extends string> = Partial<Record<T, string>>;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const namePattern = /^[\p{L}\s'.-]+$/u;
const organizationPattern = /^[\p{L}\p{N}\s'&,. -]+$/u;
const phonePattern = /^\+?[0-9\s()/-]{7,24}$/;
const punctuationEdges = /^[.'-]|[.'-]$/;

export const normalizeSpaces = (value: string) => value.trim().replace(/\s+/g, " ");
export const normalizeEmail = (value: string) => value.trim().toLowerCase();

export const validateFullName = (value: string) => {
  const normalized = normalizeSpaces(value);
  if (!normalized) return "Full name is required.";
  if (normalized.length < 2) return "Full name must contain at least 2 characters.";
  if (normalized.length > 100) return "Full name must not exceed 100 characters.";
  if (!namePattern.test(normalized) || punctuationEdges.test(normalized) || !/[\p{L}]/u.test(normalized)) {
    return "Enter a valid full name.";
  }
  return "";
};

export const validateEmail = (value: string) => {
  const normalized = normalizeEmail(value);
  if (!normalized) return "Email address is required.";
  if (normalized.length > 254 || /\s/.test(normalized) || !emailPattern.test(normalized)) {
    return "Enter a valid email address.";
  }
  return "";
};

export const validateLoginPassword = (value: string) => {
  if (!value) return "Password is required.";
  if (value.length > 64) return "Enter a valid password.";
  return "";
};

export const validatePassword = (value: string, email = "") => {
  void email;
  if (!value) return "Password is required.";
  if (value.length < 8) return "Password must contain at least 8 characters.";
  if (value.length > 64) return "Password must not exceed 64 characters.";
  if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*[^A-Za-z0-9])/.test(value)) {
    return "Password must include an uppercase letter, a lowercase letter, and a special character.";
  }
  return "";
};

export const validateConfirmPassword = (value: string, password: string) => {
  if (!value) return "Confirm password is required.";
  if (value !== password) return "Passwords do not match.";
  return "";
};

export const validatePhone = (value: string, required = true) => {
  const normalized = normalizeSpaces(value);
  if (!normalized) return required ? "Phone number is required." : "";
  const digits = normalized.replace(/\D/g, "");
  if (!phonePattern.test(normalized) || digits.length < 7 || digits.length > 15) {
    return "Enter a valid phone number.";
  }
  return "";
};

export const validateOrganizationName = (value: string) => {
  const normalized = normalizeSpaces(value);
  if (!normalized) return "Business or organisation name is required.";
  if (normalized.length > 150) return "Business or organisation name must not exceed 150 characters.";
  if (normalized.length < 2 || !organizationPattern.test(normalized) || !/[\p{L}\p{N}]/u.test(normalized)) {
    return "Enter a valid business or organisation name.";
  }
  return "";
};

export const validateRequired = (value: string, message: string) => (value.trim() ? "" : message);
