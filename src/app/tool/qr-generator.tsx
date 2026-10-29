   import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { useRef, useState } from 'react';
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TextInputProps,
    View
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFeedback } from '../../components/Feedback';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ToolHeader } from '../../components/ToolHeader';
import { colors, radius, shadow } from '../../constants/theme';
import { buildQrValue, qrToPngFile, QrType, WifiSecurity } from '../../services/qr';
import { saveToGallery } from '../../utils/media';

const ACCENT = colors.primary;

type IconName = keyof typeof Ionicons.glyphMap;

const TYPES: { key: QrType; label: string; icon: IconName }[] = [
  { key: 'link', label: 'Link', icon: 'link-outline' },
  { key: 'text', label: 'Text', icon: 'document-text-outline' },
  { key: 'wifi', label: 'Wi-Fi', icon: 'wifi-outline' },
  { key: 'phone', label: 'Phone', icon: 'call-outline' },
];

const SECURITY: { key: WifiSecurity; label: string }[] = [
  { key: 'WPA', label: 'WPA/WPA2' },
  { key: 'WEP', label: 'WEP' },
  { key: 'nopass', label: 'None' },
];

const QR_COLORS = ['#0F172A', '#4F46E5', '#059669', '#DC2626', '#EA580C', '#7C3AED'];

const MAX_TEXT = 1000;

