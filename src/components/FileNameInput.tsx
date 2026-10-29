import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius } from '../constants/theme';

type Props = {
  value: string;
  onChangeText: (value: string) => void;
  extension: string; // "mp3", "mp4"...
  defaultValue?: string; // shows a Reset button when the name differs
  editable?: boolean;
  accent?: string;
};

export function FileNameInput({
  value,
  onChangeText,
  extension,
  defaultValue,
  editable = true,
  accent = colors.primary,
}: Props) {
  const canReset = !!defaultValue && value !== defaultValue && editable;

  return (
    <View>
      <View style={styles.labelRow}>
        <Text style={styles.label}>File name</Text>
        {canReset && (
          <Pressable onPress={() => onChangeText(defaultValue!)} hitSlop={8}>
            <Text style={[styles.reset, { color: accent }]}>Reset</Text>
          </Pressable>
        )}
      </View>

      <View style={[styles.inputRow, !editable && { opacity: 0.6 }]}>
        <Ionicons name="create-outline" size={18} color={colors.muted} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder="Enter a file name"
          placeholderTextColor={colors.muted}
          style={styles.input}
          editable={editable}
          maxLength={80}
          autoCorrect={false}
          returnKeyType="done"
          selectTextOnFocus
        />
        {value.length > 0 && editable && (
          <Pressable onPress={() => onChangeText('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.muted} />
          </Pressable>
        )}
        <View style={[styles.extBadge, { backgroundColor: accent + '1A' }]}>
          <Text style={[styles.extText, { color: accent }]}>.{extension}</Text>
        </View>
      </View>

      <Text style={styles.hint}>Characters like / : * ? " &lt; &gt; | are removed automatically</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  reset: { fontSize: 13, fontWeight: '700' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 52,
    paddingLeft: 14,
    paddingRight: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: { flex: 1, fontSize: 15, color: colors.text },
  extBadge: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.sm },
  extText: { fontSize: 13, fontWeight: '700' },
  hint: { fontSize: 12, color: colors.muted, marginTop: 6 },
});