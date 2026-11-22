import type { BaseTokenName, TokenValue } from '../types.ts';

// The defaults come from the hero images of the atc README.
export const BASE_TOKENS: Readonly<Record<BaseTokenName, TokenValue>> = {
  captionText: { dark: '#e6edf3', light: '#1f2328' },
  captionLit: { dark: '#5fd4b0', light: '#1a7f64' },
  captionAhead: { dark: '#30363d', light: '#d0d7de' },
  terminalFill: '#0f1426',
  terminalStroke: '#ffffff',
  text: '#e3e9f7',
  dimText: '#8f9bbb',
  veil: '#0b1020',
  teal: '#5fd4b0',
  amber: '#ffb454',
  blue: '#82aaff',
  violet: '#c3a6ff',
  green: '#7ee787',
  windowClose: '#ff7b7b',
  windowMinimize: '#ffd36b',
  windowZoom: '#5fd4b0',
};
