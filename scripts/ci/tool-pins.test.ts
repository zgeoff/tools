import { expect, test } from 'bun:test';
import { toolPins } from './tool-pins.ts';

test.each(Object.entries(toolPins))(
  'it pins %s to one release URL and the sha256 of its download',
  (_name, pin) => {
    expect(pin.url).toStartWith('https://github.com/');
    expect(pin.sha256).toMatch(/^[0-9a-f]{64}$/u);
  },
);
