import { InjectionToken } from '@angular/core';

import { environment } from '../../environments/environment';

function normalizeBaseUrl(value: string): string {
  if (!value) {
    return '';
  }

  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => normalizeBaseUrl(environment.apiBaseUrl),
});
