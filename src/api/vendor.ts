export type VendorStatus = 'NEW' | 'PENDING' | 'APPROVED';

export interface VendorUser {
  status: VendorStatus;
}

const VENDOR_STATUS_KEY = 'vendor-status';

async function safeFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }
  return response.json();
}

export async function loginVendor(email: string, password: string): Promise<VendorUser> {
  try {
    const result = await safeFetch<{ status: VendorStatus }>('/api/vendor/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const status = result.status ?? 'NEW';
    localStorage.setItem(VENDOR_STATUS_KEY, status);
    return { status };
  } catch {
    const persisted = localStorage.getItem(VENDOR_STATUS_KEY) as VendorStatus | null;
    return { status: persisted ?? 'NEW' };
  }
}

export async function submitVendorOnboarding(data: FormData): Promise<VendorUser> {
  try {
    const result = await safeFetch<{ status: VendorStatus }>('/api/vendor/onboarding', {
      method: 'POST',
      body: data,
    });

    const status = result.status ?? 'PENDING';
    localStorage.setItem(VENDOR_STATUS_KEY, status);

    return { status };

  } catch (error) {
    console.error("Vendor onboarding submission failed:", error);

    const status: VendorStatus = 'PENDING';
    localStorage.setItem(VENDOR_STATUS_KEY, status);

    return { status };
  }
}

export async function getVendorStatus(): Promise<VendorStatus> {
  try {
    const result = await safeFetch<{ status: VendorStatus }>('/api/vendor/status');
    const status = result.status ?? 'NEW';
    localStorage.setItem(VENDOR_STATUS_KEY, status);
    return status;
  } catch {
    return (localStorage.getItem(VENDOR_STATUS_KEY) as VendorStatus) ?? 'NEW';
  }
}
