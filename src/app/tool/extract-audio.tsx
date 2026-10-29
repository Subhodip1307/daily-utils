import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFeedback } from '../../components/Feedback';
import { FileNameInput } from '../../components/FileNameInput';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ToolHeader } from '../../components/ToolHeader';
import { colors, radius, shadow } from '../../constants/theme';
import { AudioFormat, AudioQuality, extractAudio, ExtractedAudio } from '../../services/audioExtractor';
import { formatBytes, formatDuration, stripExtension } from '../../utils/format';
import { saveToGallery } from '../../utils/media';

const ACCENT = '#D97706';

type PickedVideo = {
  uri: string;
  name: string;
  sizeBytes: number | null;
  durationSec: number | null;
};

type Status = 'idle' | 'working' | 'done';

const FORMATS: { key: AudioFormat; label: string; hint: string }[] = [
  { key: 'mp3', label: 'MP3', hint: 'Plays everywhere' },
  { key: 'm4a', label: 'M4A', hint: 'Smaller size' },
  { key: 'wav', label: 'WAV', hint: 'Lossless' },
];

const QUALITIES: { key: AudioQuality; label: string }[] = [
  { key: '128', label: '128 kbps' },
  { key: '192', label: '192 kbps' },
  { key: '320', label: '320 kbps' },
];

function estimateSize(durationSec: number | null, format: AudioFormat, quality: AudioQuality) {
  if (!durationSec) return null;
  const bitsPerSecond = format === 'wav' ? 1_411_000 : Number(quality) * 1000;
  return (durationSec * bitsPerSecond) / 8;
}

