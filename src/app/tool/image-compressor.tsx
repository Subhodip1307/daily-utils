import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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
  CompressedImage,
  CompressFormat,
  compressImages,
  CompressMode,
  SourceImage,
} from '../../services/imageCompressor';
import { formatBytes, stripExtension } from '../../utils/format';
import { saveToGallery } from '../../utils/media';
const ACCENT = '#7C3AED';
const MAX_IMAGES = 30;

type Status = 'idle' | 'working' | 'done';
type ModeType = 'quality' | 'target';
type Strength = 'light' | 'balanced' | 'strong' | 'extreme';
type TargetKey = '50' | '100' | '200' | '500' | '1024' | 'custom';
type MaxSide = 'original' | '2560' | '1920' | '1280' | '1080' | '720';

const STRENGTHS: { key: Strength; label: string; quality: number; hint: string }[] = [
  { key: 'light', label: 'Light', quality: 0.85, hint: 'Best quality' },
  { key: 'balanced', label: 'Balanced', quality: 0.7, hint: 'Recommended' },
  { key: 'strong', label: 'Strong', quality: 0.5, hint: 'Much smaller' },
  { key: 'extreme', label: 'Extreme', quality: 0.3, hint: 'Smallest' },
];

const extOf = (name: string) => (name.split('.').pop() || '').toUpperCase();

