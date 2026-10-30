import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFeedback } from '../../components/Feedback';
import { FileNameInput } from '../../components/FileNameInput';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ToolHeader } from '../../components/ToolHeader';
import { colors, radius, shadow } from '../../constants/theme';
import {
  AspectResult,
  computeCanvas,
  MAX_SIDE,
  MIN_SIDE,
  renderAspectRatio,
} from '../../services/aspectRatio';
import { formatBytes, stripExtension } from '../../utils/format';
import { saveToGallery } from '../../utils/media';

const ACCENT = '#E11D48';

type Picked = { uri: string; width: number; height: number; name: string };
type Status = 'idle' | 'working' | 'done';

const PRESETS = [
  { key: '1:1', w: 1, h: 1, label: 'Square' },
  { key: '4:5', w: 4, h: 5, label: 'Portrait' },
  { key: '9:16', w: 9, h: 16, label: 'Story' },
  { key: '16:9', w: 16, h: 9, label: 'YouTube' },
  { key: '3:2', w: 3, h: 2, label: 'Photo' },
  { key: '4:3', w: 4, h: 3, label: 'Classic' },
  { key: '2:3', w: 2, h: 3, label: 'Tall' },
  { key: 'custom', w: 1, h: 1, label: 'Pixels' },
] as const;

type PresetKey = (typeof PRESETS)[number]['key'];

const BG_COLORS = ['#FFFFFF', '#000000', '#F1F5F9', '#FDE68A', '#FBCFE8', '#BFDBFE', '#BBF7D0'];

function parsePx(value: string): number | null {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= MIN_SIDE && n <= MAX_SIDE ? n : null;
}