export default function QrGeneratorScreen() {
  const [type, setType] = useState<QrType>('link');
  const [text, setText] = useState('');
  const [link, setLink] = useState('');
  const [phone, setPhone] = useState('');
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [security, setSecurity] = useState<WifiSecurity>('WPA');
  const [hidden, setHidden] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [color, setColor] = useState(QR_COLORS[0]);
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);
       const { showToast, showDialog } = useFeedback();
  const qrRef = useRef<any>(null);

  const value = buildQrValue({
    type,
    text,
    link,
    phone,
    wifi: { ssid, password, security, hidden },
  });

  const exportPng = async () => {
    if (!qrRef.current) throw new Error('QR code is not ready yet.');
    return qrToPngFile(qrRef.current);
  };

   const handleSave = async () => {
     setBusy('save');
     try {
       const uri = await exportPng();
       await saveToGallery(uri);
       showToast({ variant: 'success', message: 'QR code saved to your gallery' });
     } catch (e) {
       showDialog({
         variant: 'error',
         title: "Couldn't save",
         message: e instanceof Error ? e.message : 'Something went wrong. Please try again.',
       });
     } finally {
       setBusy(null);
     }
   };

   const handleShare = async () => {
     setBusy('share');
     try {
       if (!(await Sharing.isAvailableAsync())) {
         throw new Error('Sharing is not available on this device.');
       }
       const uri = await exportPng();
       await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share QR code' });
     } catch (e) {
       showDialog({
         variant: 'error',
         title: "Couldn't share",
         message: e instanceof Error ? e.message : 'Something went wrong. Please try again.',
       });
     } finally {
       setBusy(null);
     }
   };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ToolHeader title="QR Generator" />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Preview */}
        <View style={styles.previewCard}>
          {value ? (
            <View style={styles.qrWrap}>
              <QRCode
                value={value}
                size={210}
                color={color}
                backgroundColor="#FFFFFF"
                quietZone={12}
                ecl="M"
                getRef={(c) => (qrRef.current = c)}
              />
            </View>
          ) : (
            <View style={styles.placeholder}>
              <Ionicons name="qr-code-outline" size={64} color={colors.border} />
              <Text style={styles.placeholderText}>Fill in the details below to create your QR code</Text>
            </View>
          )}
          {value.length > 0 && (
            <Text style={styles.valuePreview} numberOfLines={1}>
              {type === 'wifi' ? `Wi-Fi: ${ssid}` : value}
            </Text>
          )}
        </View>

        {/* Type selector */}
        <Text style={styles.sectionLabel}>QR type</Text>
        <View style={styles.typeRow}>
          {TYPES.map((t) => {
            const active = type === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setType(t.key)}
                style={[styles.typeItem, active && styles.typeItemActive]}
              >
                <Ionicons name={t.icon} size={22} color={active ? '#fff' : colors.text} />
                <Text style={[styles.typeLabel, active && { color: '#fff' }]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Form */}
        <Text style={styles.sectionLabel}>Details</Text>
        <View style={styles.formCard}>
          {type === 'link' && (
            <Field
              label="Website link"
              icon="globe-outline"
              value={link}
              onChangeText={setLink}
              placeholder="example.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          )}

          {type === 'text' && (
            <View>
              <Text style={styles.fieldLabel}>Text</Text>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="Type anything…"
                placeholderTextColor={colors.muted}
                style={styles.textArea}
                multiline
                maxLength={MAX_TEXT}
                textAlignVertical="top"
              />
              <Text style={styles.counter}>
                {text.length}/{MAX_TEXT}
              </Text>
            </View>
          )}

          {type === 'phone' && (
            <Field
              label="Phone number"
              icon="call-outline"
              value={phone}
              onChangeText={setPhone}
              placeholder="+91 98765 43210"
              keyboardType="phone-pad"
            />
          )}

          {type === 'wifi' && (
            <View style={{ gap: 16 }}>
              <Field
                label="Network name (SSID)"
                icon="wifi-outline"
                value={ssid}
                onChangeText={setSsid}
                placeholder="My Home WiFi"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <View>
                <Text style={styles.fieldLabel}>Security</Text>
                <View style={styles.chipRow}>
                  {SECURITY.map((s) => {
                    const active = security === s.key;
                    return (
                      <Pressable
                        key={s.key}
                        onPress={() => setSecurity(s.key)}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, active && { color: '#fff' }]}>{s.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {security !== 'nopass' && (
                <View>
                  <Text style={styles.fieldLabel}>Password</Text>
                  <View style={styles.inputRow}>
                    <Ionicons name="lock-closed-outline" size={18} color={colors.muted} />
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      placeholder="Wi-Fi password"
                      placeholderTextColor={colors.muted}
                      style={styles.input}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
                      <Ionicons
                        name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                        size={20}
                        color={colors.muted}
                      />
                    </Pressable>
                  </View>
                </View>
              )}

              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleLabel}>Hidden network</Text>
                  <Text style={styles.toggleDesc}>Turn on if the network name isn't broadcast</Text>
                </View>
                <Switch
                  value={hidden}
                  onValueChange={setHidden}
                  trackColor={{ true: ACCENT, false: colors.border }}
                  thumbColor="#fff"
                />
              </View>
            </View>
          )}
        </View>

        {/* Color */}
        <Text style={styles.sectionLabel}>Color</Text>
        <View style={styles.colorRow}>
          {QR_COLORS.map((c) => {
            const active = color === c;
            return (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                style={[styles.swatchOuter, active && { borderColor: c }]}
              >
                <View style={[styles.swatch, { backgroundColor: c }]}>
                  {active && <Ionicons name="checkmark" size={18} color="#fff" />}
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {/* Actions */}
      <View style={styles.footer}>
        <View style={{ flex: 1 }}>
          <PrimaryButton
            label="Share"
            icon="share-social-outline"
            variant="outline"
            color={ACCENT}
            loading={busy === 'share'}
            disabled={!value || busy !== null}
            onPress={handleShare}
          />
        </View>
        <View style={{ flex: 1 }}>
          <PrimaryButton
            label="Save"
            icon="download-outline"
            color={ACCENT}
            loading={busy === 'save'}
            disabled={!value || busy !== null}
            onPress={handleSave}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

function Field({ label, icon, ...props }: TextInputProps & { label: string; icon: IconName }) {
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputRow}>
        <Ionicons name={icon} size={18} color={colors.muted} />
        <TextInput placeholderTextColor={colors.muted} style={styles.input} {...props} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 32 },

  previewCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
    ...shadow,
  },
  qrWrap: {
    padding: 6,
    borderRadius: radius.md,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border,
  },
  placeholder: { height: 236, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 30 },
  placeholderText: { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20 },
  valuePreview: { marginTop: 14, fontSize: 13, color: colors.muted, maxWidth: '90%' },

  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 24,
    marginBottom: 10,
  },

  typeRow: { flexDirection: 'row', gap: 10 },
  typeItem: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeItemActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  typeLabel: { fontSize: 13, fontWeight: '600', color: colors.text },

  formCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, ...shadow },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 8 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 52,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  input: { flex: 1, fontSize: 15, color: colors.text },
  textArea: {
    minHeight: 120,
    padding: 14,
    fontSize: 15,
    color: colors.text,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  counter: { alignSelf: 'flex-end', marginTop: 6, fontSize: 12, color: colors.muted },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  chipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  chipText: { fontSize: 13.5, fontWeight: '600', color: colors.text },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  toggleDesc: { fontSize: 12.5, color: colors.muted, marginTop: 2 },

  colorRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  swatchOuter: { padding: 3, borderRadius: 999, borderWidth: 2, borderColor: 'transparent' },
  swatch: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },

  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 8,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});