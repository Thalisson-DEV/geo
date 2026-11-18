export interface GeoSelectOption<T> {
  label: string;
  value: T;
  disabled?: boolean;
}

export type GeoDateValue = Date | null;
export type GeoBooleanControlKind = 'checkbox' | 'toggle';
export type GeoOverlayAppendTarget = 'body' | 'self';
