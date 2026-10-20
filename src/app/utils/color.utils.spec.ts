import {
  ensureHex,
  hexToRgbComponents,
  normalizeColor,
  normalizeHexInput,
  parseColorComponents,
  parseRgbText,
  rgbToHex,
  toRgbString,
} from './color.utils';

describe('color utils', () => {
  it('normalizes hex and rgb colours', () => {
    expect(normalizeColor('#ABC')).toBe('#aabbcc');
    expect(normalizeColor('#AABBCC')).toBe('#aabbcc');
    expect(normalizeColor('rgb(255, 0, 300)')).toBe('#ff00ff');
    expect(normalizeColor('rgba(1, 2, 3, 0.5)')).toBe('#010203');
    expect(normalizeColor('tomato')).toBe('tomato');
  });

  it('parses user hex input', () => {
    expect(normalizeHexInput(' f0c ')).toBe('#ff00cc');
    expect(normalizeHexInput('#12345')).toBeNull();
    expect(normalizeHexInput('zzz')).toBeNull();
  });

  it('parses rgb text with or without the rgb() wrapper and clamps channels', () => {
    expect(parseRgbText('rgb(10, 20, 30)')).toEqual({ r: 10, g: 20, b: 30 });
    expect(parseRgbText('10,20,999')).toEqual({ r: 10, g: 20, b: 255 });
    expect(parseRgbText('nope')).toBeNull();
    expect(parseRgbText('')).toBeNull();
  });

  it('converts between representations', () => {
    expect(rgbToHex({ r: 255, g: 0, b: 128 })).toBe('#ff0080');
    expect(parseColorComponents('#00ff80')).toEqual({ r: 0, g: 255, b: 128 });
    expect(parseColorComponents('rgb(1,2,3)')).toEqual({ r: 1, g: 2, b: 3 });
    expect(toRgbString('#0a0b0c')).toBe('rgb(10, 11, 12)');
    expect(toRgbString('nope')).toBe('');
    expect(ensureHex('rgb(0,0,0)')).toBe('#000000');
    expect(ensureHex('tomato')).toBeNull();
    expect(hexToRgbComponents('#102030')).toEqual({ r: 16, g: 32, b: 48 });
    expect(hexToRgbComponents('red')).toBeNull();
  });
});
