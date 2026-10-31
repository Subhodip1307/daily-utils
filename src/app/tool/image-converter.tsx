import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChipGroup } from '../../components/ChipGroup';
import { useFeedback } from '../../components/Feedback';
import { FileNameInput } from '../../components/FileNameInput';
import { IconButton } from '../../components/IconButton';
import { KeyboardScroll } from '../../components/KeyboardScroll';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ToolHeader } from '../../components/ToolHeader';
import { colors, radius, shadow } from '../../constants/theme';
import {
  ConvertedImage,
  convertImages,
  FORMAT_INFO,
  OutputFormat,
  SourceImage,
} from '../../services/imageConverter';
import { formatBytes, stripExtension } from '../../utils/format';
import { saveToGallery } from '../../utils/media';

const ACCENT = '#2563EB';
const MAX_IMAGES = 30;

type Status = 'idle' | 'working' | 'done';
type Quality = '1' | '0.9' | '0.75' | '0.6';

const FORMATS: { key: OutputFormat; hint: string }[] = [
  { key: 'jpeg', hint: 'Best for photos' },
  { key: 'png', hint: 'Lossless & sharp' },
  { key: 'webp', hint: 'Smallest files' },
];

const extOf = (name: string) => (name.split('.').pop() || '').toUpperCase();