export default function ImageCompressorScreen() {
  const { showToast, showDialog } = useFeedback();

  const [images, setImages] = useState<SourceImage[]>([]);
  const [modeType, setModeType] = useState<ModeType>('quality');
  const [strength, setStrength] = useState<Strength>('balanced');
  const [targetKey, setTargetKey] = useState<TargetKey>('100');
  const [customKb, setCustomKb] = useState('150');
  const [maxSide, setMaxSide] = useState<MaxSide>('original');
  const [format, setFormat] = useState<CompressFormat>('jpeg');
  const [fileName, setFileName] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<CompressedImage[]>([]);
  const [saving, setSaving] = useState(false);
  const idCounter = useRef(0);

  const count = images.length;
  const working = status === 'working';
  const single = count === 1;
  const ext = format === 'webp' ? 'webp' : 'jpg';
  const singleDefault = single ? `${stripExtension(images[0].name)}_compressed` : '';

  const customKbNum = parseInt(customKb, 10);
  const targetKb = targetKey === 'custom' ? customKbNum : Number(targetKey);
  const targetValid = Number.isFinite(targetKb) && targetKb >= 10 && targetKb <= 20480;

  const buildMode = (): CompressMode =>
    modeType === 'quality'
      ? { type: 'quality', quality: STRENGTHS.find((s) => s.key === strength)!.quality }
      : { type: 'target', maxBytes: targetKb * 1024 };

  const updateImages = (next: SourceImage[]) => {
    setImages(next);
    setFileName(next.length === 1 ? `${stripExtension(next[0].name)}_compressed` : '');
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

  const handleCompress = async () => {
    setStatus('working');
    setProgress(0);
    try {
      const out = await compressImages(
        images,
        { mode: buildMode(), maxSide: maxSide === 'original' ? null : Number(maxSide), format },
        single ? fileName || singleDefault : null,
        setProgress
      );
      setResults(out);
      setStatus('done');

      const missed = out.filter((r) => !r.reachedTarget).length;
      if (missed > 0) {
        showToast({
          variant: 'warning',
          message: `${missed} ${missed === 1 ? 'image' : 'images'} couldn't reach ${targetKb} KB`,
        });
      } else {
        showToast({ variant: 'success', message: 'Compression complete' });
      }
    } catch (e) {
      setStatus('idle');
      showDialog({
        variant: 'error',
        title: "Couldn't compress",
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

  const shareOne = async (r: CompressedImage) => {
    try {
      await Sharing.shareAsync(r.uri, {
        mimeType: format === 'webp' ? 'image/webp' : 'image/jpeg',
        dialogTitle: 'Share image',
      });
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

  // ---------- totals ----------
  const totalAfter = results.reduce((s, r) => s + r.sizeBytes, 0);
  const allKnown = results.length > 0 && results.every((r) => r.originalSize);
  const totalBefore = allKnown ? results.reduce((s, r) => s + (r.originalSize ?? 0), 0) : 0;
  const saved = totalBefore ? Math.round((1 - totalAfter / totalBefore) * 100) : null;

  // ---------- UI ----------
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ToolHeader title="Image Compressor" />

      <KeyboardScroll
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {status === 'done' ? (
          /* ---------- Results ---------- */
          <>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>{saved !== null && saved > 0 ? 'You saved' : 'Done'}</Text>
              <Text style={styles.summaryBig}>
                {saved !== null && saved > 0 ? `${saved}%` : `${results.length} files`}
              </Text>
              <Text style={styles.summaryMeta}>
                {allKnown
                  ? `${formatBytes(totalBefore)}  →  ${formatBytes(totalAfter)}`
                  : `Total ${formatBytes(totalAfter)}`}
              </Text>
            </View>

            <Text style={styles.sectionLabel}>Compressed files</Text>
            <View style={styles.listCard}>
              {results.map((r, i) => {
                const pct = r.originalSize ? Math.round((1 - r.sizeBytes / r.originalSize) * 100) : null;
                return (
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
                      {!r.reachedTarget && (
                        <Text style={styles.rowWarn}>Couldn't reach {targetKb} KB (this is the smallest)</Text>
                      )}
                    </View>
                    {pct !== null && (
                      <View style={[styles.pctBadge, { backgroundColor: pct > 0 ? '#ECFDF5' : '#FFFBEB' }]}>
                        <Text style={[styles.pctText, { color: pct > 0 ? '#059669' : '#D97706' }]}>
                          {pct > 0 ? `-${pct}%` : `+${Math.abs(pct)}%`}
                        </Text>
                      </View>
                    )}
                    <IconButton icon="share-social-outline" color={ACCENT} onPress={() => shareOne(r)} />
                  </View>
                );
              })}
            </View>

            <View style={styles.links}>
              <Pressable onPress={() => setStatus('idle')} hitSlop={8}>
                <Text style={styles.linkText}>Change settings</Text>
              </Pressable>
              <Text style={{ color: colors.muted }}>•</Text>
              <Pressable onPress={handleStartOver} hitSlop={8}>
                <Text style={styles.linkText}>Start over</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            {/* ---------- Images ---------- */}
            <Text style={styles.sectionLabel}>Images {count > 0 ? `(${count})` : ''}</Text>

            {count === 0 ? (
              <Pressable onPress={addImages} style={({ pressed }) => [styles.dropzone, pressed && { opacity: 0.8 }]}>
                <View style={styles.dropIcon}>
                  <Ionicons name="contract-outline" size={30} color={ACCENT} />
                </View>
                <Text style={styles.dropTitle}>Choose photos</Text>
                <Text style={styles.dropHint}>Make them smaller for forms, email & sharing</Text>
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
                    <IconButton icon="close" color={colors.muted} disabled={working} onPress={() => remove(img.id)} />
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

            {count > 0 && (
              <>
                {/* ---------- Mode ---------- */}
                <Text style={styles.sectionLabel}>Compress by</Text>
                <View style={styles.segment}>
                  {(['quality', 'target'] as ModeType[]).map((m) => {
                    const active = modeType === m;
                    return (
                      <Pressable
                        key={m}
                        onPress={() => setModeType(m)}
                        disabled={working}
                        style={[styles.segmentItem, active && styles.segmentActive]}
                      >
                        <Ionicons
                          name={m === 'quality' ? 'options-outline' : 'locate-outline'}
                          size={16}
                          color={active ? ACCENT : colors.muted}
                        />
                        <Text style={[styles.segmentText, active && { color: colors.text }]}>
                          {m === 'quality' ? 'Quality' : 'Target size'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {modeType === 'quality' ? (
                  <View style={styles.strengthGrid}>
                    {STRENGTHS.map((s) => {
                      const active = strength === s.key;
                      return (
                        <Pressable
                          key={s.key}
                          onPress={() => setStrength(s.key)}
                          disabled={working}
                          style={[styles.strengthCard, active && styles.strengthActive]}
                        >
                          <Text style={[styles.strengthLabel, active && { color: ACCENT }]}>{s.label}</Text>
                          <Text style={styles.strengthHint}>{s.hint}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <View style={[styles.optionsCard, { marginTop: 12 }]}>
                    <ChipGroup<TargetKey>
                      label="Make each image smaller than"
                      value={targetKey}
                      onChange={setTargetKey}
                      disabled={working}
                      accent={ACCENT}
                      last={targetKey !== 'custom'}
                      options={[
                        { key: '50', label: '50 KB' },
                        { key: '100', label: '100 KB' },
                        { key: '200', label: '200 KB' },
                        { key: '500', label: '500 KB' },
                        { key: '1024', label: '1 MB' },
                        { key: 'custom', label: 'Custom' },
                      ]}
                    />
                    {targetKey === 'custom' && (
                      <View style={styles.customRow}>
                        <View style={[styles.kbInputRow, !targetValid && { borderColor: '#EF4444' }]}>
                          <TextInput
                            value={customKb}
                            onChangeText={(t) => setCustomKb(t.replace(/[^0-9]/g, ''))}
                            keyboardType="number-pad"
                            maxLength={5}
                            editable={!working}
                            style={styles.kbInput}
                            selectTextOnFocus
                          />
                          <Text style={styles.kbUnit}>KB</Text>
                        </View>
                        {!targetValid && <Text style={styles.errorText}>Enter 10 – 20480 KB</Text>}
                      </View>
                    )}
                  </View>
                )}

                {/* ---------- More options ---------- */}
                <Text style={styles.sectionLabel}>More options</Text>
                <View style={styles.optionsCard}>
                  <ChipGroup<MaxSide>
                    label="Max resolution (longest side)"
                    value={maxSide}
                    onChange={setMaxSide}
                    disabled={working}
                    accent={ACCENT}
                    options={[
                      { key: 'original', label: 'Original' },
                      { key: '2560', label: '2560' },
                      { key: '1920', label: '1920' },
                      { key: '1280', label: '1280' },
                      { key: '1080', label: '1080' },
                      { key: '720', label: '720' },
                    ]}
                  />
                  <ChipGroup<CompressFormat>
                    label="Output format"
                    value={format}
                    onChange={setFormat}
                    disabled={working}
                    accent={ACCENT}
                    last
                    options={[
                      { key: 'jpeg', label: 'JPG' },
                      { key: 'webp', label: 'WEBP (smaller)' },
                    ]}
                  />
                </View>

                {single ? (
                  <>
                    <Text style={styles.sectionLabel}>Save as</Text>
                    <FileNameInput
                      value={fileName}
                      onChangeText={setFileName}
                      extension={ext}
                      defaultValue={singleDefault}
                      editable={!working}
                      accent={ACCENT}
                    />
                  </>
                ) : (
                  <View style={styles.note}>
                    <Ionicons name="information-circle-outline" size={16} color={colors.muted} />
                    <Text style={styles.noteText}>Files are saved as "name_compressed".</Text>
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
                  Compressing {Math.min(count, Math.floor(progress * count) + 1)}/{count}…
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
              label={
                modeType === 'target' && targetValid
                  ? `Compress under ${targetKb >= 1024 ? `${(targetKb / 1024).toFixed(1)} MB` : `${targetKb} KB`}`
                  : `Compress ${count} ${count === 1 ? 'image' : 'images'}`
              }
              icon="contract-outline"
              color={ACCENT}
              disabled={modeType === 'target' && !targetValid}
              onPress={handleCompress}
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
  dropHint: { fontSize: 13, color: colors.muted, marginTop: 4, textAlign: 'center', paddingHorizontal: 20 },
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  thumb: { width: 50, height: 50, borderRadius: 10, backgroundColor: colors.border },
  rowName: { fontSize: 14, fontWeight: '600', color: colors.text },
  rowMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  rowWarn: { fontSize: 11.5, color: '#D97706', marginTop: 2 },
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

  segment: { flexDirection: 'row', padding: 4, borderRadius: radius.md, backgroundColor: colors.border + '99' },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    borderRadius: radius.sm,
  },
  segmentActive: { backgroundColor: colors.surface, ...shadow },
  segmentText: { fontSize: 14, fontWeight: '600', color: colors.muted },

  strengthGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10, marginTop: 12 },
  strengthCard: {
    width: '48.5%',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  strengthActive: { borderColor: ACCENT, backgroundColor: ACCENT + '0F' },
  strengthLabel: { fontSize: 15.5, fontWeight: '800', color: colors.text },
  strengthHint: { fontSize: 12.5, color: colors.muted, marginTop: 2 },

  optionsCard: { backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: 16, ...shadow },
  customRow: { paddingBottom: 14 },
  kbInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  kbInput: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.text },
  kbUnit: { fontSize: 14, fontWeight: '600', color: colors.muted },
  errorText: { fontSize: 12.5, color: '#DC2626', marginTop: 6 },

  note: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18 },
  noteText: { flex: 1, fontSize: 13, color: colors.muted },

  summaryCard: {
    marginTop: 12,
    paddingVertical: 26,
    alignItems: 'center',
    backgroundColor: ACCENT,
    borderRadius: radius.lg,
  },
  summaryLabel: { fontSize: 14, fontWeight: '600', color: '#EDE9FE' },
  summaryBig: { fontSize: 44, fontWeight: '800', color: '#fff', marginTop: 2, letterSpacing: -1 },
  summaryMeta: { fontSize: 14, color: '#EDE9FE', marginTop: 4 },

  pctBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  pctText: { fontSize: 12, fontWeight: '800' },

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
