import { FieldType, PageField } from './annotation.model';

export type FieldPresetDefaults = Partial<Omit<PageField, 'x' | 'y' | 'type'>>;

export interface FieldPreset {
  id: string;
  type: FieldType;
  labelKey: string;
  descriptionKey?: string;
  defaults: FieldPresetDefaults;
  helperTextKey?: string;
  isDefault?: boolean;
}

const FIELD_PRESETS: readonly FieldPreset[] = [
  {
    id: 'text-basic',
    type: 'text',
    labelKey: 'annotation.presets.text.basic.label',
    descriptionKey: 'annotation.presets.text.basic.description',
    defaults: {
      mask: null,
    },
    isDefault: true,
  },
  {
    id: 'text-email',
    type: 'text',
    labelKey: 'annotation.presets.text.email.label',
    descriptionKey: 'annotation.presets.text.email.description',
    defaults: {
      mask: '[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}$',
    },
    helperTextKey: 'annotation.presets.text.email.helper',
  },
  {
    id: 'text-phone',
    type: 'text',
    labelKey: 'annotation.presets.text.phone.label',
    descriptionKey: 'annotation.presets.text.phone.description',
    defaults: {
      mask: '+## ### ### ###',
    },
    helperTextKey: 'annotation.presets.text.phone.helper',
  },
  {
    id: 'check-basic',
    type: 'check',
    labelKey: 'annotation.presets.check.basic.label',
    descriptionKey: 'annotation.presets.check.basic.description',
    defaults: {
      value: '☑',
    },
    helperTextKey: 'annotation.presets.check.basic.helper',
    isDefault: true,
  },
  {
    id: 'check-empty',
    type: 'check',
    labelKey: 'annotation.presets.check.empty.label',
    descriptionKey: 'annotation.presets.check.empty.description',
    defaults: {
      value: '☐',
    },
    helperTextKey: 'annotation.presets.check.empty.helper',
  },
  {
    id: 'radio-basic',
    type: 'radio',
    labelKey: 'annotation.presets.radio.basic.label',
    descriptionKey: 'annotation.presets.radio.basic.description',
    defaults: {
      value: '◉',
    },
    helperTextKey: 'annotation.presets.radio.basic.helper',
    isDefault: true,
  },
  {
    id: 'radio-empty',
    type: 'radio',
    labelKey: 'annotation.presets.radio.empty.label',
    descriptionKey: 'annotation.presets.radio.empty.description',
    defaults: {
      value: '◯',
    },
    helperTextKey: 'annotation.presets.radio.empty.helper',
  },
  {
    id: 'number-integer',
    type: 'number',
    labelKey: 'annotation.presets.number.integer.label',
    descriptionKey: 'annotation.presets.number.integer.description',
    defaults: {
      decimals: 0,
      mask: '#####',
    },
    helperTextKey: 'annotation.presets.number.integer.helper',
    isDefault: true,
  },
  {
    id: 'number-currency',
    type: 'number',
    labelKey: 'annotation.presets.number.currency.label',
    descriptionKey: 'annotation.presets.number.currency.description',
    defaults: {
      decimals: 2,
      appender: '€',
      mask: '###,###.##',
    },
    helperTextKey: 'annotation.presets.number.currency.helper',
  },
];

const PRESETS_BY_TYPE: Record<FieldType, readonly FieldPreset[]> = {
  text: FIELD_PRESETS.filter((preset) => preset.type === 'text'),
  check: FIELD_PRESETS.filter((preset) => preset.type === 'check'),
  radio: FIELD_PRESETS.filter((preset) => preset.type === 'radio'),
  number: FIELD_PRESETS.filter((preset) => preset.type === 'number'),
};

export function getFieldPresets(type: FieldType): readonly FieldPreset[] {
  return PRESETS_BY_TYPE[type] ?? [];
}

export function findFieldPreset(type: FieldType, presetId: string | null | undefined): FieldPreset | null {
  if (!presetId) {
    return null;
  }
  const presets = getFieldPresets(type);
  return presets.find((preset) => preset.id === presetId) ?? null;
}

export function getDefaultFieldPreset(type: FieldType): FieldPreset | null {
  const presets = getFieldPresets(type);
  return presets.find((preset) => preset.isDefault) ?? presets[0] ?? null;
}

export function hasPresetsForType(type: FieldType): boolean {
  return getFieldPresets(type).length > 0;
}
