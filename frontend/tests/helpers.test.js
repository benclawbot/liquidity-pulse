import { describe, expect, it } from 'vitest';
import { formatCompactNumber, formatSignedPercent, routeFromHash, toneClass } from '../js/helpers.js';

describe('helpers', () => {
  it('formats compact numbers', () => {
    expect(formatCompactNumber(45200000000)).toBe('45.2B');
    expect(formatCompactNumber(8100000000)).toBe('8.1B');
    expect(formatCompactNumber(950)).toBe('950');
  });

  it('formats signed percents', () => {
    expect(formatSignedPercent(1.82)).toBe('+1.82%');
    expect(formatSignedPercent(-4.2)).toBe('-4.20%');
  });

  it('maps tones to css classes', () => {
    expect(toneClass('positive')).toBe('green');
    expect(toneClass('negative')).toBe('red');
    expect(toneClass('neutral')).toBe('blue');
  });

  it('parses routes from hashes', () => {
    expect(routeFromHash('#/flows')).toBe('flows');
    expect(routeFromHash('#/ideas')).toBe('ideas');
    expect(routeFromHash('#/')).toBe('discovery');
    expect(routeFromHash('')).toBe('discovery');
  });
});
