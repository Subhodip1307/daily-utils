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
  createPdf,
  FitMode,
  MarginSize,
  Orientation,
  PageSize,
  PdfResult,
  PickedImage,
  savePdfToFolder,
} from '../../services/imagesToPdf';
import { formatBytes } from '../../utils/format';

const ACCENT = '#DC2626';
const MAX_IMAGES = 50;

type Status = 'idle' | 'working' | 'done';

function todayName() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `Images ${dd}-${mm}-${d.getFullYear()}`;
}

export default function ImagesToPdfScreen() {
  const { showToast, showDialog, confirm } = useFeedback();

  const [images, setImages] = useState<PickedImage[]>([]);
  const [pageSize, setPageSize] = useState<PageSize>('A4');
  const [orientation, setOrientation] = useState<Orientation>('portrait');
  const [margin, setMargin] = useState<MarginSize>('small');
  const [fit, setFit] = useState<FitMode>('contain');
  const [defaultName] = useState(todayName);
  const [fileName, setFileName] = useState(defaultName);
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<PdfResult | null>(null);
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);
  const idCounter = useRef(0);

  const working = status === 'working';
  const count = images.length;

  // ---------- image list actions ----------
  const addImages = async () => {
    const remaining = MAX_IMAGES - count;
    if (remaining <= 0) {
      showToast({ variant: 'warning', message: `You can add up to ${MAX_IMAGES} images` });
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      orderedSelection: true,
      selectionLimit: remaining,
      quality: 1,
    });
    if (res.canceled || !res.assets?.length) return;

    const added: PickedImage[] = res.assets.slice(0, remaining).map((a) => ({
      id: `img_${idCounter.current++}`,
      uri: a.uri,
      width: a.width ?? 0,
      height: a.height ?? 0,
      name: a.fileName ?? a.uri.split('/').pop() ?? 'Image',
    }));
    setImages((prev) => [...prev, ...added]);
    if (status === 'done') setStatus('idle');
  };

  const move = (index: number, dir: -1 | 1) => {
    setImages((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const remove = (id: string) => setImages((prev) => prev.filter((img) => img.id !== id));

  const clearAll = async () => {
    const yes = await confirm({
      title: 'Remove all images?',
      confirmLabel: 'Remove all',
      cancelLabel: 'Keep',
      destructive: true,
    });
    if (yes) {
      setImages([]);
      setStatus('idle');
      setResult(null);
    }
  };

  // ---------- PDF actions ----------
  const handleCreate = async () => {
    setStatus('working');
    setProgress(0);
    try {
      const pdf = await createPdf(images, { pageSize, orientation, margin, fit }, fileName || defaultName, setProgress);
      setResult(pdf);
      setStatus('done');
      showToast({ variant: 'success', message: 'PDF created' });
    } catch (e) {
      setStatus('idle');
      showDialog({
        variant: 'error',
        title: "Couldn't create PDF",
        message: e instanceof Error ? e.message : 'Something went wrong. Please try again.',
      });
    }
  };

  const handleSave = async () => {
    if (!result) return;
    setBusy('save');
    try {
      const saved = await savePdfToFolder(result);
      if (saved) showToast({ variant: 'success', message: 'PDF saved to your folder' });
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
      await Sharing.shareAsync(result.uri, { mimeType: 'application/pdf', dialogTitle: 'Share PDF' });
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

  const handleReset = () => {
    setImages([]);
    setResult(null);
    setStatus('idle');
    setFileName(defaultName);
  };

  const progressLabel =
    progress < count / (count + 1)
      ? `Preparing images ${Math.min(count, Math.floor(progress * (count + 1)) + 1)}/${count}…`
      : 'Creating PDF…';

  // ---------- UI ----------
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ToolHeader title="Images to PDF" />

      <KeyboardScroll
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {status === 'done' && result ? (
          /* ---------- Result ---------- */
          <View style={styles.resultCard}>
            <View style={styles.resultIcon}>
              <Ionicons name="document-text" size={36} color="#fff" />
            </View>
            <Text style={styles.resultTitle}>Your PDF is ready</Text>
            <Text style={styles.resultName} numberOfLines={2}>
              {result.name}
            </Text>
            <View style={styles.badges}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {result.pages} {result.pages === 1 ? 'page' : 'pages'}
                </Text>
              </View>
              {result.sizeBytes > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{formatBytes(result.sizeBytes)}</Text>
                </View>
              )}
            </View>
            <View style={styles.resultLinks}>
              <Pressable onPress={() => setStatus('idle')} hitSlop={8}>
                <Text style={styles.linkText}>Edit this PDF</Text>
              </Pressable>
              <Text style={styles.dot}>•</Text>
              <Pressable onPress={handleReset} hitSlop={8}>
                <Text style={styles.linkText}>Start new</Text>
              </Pressable>
            </View>
            <Text style={styles.saveHint}>
              Tip: when saving, choose or create a folder like "Documents/Daily Utils".
            </Text>
          </View>
        ) : (
          <>
            {/* ---------- Images ---------- */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>Images {count > 0 ? `(${count})` : ''}</Text>
              {count > 1 && !working && (
                <Pressable onPress={clearAll} hitSlop={8}>
                  <Text style={styles.clearText}>Remove all</Text>
                </Pressable>
              )}
            </View>

            {count === 0 ? (
              <Pressable onPress={addImages} style={({ pressed }) => [styles.dropzone, pressed && { opacity: 0.8 }]}>
                <View style={styles.dropIcon}>
                  <Ionicons name="images-outline" size={30} color={ACCENT} />
                </View>
                <Text style={styles.dropTitle}>Choose photos</Text>
                <Text style={styles.dropHint}>Select one or more images · up to {MAX_IMAGES}</Text>
                <View style={styles.browseButton}>
                  <Text style={styles.browseText}>Browse gallery</Text>
                </View>
              </Pressable>
            ) : (
              <View style={styles.listCard}>
                {images.map((img, i) => (
                  <View key={img.id} style={[styles.imageRow, i > 0 && styles.rowDivider]}>
                    <View>
                      <Image source={{ uri: img.uri }} style={styles.thumb} />
                      <View style={styles.orderBadge}>
                        <Text style={styles.orderText}>{i + 1}</Text>
                      </View>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.imageName} numberOfLines={1}>
                        {img.name}
                      </Text>
                      <Text style={styles.imageMeta}>
                        {img.width && img.height ? `${img.width} × ${img.height}` : 'Image'}
                      </Text>
                    </View>
                    <IconButton icon="chevron-up" disabled={i === 0 || working} onPress={() => move(i, -1)} />
                    <IconButton
                      icon="chevron-down"
                      disabled={i === count - 1 || working}
                      onPress={() => move(i, 1)}
                    />
                    <IconButton
                      icon="trash-outline"
                      color={ACCENT}
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
                <Text style={styles.sectionLabel}>Page settings</Text>
                <View style={styles.optionsCard}>
                  <ChipGroup
                    label="Page size"
                    value={pageSize}
                    onChange={setPageSize}
                    disabled={working}
                    options={[
                      { key: 'A4', label: 'A4' },
                      { key: 'Letter', label: 'Letter' },
                    ]}
                  />
                  <ChipGroup
                    label="Orientation"
                    value={orientation}
                    onChange={setOrientation}
                    disabled={working}
                    options={[
                      { key: 'portrait', label: 'Portrait', icon: 'phone-portrait-outline' },
                      { key: 'landscape', label: 'Landscape', icon: 'phone-landscape-outline' },
                    ]}
                  />
                  <ChipGroup
                    label="Margin"
                    value={margin}
                    onChange={setMargin}
                    disabled={working}
                    options={[
                      { key: 'none', label: 'None' },
                      { key: 'small', label: 'Small' },
                      { key: 'large', label: 'Large' },
                    ]}
                  />
                  <ChipGroup
                    label="Image fit"
                    value={fit}
                    onChange={setFit}
                    disabled={working}
                    last
                    options={[
                      { key: 'contain', label: 'Fit whole image' },
                      { key: 'cover', label: 'Fill page' },
                    ]}
                  />
                </View>

                <Text style={styles.sectionLabel}>Save as</Text>
                <FileNameInput
                  value={fileName}
                  onChangeText={setFileName}
                  extension="pdf"
                  defaultValue={defaultName}
                  editable={!working}
                  accent={ACCENT}
                />
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
                <Text style={styles.progressTitle}>{progressLabel}</Text>
                <Text style={styles.progressPct}>{Math.round(progress * 100)}%</Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` as const }]} />
              </View>
            </View>
          ) : status === 'done' ? (
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
                  icon="folder-open-outline"
                  color={ACCENT}
                  loading={busy === 'save'}
                  disabled={busy !== null}
                  onPress={handleSave}
                />
              </View>
            </View>
          ) : (
            <PrimaryButton
              label={`Create PDF · ${count} ${count === 1 ? 'page' : 'pages'}`}
              icon="document-text-outline"
              color={ACCENT}
              onPress={handleCreate}
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

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 20,
    marginBottom: 10,
  },
  clearText: { fontSize: 13, fontWeight: '700', color: ACCENT, marginTop: 10 },

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
  imageRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  thumb: { width: 54, height: 54, borderRadius: 10, backgroundColor: colors.border },
  orderBadge: {
    position: 'absolute',
    top: -6,
    left: -6,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 5,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  orderText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  imageName: { fontSize: 14, fontWeight: '600', color: colors.text },
  imageMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
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

  optionsCard: { backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: 16, ...shadow },
  optionBlock: { paddingVertical: 14 },
  optionDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  optionLabel: { fontSize: 14.5, fontWeight: '600', color: colors.text, marginBottom: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
  chipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  chipText: { fontSize: 13.5, fontWeight: '600', color: colors.text },

  resultCard: {
    marginTop: 12,
    padding: 24,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    ...shadow,
  },
  resultIcon: {
    width: 76,
    height: 76,
    borderRadius: 24,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  resultTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  resultName: { fontSize: 14, color: colors.muted, marginTop: 6, textAlign: 'center' },
  badges: { flexDirection: 'row', gap: 8, marginTop: 14 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: ACCENT + '1A' },
  badgeText: { fontSize: 12.5, fontWeight: '700', color: ACCENT },
  resultLinks: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18 },
  linkText: { fontSize: 14, fontWeight: '700', color: ACCENT },
  dot: { color: colors.muted },
  saveHint: { fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 16, lineHeight: 17 },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 8,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerRow: { flexDirection: 'row', gap: 12 },
  progressTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  progressTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  progressPct: { fontSize: 14, fontWeight: '700', color: ACCENT },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4, backgroundColor: ACCENT },
});
