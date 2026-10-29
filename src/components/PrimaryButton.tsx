import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius } from '../constants/theme';

type Props = {
  label: string;
  onPress: () => void;
  color?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'solid' | 'outline';
};

export function PrimaryButton({
  label,
  onPress,
  color = colors.primary,
  icon,
  loading,
  disabled,
  variant = 'solid',
}: Props) {
  const solid = variant === 'solid';
  const fg = solid ? '#fff' : color;
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        solid ? { backgroundColor: color } : { borderColor: color, borderWidth: 1.5 },
        disabled && !loading && styles.disabled,
        pressed && { opacity: 0.85 },
      ]}
    >
      {loading && <ActivityIndicator color={fg} />}
      <Text style={[styles.label, { color: fg }]}>{label}</Text>
      {icon && !loading && <Ionicons name={icon} size={18} color={fg} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 54,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  label: { fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.45 },
});