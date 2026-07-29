/**
 * Shared type for saved delivery addresses.
 */

export interface SavedAddress {
  id: number;
  label: string;
  contactName?: string | null;
  contactPhone?: string | null;
  street?: string | null;
  landmark?: string | null;
  city: string;
  state?: string | null;
  zipCode?: string | null;
  country?: string | null;
  latitude: number | string;
  longitude: number | string;
  isDefault: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Compact display string like: "Home · 42 Baker St, Jaipur".
 * Used in the picker chip and on booking review screens.
 */
export function formatAddressLine(a: Pick<SavedAddress, "label" | "street" | "city">) {
  const first = a.street?.trim() || a.city;
  return a.label ? `${a.label} · ${first}` : first;
}