export default function ExtractAudioScreen() {
  const { showToast, showDialog, confirm } = useFeedback();

  const [video, setVideo] = useState<PickedVideo | null>(null);
  const [format, setFormat] = useState<AudioFormat>('mp3');
  const [quality, setQuality] = useState<AudioQuality>('192');
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<ExtractedAudio | null>(null);
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);
  const [fileName, setFileName] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const working = status === 'working';
  const estimate = estimateSize(video?.durationSec ?? null, format, quality);

  // ---------- actions ----------
  const pickVideo = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsEditing: false,
      quality: 1,
    });
    if (res.canceled || !res.assets?.length) return;

    const a = res.assets[0];
    setVideo({
      uri: a.uri,
      name: a.fileName ?? a.uri.split('/').pop() ?? 'video.mp4',
      sizeBytes: a.fileSize ?? null,
      durationSec: a.duration ? a.duration / 1000 : null,
    });
    setFileName(stripExtension(a.fileName ?? a.uri.split('/').pop() ?? 'audio'));
    setResult(null);
    setStatus('idle');
  };

  const handleExtract = async () => {
    if (!video) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('working');

    try {
      const audio = await extractAudio(
  video.uri,
  fileName || stripExtension(video.name),
  format,
  quality,
  controller.signal
);
      setResult(audio);
      setStatus('done');
      showToast({ variant: 'success', message: 'Audio extracted successfully' });
    } catch (e) {
      setStatus('idle');
      if (!controller.signal.aborted) {
        showDialog({
          variant: 'error',
          title: "Couldn't extract audio",
          message: e instanceof Error ? e.message : 'Something went wrong. Please try again.',
        });
      }
    }
  };

  const handleCancel = async () => {
    const yes = await confirm({
      title: 'Stop extracting?',
      message: 'The audio file will not be created.',
      confirmLabel: 'Stop',
      cancelLabel: 'Keep going',
      destructive: true,
    });
    if (yes) abortRef.current?.abort();
  };

  const handleSave = async () => {
    if (!result) return;
    setBusy('save');
    try {
      await saveToGallery(result.uri);
      showToast({ variant: 'success', message: 'Saved to your Music' });
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
      await Sharing.shareAsync(result.uri, { dialogTitle: 'Share audio' });
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
    setFileName('');
    setVideo(null);
    setResult(null);
    setStatus('idle');
  };

  // ---------- UI ----------
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ToolHeader title="Extract Audio" />

      <ScrollView
  contentContainerStyle={styles.content}
  keyboardShouldPersistTaps="handled"
  showsVerticalScrollIndicator={false}
>
        {/* Video picker */}
        <Text style={styles.sectionLabel}>Video</Text>

        {!video ? (
          <Pressable
            onPress={pickVideo}
            style={({ pressed }) => [styles.dropzone, pressed && { opacity: 0.8 }]}
          >
            <View style={styles.dropIcon}>
              <Ionicons name="videocam-outline" size={30} color={ACCENT} />
            </View>
            <Text style={styles.dropTitle}>Choose a video</Text>
            <Text style={styles.dropHint}>Pick any video from your gallery</Text>
            <View style={styles.browseButton}>
              <Text style={styles.browseText}>Browse videos</Text>
            </View>
          </Pressable>
        ) : (
          <View style={styles.videoCard}>
            <View style={styles.videoIcon}>
              <Ionicons name="film" size={24} color={ACCENT} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.videoName} numberOfLines={1}>
                {video.name}
              </Text>
              <Text style={styles.videoMeta}>
                {[
                  video.durationSec ? formatDuration(video.durationSec) : null,
                  video.sizeBytes ? formatBytes(video.sizeBytes) : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'Video selected'}
              </Text>
            </View>
            {!working && (
              <Pressable onPress={pickVideo} style={styles.changeButton} hitSlop={6}>
                <Text style={styles.changeText}>Change</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Options */}
        {video && status !== 'done' && (
          <>
            <Text style={styles.sectionLabel}>Format</Text>
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
                    <Text style={[styles.formatLabel, active && { color: ACCENT }]}>{f.label}</Text>
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

            {format !== 'wav' && (
              <>
                <Text style={styles.sectionLabel}>Quality</Text>
                <View style={styles.chipRow}>
                  {QUALITIES.map((q) => {
                    const active = quality === q.key;
                    return (
                      <Pressable
                        key={q.key}
                        onPress={() => setQuality(q.key)}
                        disabled={working}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, active && { color: '#fff' }]}>{q.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            {estimate && (
              <View style={styles.estimate}>
                <Ionicons name="information-circle-outline" size={16} color={colors.muted} />
                <Text style={styles.estimateText}>Estimated file size: about {formatBytes(estimate)}</Text>
              </View>
            )}
            <Text style={styles.sectionLabel}>Save as</Text>
<FileNameInput
  value={fileName}
  onChangeText={setFileName}
  extension={format}
  defaultValue={stripExtension(video.name)}
  editable={!working}
  accent={ACCENT}
/>
          </>
        )}

        {/* Result */}
        {status === 'done' && result && (
          <View style={styles.resultCard}>
            <View style={styles.resultIcon}>
              <Ionicons name="musical-notes" size={34} color="#fff" />
            </View>
            <Text style={styles.resultTitle}>Your audio is ready</Text>
            <Text style={styles.resultName} numberOfLines={2}>
              {result.name}
            </Text>
            <View style={styles.resultBadges}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{result.format.toUpperCase()}</Text>
              </View>
              {result.sizeBytes > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{formatBytes(result.sizeBytes)}</Text>
                </View>
              )}
            </View>
            <Pressable onPress={handleReset} hitSlop={8} style={{ marginTop: 18 }}>
              <Text style={styles.linkText}>Extract from another video</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* Footer */}
      {video && (
        <View style={styles.footer}>
          {working ? (
            <View>
              <View style={styles.workingTop}>
                <Text style={styles.workingTitle}>Extracting audio…</Text>
                <Pressable onPress={handleCancel} hitSlop={8}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
              </View>
              <IndeterminateBar />
              <Text style={styles.workingHint}>Longer videos take a bit more time</Text>
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
              label={`Extract ${format.toUpperCase()}`}
              icon="musical-notes-outline"
              color={ACCENT}
              onPress={handleExtract}
            />
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

// Animated "working" bar for tasks without exact progress
function IndeterminateBar() {
  const x = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(x, {
        toValue: 1,
        duration: 1200,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [x]);

  const barWidth = width * 0.35;

  return (
    <View style={styles.track} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Animated.View
        style={[
          styles.indeterminate,
          {
            width: barWidth,
            transform: [
              { translateX: x.interpolate({ inputRange: [0, 1], outputRange: [-barWidth, width] }) },
            ],
          },
        ]}
      />
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

  videoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    ...shadow,
  },
  videoIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: ACCENT + '1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoName: { fontSize: 15, fontWeight: '700', color: colors.text },
  videoMeta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  changeButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  changeText: { fontSize: 13, fontWeight: '700', color: colors.text },

  formatRow: { flexDirection: 'row', gap: 10 },
  formatCard: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
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

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.text },

  estimate: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16 },
  estimateText: { fontSize: 13, color: colors.muted },

  resultCard: {
    marginTop: 20,
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
  resultBadges: { flexDirection: 'row', gap: 8, marginTop: 14 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: ACCENT + '1A',
  },
  badgeText: { fontSize: 12.5, fontWeight: '700', color: ACCENT },
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
  workingTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  workingTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  workingHint: { fontSize: 12.5, color: colors.muted, marginTop: 8 },
  cancelText: { color: '#DC2626', fontWeight: '700', fontSize: 14 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' },
  indeterminate: { height: '100%', borderRadius: 4, backgroundColor: ACCENT },
});