export default function AspectRatioScreen() {
  const { width: screenW } = useWindowDimensions();
  const { showToast, showDialog } = useFeedback();

  const [image, setImage] = useState<Picked | null>(null);
  const [preset, setPreset] = useState<PresetKey>('1:1');
  const [customW, setCustomW] = useState('1080');
  const [customH, setCustomH] = useState('1350');
  const [bg, setBg] = useState<string>('blur'); // 'blur' or a hex color
  const [fileName, setFileName] = useState('');
  const [nameEdited, setNameEdited] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<AspectResult | null>(null);
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);

  const working = status === 'working';
  const current = PRESETS.find((p) => p.key === preset)!;
  const isCustom = preset === 'custom';
  const cw = parsePx(customW);
  const ch = parsePx(customH);
  const customValid = cw !== null && ch !== null;

  const ratio = isCustom ? (customValid ? cw! / ch! : 1) : current.w / current.h;
  const output = !image
    ? null
    : isCustom
      ? customValid
        ? { width: cw!, height: ch! }
        : null
      : computeCanvas(image.width, image.height, current.w, current.h);

  const defaultName = image
    ? `${stripExtension(image.name)}_${isCustom ? `${customW}x${customH}` : preset.replace(':', 'x')}`
    : '';
  const nameValue = nameEdited ? fileName : defaultName;

  // preview box size
  const maxW = screenW - 40 - 32;
  const maxH = 320;
  const boxW = Math.min(maxW, maxH * ratio);
  const boxH = boxW / ratio;

  // ---------- actions ----------
  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    setImage({
      uri: a.uri,
      width: a.width,
      height: a.height,
      name: a.fileName ?? a.uri.split('/').pop() ?? 'image.jpg',
    });
    setNameEdited(false);
    setResult(null);
    setStatus('idle');
  };

  const swapCustom = () => {
    setCustomW(customH);
    setCustomH(customW);
  };

  const handleApply = async () => {
    if (!image || !output) return;
    setStatus('working');
    await new Promise((r) => setTimeout(r, 60)); // let the loader appear first
    try {
      const res = await renderAspectRatio(
        image.uri,
        isCustom
          ? { type: 'size', width: cw!, height: ch! }
          : { type: 'ratio', w: current.w, h: current.h },
        bg === 'blur' ? { type: 'blur' } : { type: 'color', color: bg },
        nameValue || defaultName
      );
      setResult(res);
      setStatus('done');
      showToast({ variant: 'success', message: 'Image ready' });
    } catch (e) {
      setStatus('idle');
      showDialog({
        variant: 'error',
        title: "Couldn't create image",
        message: e instanceof Error ? e.message : 'Something went wrong. Please try again.',
      });
    }
  };

  const handleSave = async () => {
    if (!result) return;
    setBusy('save');
    try {
      await saveToGallery(result.uri);
      showToast({ variant: 'success', message: 'Saved to your gallery' });
    } catch (e) {
      showDialog({
        variant: 'error',
        title: "Couldn't save",
        message: e instanceof Error ? e.message : 'Something went wrong.',
      });
    } finally {
      setBusy(null);
    }
  };

  const handleShare = async () => {
    if (!result) return;
    setBusy('share');
    try {
      await Sharing.shareAsync(result.uri, { mimeType: 'image/jpeg', dialogTitle: 'Share image' });
    } catch (e) {
      showDialog({
        variant: 'error',
        title: "Couldn't share",
        message: e instanceof Error ? e.message : 'Something went wrong.',
      });
    } finally {
      setBusy(null);
    }
  };

  // ---------- UI ----------
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ToolHeader title="Aspect Ratio" />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {!image ? (
          <Pressable onPress={pickImage} style={({ pressed }) => [styles.dropzone, pressed && { opacity: 0.8 }]}>
            <View style={styles.dropIcon}>
              <Ionicons name="resize-outline" size={30} color={ACCENT} />
            </View>
            <Text style={styles.dropTitle}>Choose a photo</Text>
            <Text style={styles.dropHint}>Fit it into any shape without cropping</Text>
            <View style={styles.browseButton}>
              <Text style={styles.browseText}>Browse gallery</Text>
            </View>
          </Pressable>
        ) : status === 'done' && result ? (
          /* ---------- Result ---------- */
          <View style={styles.previewCard}>
            <Image
              source={{ uri: result.uri }}
              style={{ width: boxW, height: boxH, borderRadius: 8 }}
              resizeMode="contain"
            />
            <Text style={styles.resultName} numberOfLines={1}>
              {result.name}
            </Text>
            <View style={styles.badges}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {result.width} × {result.height}
                </Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{formatBytes(result.sizeBytes)}</Text>
              </View>
            </View>
            <View style={styles.links}>
              <Pressable onPress={() => setStatus('idle')} hitSlop={8}>
                <Text style={styles.linkText}>Adjust</Text>
              </Pressable>
              <Text style={{ color: colors.muted }}>•</Text>
              <Pressable onPress={pickImage} hitSlop={8}>
                <Text style={styles.linkText}>New photo</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <>
            {/* ---------- Live preview ---------- */}
            <View style={styles.previewCard}>
              <View
                style={[
                  styles.previewBox,
                  { width: boxW, height: boxH, backgroundColor: bg === 'blur' ? '#000' : bg },
                ]}
              >
                {bg === 'blur' && (
                  <>
                    <Image source={{ uri: image.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" blurRadius={25} />
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.18)' }]} />
                  </>
                )}
                <Image source={{ uri: image.uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
              </View>
              <View style={styles.previewInfo}>
                <Text style={styles.previewText} numberOfLines={1}>
                  {output ? `Output: ${output.width} × ${output.height} px` : 'Enter a valid size'}
                </Text>
                {!working && (
                  <Pressable onPress={pickImage} hitSlop={8}>
                    <Text style={styles.linkText}>Change photo</Text>
                  </Pressable>
                )}
              </View>
            </View>

            {/* ---------- Ratio presets ---------- */}
            <Text style={styles.sectionLabel}>Aspect ratio</Text>
            <View style={styles.presetGrid}>
              {PRESETS.map((p) => {
                const active = preset === p.key;
                const shapeMax = 24;
                const sw = p.w >= p.h ? shapeMax : (shapeMax * p.w) / p.h;
                const sh = p.h >= p.w ? shapeMax : (shapeMax * p.h) / p.w;
                return (
                  <Pressable
                    key={p.key}
                    onPress={() => setPreset(p.key)}
                    disabled={working}
                    style={[styles.presetTile, active && styles.presetTileActive]}
                  >
                    <View style={styles.shapeWrap}>
                      {p.key === 'custom' ? (
                        <Ionicons name="options-outline" size={22} color={active ? ACCENT : colors.muted} />
                      ) : (
                        <View
                          style={[
                            styles.shape,
                            { width: sw, height: sh, borderColor: active ? ACCENT : colors.muted },
                          ]}
                        />
                      )}
                    </View>
                    <Text style={[styles.presetKey, active && { color: ACCENT }]}>
                      {p.key === 'custom' ? 'Custom' : p.key}
                    </Text>
                    <Text style={styles.presetLabel}>{p.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* ---------- Custom pixel size ---------- */}
            {isCustom && (
              <View style={styles.customCard}>
                <PxInput label="Width" value={customW} onChange={setCustomW} valid={cw !== null} editable={!working} />
                <Pressable onPress={swapCustom} style={styles.swapButton} disabled={working} hitSlop={6}>
                  <Ionicons name="swap-horizontal" size={18} color={ACCENT} />
                </Pressable>
                <PxInput label="Height" value={customH} onChange={setCustomH} valid={ch !== null} editable={!working} />
              </View>
            )}
            {isCustom && !customValid && (
              <Text style={styles.errorText}>
                Enter sizes between {MIN_SIDE} and {MAX_SIDE} px
              </Text>
            )}

            {/* ---------- Background ---------- */}
            <Text style={styles.sectionLabel}>Background</Text>
            <View style={styles.bgRow}>
              <Pressable
                onPress={() => setBg('blur')}
                disabled={working}
                style={[styles.blurOption, bg === 'blur' && styles.bgActive]}
              >
                <Image source={{ uri: image.uri }} style={styles.blurThumb} blurRadius={8} />
                <Text style={styles.blurLabel}>Blur</Text>
              </Pressable>
              {BG_COLORS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setBg(c)}
                  disabled={working}
                  style={[styles.swatchOuter, bg === c && styles.bgActive]}
                >
                  <View style={[styles.swatch, { backgroundColor: c }]} />
                </Pressable>
              ))}
            </View>

            {/* ---------- File name ---------- */}
            <Text style={styles.sectionLabel}>Save as</Text>
            <FileNameInput
              value={nameValue}
              onChangeText={(v) => {
                setFileName(v);
                setNameEdited(true);
              }}
              extension="jpg"
              defaultValue={defaultName}
              editable={!working}
              accent={ACCENT}
            />
          </>
        )}
      </ScrollView>

      {/* ---------- Footer ---------- */}
      {image && (
        <View style={styles.footer}>
          {status === 'done' ? (
            <View style={styles.footerRow}>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  label="Share"
                  icon="share-social-outline"
                  variant="outline"
                  color={ACCENT}
                  loading={busy === 'share'}
                  disabled={busy !== null}
                  onPress={handleShare}
                />
              </View>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  label="Save"
                  icon="download-outline"
                  color={ACCENT}
                  loading={busy === 'save'}
                  disabled={busy !== null}
                  onPress={handleSave}
                />
              </View>
            </View>
          ) : (
            <PrimaryButton
              label={working ? 'Processing…' : `Apply ${isCustom ? 'size' : preset}`}
              icon="checkmark"
              color={ACCENT}
              loading={working}
              disabled={!output}
              onPress={handleApply}
            />
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

function PxInput({
  label,
  value,
  onChange,
  valid,
  editable,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  valid: boolean;
  editable: boolean;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.pxLabel}>{label}</Text>
      <View style={[styles.pxInputRow, !valid && { borderColor: '#EF4444' }]}>
        <TextInput
          value={value}
          onChangeText={(t) => onChange(t.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          maxLength={4}
          editable={editable}
          style={styles.pxInput}
          selectTextOnFocus
        />
        <Text style={styles.pxUnit}>px</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 32 },

  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 22,
    marginBottom: 10,
  },

  dropzone: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: ACCENT + '66',
    backgroundColor: ACCENT + '0D',
    borderRadius: radius.lg,
    paddingVertical: 36,
    alignItems: 'center',
  },
  dropIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: ACCENT + '1F',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  dropTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  dropHint: { fontSize: 13, color: colors.muted, marginTop: 4 },
  browseButton: {
    marginTop: 16,
    borderWidth: 1.5,
    borderColor: ACCENT,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 9,
  },
  browseText: { color: ACCENT, fontWeight: '700', fontSize: 14 },

  previewCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 16,
    alignItems: 'center',
    ...shadow,
  },
  previewBox: { overflow: 'hidden', borderRadius: 8 },
  previewInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    alignSelf: 'stretch',
    marginTop: 14,
    gap: 10,
  },
  previewText: { flex: 1, fontSize: 13.5, fontWeight: '600', color: colors.text },

  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  presetTile: {
    width: '23.5%',
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  presetTileActive: { borderColor: ACCENT, backgroundColor: ACCENT + '0F' },
  shapeWrap: { height: 28, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  shape: { borderWidth: 2, borderRadius: 3 },
  presetKey: { fontSize: 14, fontWeight: '800', color: colors.text },
  presetLabel: { fontSize: 11, color: colors.muted, marginTop: 1 },

  customCard: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    marginTop: 14,
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    ...shadow,
  },
  pxLabel: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: 6 },
  pxInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  pxInput: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.text },
  pxUnit: { fontSize: 14, color: colors.muted, fontWeight: '600' },
  swapButton: {
    width: 40,
    height: 50,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENT + '14',
  },
  errorText: { fontSize: 12.5, color: '#DC2626', marginTop: 8 },

  bgRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  bgActive: { borderColor: ACCENT },
  blurOption: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  blurThumb: { ...StyleSheet.absoluteFillObject },
  blurLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 3,
  },
  swatchOuter: { padding: 3, borderRadius: 999, borderWidth: 2, borderColor: 'transparent' },
  swatch: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.border },

  resultName: { fontSize: 14, fontWeight: '600', color: colors.text, marginTop: 14 },
  badges: { flexDirection: 'row', gap: 8, marginTop: 10 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: ACCENT + '1A' },
  badgeText: { fontSize: 12.5, fontWeight: '700', color: ACCENT },
  links: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  linkText: { fontSize: 14, fontWeight: '700', color: ACCENT },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 8,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerRow: { flexDirection: 'row', gap: 12 },
});