export default function ImageConverterScreen() {
  const { showToast, showDialog } = useFeedback();

  const [images, setImages] = useState<SourceImage[]>([]);
  const [format, setFormat] = useState<OutputFormat>('jpeg');
  const [quality, setQuality] = useState<Quality>('0.9');
  const [fileName, setFileName] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ConvertedImage[]>([]);
  const [saving, setSaving] = useState(false);
  const idCounter = useRef(0);

  const count = images.length;
  const working = status === 'working';
  const info = FORMAT_INFO[format];
  const single = count === 1;
  const singleDefault = single ? stripExtension(images[0].name) : '';
  const transparencyWarning =
    format === 'jpeg' && images.some((i) => ['PNG', 'WEBP', 'GIF'].includes(extOf(i.name)));

  // keep the file name field in sync when the list changes
  const updateImages = (next: SourceImage[]) => {
    setImages(next);
    setFileName(next.length === 1 ? stripExtension(next[0].name) : '');
    if (status === 'done') setStatus('idle');
  };

  // ---------- actions ----------
  const addImages = async () => {
    const remaining = MAX_IMAGES - count;
    if (remaining <= 0) {
      showToast({ variant: 'warning', message: `You can add up to ${MAX_IMAGES} images` });
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 1,
    });
    if (res.canceled || !res.assets?.length) return;

    const added: SourceImage[] = res.assets.slice(0, remaining).map((a) => ({
      id: `img_${idCounter.current++}`,
      uri: a.uri,
      name: a.fileName ?? a.uri.split('/').pop() ?? 'image.jpg',
      sizeBytes: a.fileSize ?? null,
    }));
    updateImages([...images, ...added]);
  };

  const remove = (id: string) => updateImages(images.filter((i) => i.id !== id));

  const handleConvert = async () => {
    setStatus('working');
    setProgress(0);
    try {
      const out = await convertImages(
        images,
        format,
        Number(quality),
        single ? fileName || singleDefault : null,
        setProgress
      );
      setResults(out);
      setStatus('done');
      showToast({
        variant: 'success',
        message: `${out.length} ${out.length === 1 ? 'image' : 'images'} converted to ${info.label}`,
      });
    } catch (e) {
      setStatus('idle');
      showDialog({
        variant: 'error',
        title: "Couldn't convert",
        message: e instanceof Error ? e.message : 'Something went wrong. Please try again.',
      });
    }
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      for (const r of results) await saveToGallery(r.uri);
      showToast({
        variant: 'success',
        message: `Saved ${results.length} ${results.length === 1 ? 'image' : 'images'} to your gallery`,
      });
    } catch (e) {
      showDialog({
        variant: 'error',
        title: "Couldn't save",
        message: e instanceof Error ? e.message : 'Something went wrong.',
      });
    } finally {
      setSaving(false);
    }
  };

  const shareOne = async (r: ConvertedImage) => {
    try {
      await Sharing.shareAsync(r.uri, { mimeType: info.mime, dialogTitle: 'Share image' });
    } catch (e) {
      showDialog({
        variant: 'error',
        title: "Couldn't share",
        message: e instanceof Error ? e.message : 'Something went wrong.',
      });
    }
  };

  const handleStartOver = () => {
    setImages([]);
    setResults([]);
    setFileName('');
    setStatus('idle');
  };

  // ---------- totals for results ----------
  const totalAfter = results.reduce((s, r) => s + r.sizeBytes, 0);
  const allKnown = results.length > 0 && results.every((r) => r.originalSize);
  const totalBefore = allKnown ? results.reduce((s, r) => s + (r.originalSize ?? 0), 0) : 0;
  const change = totalBefore ? Math.round((1 - totalAfter / totalBefore) * 100) : null;

  // ---------- UI ----------
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ToolHeader title="Image Converter" />

      <KeyboardScroll
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {status === 'done' ? (
          /* ---------- Results ---------- */
          <>
            <View style={styles.summaryCard}>
              <View style={styles.summaryIcon}>
                <Ionicons name="checkmark-done" size={30} color="#fff" />
              </View>
              <Text style={styles.summaryTitle}>
                {results.length} {results.length === 1 ? 'image' : 'images'} converted
              </Text>
              <Text style={styles.summaryMeta}>
                {allKnown
                  ? `${formatBytes(totalBefore)}  →  ${formatBytes(totalAfter)}`
                  : `Total ${formatBytes(totalAfter)}`}
              </Text>
              {change !== null && change !== 0 && (
                <View
                  style={[
                    styles.changeBadge,
                    { backgroundColor: change > 0 ? '#ECFDF5' : '#FFFBEB' },
                  ]}
                >
                  <Text style={[styles.changeText, { color: change > 0 ? '#059669' : '#D97706' }]}>
                    {change > 0 ? `${change}% smaller` : `${Math.abs(change)}% larger`}
                  </Text>
                </View>
              )}
            </View>

            <Text style={styles.sectionLabel}>Converted files</Text>
            <View style={styles.listCard}>
              {results.map((r, i) => (
                <View key={r.id} style={[styles.row, i > 0 && styles.rowDivider]}>
                  <Image source={{ uri: r.uri }} style={styles.thumb} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {r.name}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {r.originalSize ? `${formatBytes(r.originalSize)} → ` : ''}
                      {formatBytes(r.sizeBytes)} · {r.width}×{r.height}
                    </Text>
                  </View>
                  <IconButton icon="share-social-outline" color={ACCENT} onPress={() => shareOne(r)} />
                </View>
              ))}
            </View>

            <View style={styles.links}>
              <Pressable onPress={() => setStatus('idle')} hitSlop={8}>
                <Text style={styles.linkText}>Change format</Text>
              </Pressable>
              <Text style={{ color: colors.muted }}>•</Text>
              <Pressable onPress={handleStartOver} hitSlop={8}>
                <Text style={styles.linkText}>Start over</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            {/* ---------- Source images ---------- */}
            <Text style={styles.sectionLabel}>Images {count > 0 ? `(${count})` : ''}</Text>

            {count === 0 ? (
              <Pressable onPress={addImages} style={({ pressed }) => [styles.dropzone, pressed && { opacity: 0.8 }]}>
                <View style={styles.dropIcon}>
                  <Ionicons name="repeat-outline" size={30} color={ACCENT} />
                </View>
                <Text style={styles.dropTitle}>Choose images</Text>
                <Text style={styles.dropHint}>JPG, PNG, WEBP, HEIC · up to {MAX_IMAGES}</Text>
                <View style={styles.browseButton}>
                  <Text style={styles.browseText}>Browse gallery</Text>
                </View>
              </Pressable>
            ) : (
              <View style={styles.listCard}>
                {images.map((img, i) => (
                  <View key={img.id} style={[styles.row, i > 0 && styles.rowDivider]}>
                    <Image source={{ uri: img.uri }} style={styles.thumb} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {img.name}
                      </Text>
                      <Text style={styles.rowMeta}>
                        {extOf(img.name) || 'Image'}
                        {img.sizeBytes ? ` · ${formatBytes(img.sizeBytes)}` : ''}
                      </Text>
                    </View>
                    <IconButton
                      icon="close"
                      color={colors.muted}
                      disabled={working}
                      onPress={() => remove(img.id)}
                    />
                  </View>
                ))}
                {count < MAX_IMAGES && !working && (
                  <Pressable onPress={addImages} style={styles.addMore}>
                    <Ionicons name="add-circle-outline" size={20} color={ACCENT} />
                    <Text style={styles.addMoreText}>Add more images</Text>
                  </Pressable>
                )}
              </View>
            )}

            {/* ---------- Options ---------- */}
            {count > 0 && (
              <>
                <Text style={styles.sectionLabel}>Convert to</Text>
                <View style={styles.formatRow}>
                  {FORMATS.map((f) => {
                    const active = format === f.key;
                    return (
                      <Pressable
                        key={f.key}
                        onPress={() => setFormat(f.key)}
                        disabled={working}
                        style={[styles.formatCard, active && styles.formatCardActive]}
                      >
                        <Text style={[styles.formatLabel, active && { color: ACCENT }]}>
                          {FORMAT_INFO[f.key].label}
                        </Text>
                        <Text style={styles.formatHint}>{f.hint}</Text>
                        {active && (
                          <View style={styles.formatCheck}>
                            <Ionicons name="checkmark" size={12} color="#fff" />
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>

                {transparencyWarning && (
                  <View style={styles.warning}>
                    <Ionicons name="alert-circle-outline" size={18} color="#B45309" />
                    <Text style={styles.warningText}>
                      JPG doesn't support transparency. Transparent areas will turn black. Choose PNG or
                      WEBP to keep them.
                    </Text>
                  </View>
                )}

                {info.lossy && (
                  <View style={[styles.optionsCard, { marginTop: 16 }]}>
                    <ChipGroup<Quality>
                      label="Quality"
                      value={quality}
                      onChange={setQuality}
                      disabled={working}
                      accent={ACCENT}
                      last
                      options={[
                        { key: '1', label: 'Maximum' },
                        { key: '0.9', label: 'High' },
                        { key: '0.75', label: 'Medium' },
                        { key: '0.6', label: 'Low' },
                      ]}
                    />
                  </View>
                )}

                {single ? (
                  <>
                    <Text style={styles.sectionLabel}>Save as</Text>
                    <FileNameInput
                      value={fileName}
                      onChangeText={setFileName}
                      extension={info.ext}
                      defaultValue={singleDefault}
                      editable={!working}
                      accent={ACCENT}
                    />
                  </>
                ) : (
                  <View style={styles.note}>
                    <Ionicons name="information-circle-outline" size={16} color={colors.muted} />
                    <Text style={styles.noteText}>Files keep their original names with the new extension.</Text>
                  </View>
                )}
              </>
            )}
          </>
        )}
      </KeyboardScroll>

      {/* ---------- Footer ---------- */}
      {count > 0 && (
        <View style={styles.footer}>
          {working ? (
            <View>
              <View style={styles.progressTop}>
                <Text style={styles.progressTitle}>
                  Converting {Math.min(count, Math.floor(progress * count) + 1)}/{count}…
                </Text>
                <Text style={styles.progressPct}>{Math.round(progress * 100)}%</Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` as const }]} />
              </View>
            </View>
          ) : status === 'done' ? (
            <PrimaryButton
              label={results.length === 1 ? 'Save to gallery' : `Save all ${results.length} to gallery`}
              icon="download-outline"
              color={ACCENT}
              loading={saving}
              onPress={handleSaveAll}
            />
          ) : (
            <PrimaryButton
              label={`Convert to ${info.label}`}
              icon="repeat-outline"
              color={ACCENT}
              onPress={handleConvert}
            />
          )}
        </View>
      )}
    </SafeAreaView>
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
    marginTop: 20,
    marginBottom: 10,
  },

  dropzone: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: ACCENT + '66',
    backgroundColor: ACCENT + '0D',
    borderRadius: radius.lg,
    paddingVertical: 32,
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

  listCard: { backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: 12, ...shadow },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  thumb: { width: 50, height: 50, borderRadius: 10, backgroundColor: colors.border },
  rowName: { fontSize: 14, fontWeight: '600', color: colors.text },
  rowMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  addMore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  addMoreText: { fontSize: 14, fontWeight: '700', color: ACCENT },

  formatRow: { flexDirection: 'row', gap: 10 },
  formatCard: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
  },
  formatCardActive: { borderColor: ACCENT, backgroundColor: ACCENT + '0F' },
  formatLabel: { fontSize: 17, fontWeight: '800', color: colors.text },
  formatHint: { fontSize: 11.5, color: colors.muted, marginTop: 3, textAlign: 'center' },
  formatCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },

  warning: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    padding: 12,
    borderRadius: radius.sm,
    backgroundColor: '#FFFBEB',
  },
  warningText: { flex: 1, fontSize: 13, color: '#92400E', lineHeight: 19 },

  optionsCard: { backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: 16, ...shadow },

  note: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18 },
  noteText: { flex: 1, fontSize: 13, color: colors.muted },

  summaryCard: {
    marginTop: 12,
    padding: 24,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    ...shadow,
  },
  summaryIcon: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  summaryTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  summaryMeta: { fontSize: 14, color: colors.muted, marginTop: 6 },
  changeBadge: { marginTop: 12, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 },
  changeText: { fontSize: 13, fontWeight: '700' },

  links: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 20 },
  linkText: { fontSize: 14, fontWeight: '700', color: ACCENT },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 8,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  progressTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  progressTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  progressPct: { fontSize: 14, fontWeight: '700', color: ACCENT },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4, backgroundColor: ACCENT },
});
