import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFeedback } from '../../components/Feedback';
import { KeyboardScroll } from '../../components/KeyboardScroll';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ToolHeader } from '../../components/ToolHeader';
import { colors, radius, shadow } from '../../constants/theme';
import {
  downloadMedia,
  fetchVideoInfo,
  MediaFormat,
  MediaType,
  VideoInfo,
} from '../../services/videoDownloader';
import { formatBytes, formatDuration } from '../../utils/format';
const ACCENT = '#6366F1';

type Status = 'idle' | 'fetching' | 'ready' | 'downloading' | 'done';

export default function VideoDownloaderScreen() {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [tab, setTab] = useState<MediaType>('video');
  const [selected, setSelected] = useState<MediaFormat | null>(null);
  const [progress, setProgress] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
       const { showToast, confirm } = useFeedback();
  const busy = status === 'fetching' || status === 'downloading';
  const formats = info?.formats.filter((f) => f.type === tab) ?? [];
  const hasVideo = !!info?.formats.some((f) => f.type === 'video');
  const hasAudio = !!info?.formats.some((f) => f.type === 'audio');

  // ---------- actions ----------
  const handleUrlChange = (text: string) => {
    setUrl(text);
    setError(null);
    if (info) {
      setInfo(null);
      setSelected(null);
      setStatus('idle');
    }
  };

  const handlePaste = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) handleUrlChange(text.trim());
  };

  const handleFetch = async () => {
    setError(null);
    setStatus('fetching');
    try {
      const data = await fetchVideoInfo(url.trim());
      const firstType: MediaType = data.formats.some((f) => f.type === 'video') ? 'video' : 'audio';
      setInfo(data);
      setTab(firstType);
      setSelected(data.formats.find((f) => f.type === firstType) ?? null);
      setStatus('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setStatus('idle');
    }
  };

  const handleTab = (type: MediaType) => {
    setTab(type);
    setSelected(info?.formats.find((f) => f.type === type) ?? null);
    if (status === 'done') setStatus('ready');
  };

  const handleSelect = (format: MediaFormat) => {
    setSelected(format);
    if (status === 'done') setStatus('ready');
  };

 const handleDownload = async () => {
  if (!info || !selected) return;
  const controller = new AbortController();
  abortRef.current = controller;
  setError(null);
  setProgress(0);
  setStatus('downloading');

  try {
    await downloadMedia(info, selected, setProgress, controller.signal);
    setStatus('done');
    showToast({ variant: 'success', message: 'Saved to your gallery' });
  } catch (e) {
    if (!controller.signal.aborted) {
      setError(e instanceof Error ? e.message : 'Download failed');
    }
    setStatus('ready');
  }
};

   const handleCancel = async () => {
     const yes = await confirm({
       title: 'Cancel download?',
       message: 'The progress so far will be lost.',
       confirmLabel: 'Yes, cancel',
       cancelLabel: 'Keep going',
       destructive: true,
     });
     if (yes) abortRef.current?.abort();
   };

  const handleReset = () => {
    setUrl('');
    setInfo(null);
    setSelected(null);
    setProgress(0);
    setError(null);
    setStatus('idle');
  };

  // ---------- UI ----------
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ToolHeader title="Video Downloader" />

      <KeyboardScroll
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Link input */}
        <Text style={styles.sectionLabel}>Video link</Text>
        <View style={styles.inputCard}>
          <Ionicons name="link-outline" size={20} color={colors.muted} />
          <TextInput
            value={url}
            onChangeText={handleUrlChange}
            placeholder="Paste video link here"
            placeholderTextColor={colors.muted}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            editable={!busy}
            returnKeyType="go"
            onSubmitEditing={() => url.trim() && !busy && handleFetch()}
          />
          {url.length > 0 && !busy && (
            <Pressable onPress={() => handleUrlChange('')} hitSlop={8}>
              <Ionicons name="close-circle" size={20} color={colors.muted} />
            </Pressable>
          )}
          <Pressable onPress={handlePaste} disabled={busy} style={styles.pasteButton}>
            <Ionicons name="clipboard-outline" size={16} color={ACCENT} />
            <Text style={styles.pasteText}>Paste</Text>
          </Pressable>
        </View>

        {/* Fetch button (only before details are loaded) */}
        {!info && (
          <View style={{ marginTop: 14 }}>
            <PrimaryButton
              label={status === 'fetching' ? 'Fetching details…' : 'Fetch'}
              icon="search"
              color={ACCENT}
              loading={status === 'fetching'}
              disabled={!url.trim()}
              onPress={handleFetch}
            />
          </View>
        )}

        {/* Error */}
        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color="#DC2626" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Empty state */}
        {!info && status === 'idle' && !error && (
          <View style={styles.hint}>
            <Ionicons name="information-circle-outline" size={18} color={colors.muted} />
            <Text style={styles.hintText}>
              Copy a video link from any app, tap Paste, then Fetch to see the available qualities.
            </Text>
          </View>
        )}

        {/* Video details */}
        {info && (
          <>
            <View style={styles.previewCard}>
              <View>
                <Image source={{ uri: info.thumbnail }} style={styles.thumbnail} />
                {info.durationSec > 0 && (
  <View style={styles.durationBadge}>
    <Text style={styles.durationText}>{formatDuration(info.durationSec)}</Text>
  </View>
)}

              </View>
              <View style={styles.previewBody}>
                <Text style={styles.previewTitle} numberOfLines={2}>
                  {info.title}
                </Text>
                <Text style={styles.previewMeta}>
                  {info.author} · {info.source}
                </Text>
              </View>
            </View>

            {/* Video / Audio tabs */}
            {hasVideo && hasAudio && (
              <View style={styles.tabs}>
                {(['video', 'audio'] as MediaType[]).map((type) => {
                  const active = tab === type;
                  return (
                    <Pressable
                      key={type}
                      onPress={() => handleTab(type)}
                      disabled={busy}
                      style={[styles.tab, active && styles.tabActive]}
                    >
                      <Ionicons
                        name={type === 'video' ? 'videocam' : 'musical-notes'}
                        size={16}
                        color={active ? ACCENT : colors.muted}
                      />
                      <Text style={[styles.tabText, active && styles.tabTextActive]}>
                        {type === 'video' ? 'Video' : 'Audio only'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Quality list */}
            <Text style={styles.sectionLabel}>Choose quality</Text>
            <View style={{ gap: 10 }}>
              {formats.map((f) => {
                const active = selected?.id === f.id;
                return (
                  <Pressable
                    key={f.id}
                    onPress={() => handleSelect(f)}
                    disabled={busy}
                    style={[styles.qualityRow, active && styles.qualityRowActive]}
                  >
                    <View style={[styles.qualityIcon, { backgroundColor: ACCENT + (active ? '24' : '12') }]}>
                      <Ionicons
                        name={f.type === 'video' ? 'film-outline' : 'musical-note-outline'}
                        size={20}
                        color={ACCENT}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.qualityTop}>
                        <Text style={styles.qualityLabel}>{f.label}</Text>
                        {f.note && (
                          <View style={styles.badge}>
                            <Text style={styles.badgeText}>{f.note}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.qualityMeta}>
                        {f.ext.toUpperCase()} · {f.sizeBytes ? formatBytes(f.sizeBytes) : 'Size unknown'}
                      </Text>
                    </View>
                    <Ionicons
                      name={active ? 'radio-button-on' : 'radio-button-off'}
                      size={22}
                      color={active ? ACCENT : colors.border}
                    />
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </KeyboardScroll>

      {/* Bottom bar */}
      {info && selected && (
        <View style={styles.footer}>
          {status === 'downloading' ? (
            <View>
              <View style={styles.progressTop}>
                <Text style={styles.progressTitle}>
  {progress === 0 ? 'Preparing…' : `Downloading ${selected.label}…`}
</Text>
                <Pressable onPress={handleCancel} hitSlop={8}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` as const }]} />
              </View>
              <View style={styles.progressBottom}>
                <Text style={styles.progressMeta}>
                  {selected.sizeBytes
                    ? `${formatBytes(selected.sizeBytes * progress)} of ${formatBytes(selected.sizeBytes)}`
                    : 'Downloading'}
                </Text>
                <Text style={styles.progressPct}>{Math.round(progress * 100)}%</Text>
              </View>
            </View>
          ) : status === 'done' ? (
            <View style={{ gap: 12 }}>
              <View style={styles.successRow}>
                <Ionicons name="checkmark-circle" size={26} color="#10B981" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.successTitle}>Download complete</Text>
                  <Text style={styles.successText}>Saved to your phone</Text>
                </View>
              </View>
              <PrimaryButton label="Download another video" variant="outline" color={ACCENT} onPress={handleReset} />
            </View>
          ) : (
            <PrimaryButton
              label={`Download ${selected.label} · ${selected.ext.toUpperCase()}`}
              icon="download-outline"
              color={ACCENT}
              onPress={handleDownload}
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
    fontSize: 13, fontWeight: '700', color: colors.muted, textTransform: 'uppercase',
    letterSpacing: 0.8, marginTop: 20, marginBottom: 10,
  },

  inputCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10, height: 56, paddingLeft: 14, paddingRight: 6,
    backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  input: { flex: 1, fontSize: 15, color: colors.text },
  pasteButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 42, paddingHorizontal: 12,
    borderRadius: radius.sm, backgroundColor: ACCENT + '1A',
  },
  pasteText: { color: ACCENT, fontWeight: '700', fontSize: 14 },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, padding: 12,
    borderRadius: radius.sm, backgroundColor: '#FEF2F2',
  },
  errorText: { flex: 1, color: '#B91C1C', fontSize: 13.5 },

  hint: { flexDirection: 'row', gap: 8, marginTop: 18, paddingHorizontal: 4 },
  hintText: { flex: 1, color: colors.muted, fontSize: 13.5, lineHeight: 20 },

  previewCard: {
    marginTop: 20, backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', ...shadow,
  },
  thumbnail: { width: '100%', aspectRatio: 16 / 9, backgroundColor: colors.border },
  durationBadge: {
    position: 'absolute', right: 10, bottom: 10, backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  durationText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  previewBody: { padding: 14 },
  previewTitle: { fontSize: 16, fontWeight: '700', color: colors.text, lineHeight: 22 },
  previewMeta: { fontSize: 13, color: colors.muted, marginTop: 4 },

  tabs: {
    flexDirection: 'row', marginTop: 20, padding: 4, borderRadius: radius.md, backgroundColor: colors.border + '99',
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    height: 42, borderRadius: radius.sm,
  },
  tabActive: { backgroundColor: colors.surface, ...shadow },
  tabText: { fontSize: 14, fontWeight: '600', color: colors.muted },
  tabTextActive: { color: colors.text },

  qualityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
    backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.surface,
  },
  qualityRowActive: { borderColor: ACCENT, backgroundColor: ACCENT + '08' },
  qualityIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  qualityTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qualityLabel: { fontSize: 15.5, fontWeight: '700', color: colors.text },
  qualityMeta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  badge: { backgroundColor: ACCENT + '1A', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  badgeText: { color: ACCENT, fontSize: 11, fontWeight: '700' },

  footer: {
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8,
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
  },
  progressTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  progressTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  cancelText: { color: '#DC2626', fontWeight: '700', fontSize: 14 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4, backgroundColor: ACCENT },
  progressBottom: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  progressMeta: { fontSize: 13, color: colors.muted },
  progressPct: { fontSize: 13, fontWeight: '700', color: ACCENT },

  successRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  successTitle: { fontSize: 15.5, fontWeight: '700', color: colors.text },
  successText: { fontSize: 13, color: colors.muted, marginTop: 1 },
});