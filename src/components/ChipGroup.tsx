import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../constants/theme';

type IconName = keyof typeof Ionicons.glyphMap;

export type ChipOption<T extends string> = { key: T; label: string; icon?: IconName };

type Props<T extends string> = {
  label: string;
  options: ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  accent?: string;
  last?: boolean; // hides the divider under the last group in a card
};

export function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
  accent = colors.primary,
  last,
}: Props<T>) {
  return (
    <View style={[styles.block, !last && styles.divider]}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        {options.map((o) => {
          const active = value === o.key;
          return (
            <Pressable
              key={o.key}
              onPress={() => onChange(o.key)}
              disabled={disabled}
              style={[styles.chip, active && { backgroundColor: accent, borderColor: accent }]}
            >
              {o.icon && <Ionicons name={o.icon} size={15} color={active ? '#fff' : colors.text} />}
              <Text style={[styles.chipText, active && { color: '#fff' }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { paddingVertical: 14 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  label: { fontSize: 14.5, fontWeight: '600', color: colors.text, marginBottom: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  chipText: { fontSize: 13.5, fontWeight: '600', color: colors.text },
});
