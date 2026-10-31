import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChipGroup } from '../../components/ChipGroup';
import { useFeedback } from '../../components/Feedback';
import { FileNameInput } from '../../components/FileNameInput';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ToolHeader } from '../../components/ToolHeader';
import { colors, radius, shadow } from '../../constants/theme';
import { CutFormat, CutResult, cutAudio } from '../../services/audioCutter';
import { getWaveform } from '../../services/ffmpeg';
import { formatBytes, stripExtension } from '../../utils/format';
import { saveToGallery } from '../../utils/media';

const ACCENT = '#059669';
const MIN_GAP = 0.5; // shortest clip in seconds
const BARS = 100;
const WAVE_HEIGHT = 96;

type Status = 'idle' | 'working' | 'done';
type Fade = '0' | '1' | '2' | '3';
type Bitrate = '128' | '192' | '320';
type PickedAudio = { uri: string; name: string; sizeBytes: number | null };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

/** 75.34 -> "1:15.3" */
function fmt(sec: number) {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(1).padStart(4, '0')}`;
}

export default function AudioCutterScreen() {
  const { showToast, showDialog, confirm } = useFeedback();

  const [audio, setAudio] = useState<PickedAudio | null>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [fadeIn, setFadeIn] = useState<Fade>('0');
  const [fadeOut, setFadeOut] = useState<Fade>('0');
  const [format, setFormat] = useState<CutFormat>('mp3');
  const [bitrate, setBitrate] = useState<Bitrate>('192');
  const [fileName, setFileName] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<CutResult | null>(null);
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);
  const [dragging, setDragging] = useState(false);
  const [waveWidth, setWaveWidth] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  // ---------- players ----------
  const source = useMemo(() => (audio ? { uri: audio.uri } : null), [audio]);
  const player = useAudioPlayer(source);
  const playerStatus = useAudioPlayerStatus(player);

  const resultSource = useMemo(() => (result ? { uri: result.uri } : null), [result]);
  const resultPlayer = useAudioPlayer(resultSource);
  const resultStatus = useAudioPlayerStatus(resultPlayer);

  const working = status === 'working';
  const selection = end - start;
  const defaultName = audio ? `${stripExtension(audio.name)} (cut)` : '';

  // Set the full track as the selection once the duration is known
  useEffect(() => {
    if (playerStatus.duration > 0 && duration === 0) {
      setDuration(playerStatus.duration);
      setStart(0);
      setEnd(round1(playerStatus.duration));
    }
  }, [playerStatus.duration, duration]);

  // Stop preview playback at the chosen point
  const stopAtRef = useRef<number | null>(null);
  useEffect(() => {
    const id = setInterval(() => {
      const stopAt = stopAtRef.current;
      if (stopAt !== null && player.playing && player.currentTime >= stopAt) {
        player.pause();
        stopAtRef.current = null;
      }
    }, 50);
    return () => clearInterval(id);
  }, [player]);

  // ---------- drag handles ----------
  const live = useRef({ start: 0, end: 0, duration: 0, width: 0, origin: 0 });
  const playerRef = useRef(player);
  useEffect(() => {
    live.current.start = start;
    live.current.end = end;
    live.current.duration = duration;
    live.current.width = waveWidth;
    playerRef.current = player;
  });

  const makePan = (which: 'start' | 'end') =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        live.current.origin = which === 'start' ? live.current.start : live.current.end;
        playerRef.current.pause();
        stopAtRef.current = null;
        setDragging(true);
      },
      onPanResponderMove: (_, g) => {
        const { duration: d, width: w, origin } = live.current;
        if (!d || !w) return;
        const t = origin + (g.dx / w) * d;
        if (which === 'start') setStart(round1(clamp(t, 0, live.current.end - MIN_GAP)));
        else setEnd(round1(clamp(t, live.current.start + MIN_GAP, d)));
      },
      onPanResponderRelease: () => setDragging(false),
      onPanResponderTerminate: () => setDragging(false),
    });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const startPan = useMemo(() => makePan('start'), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const endPan = useMemo(() => makePan('end'), []);

  // ---------- actions ----------
  const pickAudio = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];

    player.pause();
    setAudio({ uri: a.uri, name: a.name ?? 'audio', sizeBytes: a.size ?? null });
    setFileName(`${stripExtension(a.name ?? 'audio')} (cut)`);
    setDuration(0);
    setStart(0);
    setEnd(0);
    setResult(null);
    setStatus('idle');
    setPeaks(null);

    try {
      setPeaks(await getWaveform(a.uri, BARS));
    } catch {
      setPeaks(Array.from({ length: BARS }, () => 0.5)); // flat fallback
    }
  };

  const playRange = async (from: number, to: number) => {
    await player.seekTo(from);
    stopAtRef.current = to;
    player.play();
  };

  const togglePlaySelection = () => {
    if (playerStatus.playing) {
      player.pause();
      stopAtRef.current = null;
    } else {
      playRange(start, end);
    }
  };

  const seekTo = async (t: number) => {
    stopAtRef.current = end;
    await player.seekTo(clamp(t, 0, duration));
    player.play();
  };

  const nudge = (which: 'start' | 'end', delta: number) => {
    if (which === 'start') setStart((v) => round1(clamp(v + delta, 0, end - MIN_GAP)));
    else setEnd((v) => round1(clamp(v + delta, start + MIN_GAP, duration)));
  };

  const setFromPlayhead = (which: 'start' | 'end') => {
    const t = round1(player.currentTime);
    if (which === 'start') setStart(clamp(t, 0, end - MIN_GAP));
    else setEnd(clamp(t, start + MIN_GAP, duration));
  };

  const handleCut = async () => {
    if (!audio) return;
    player.pause();
    stopAtRef.current = null;
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('working');
    setProgress(0);

    try {
      const res = await cutAudio(
        audio.uri,
        {
          start,
          end,
          fadeIn: Number(fadeIn),
          fadeOut: Number(fadeOut),
          format,
          bitrate: Number(bitrate),
        },
        fileName || defaultName,
        setProgress,
        controller.signal
      );
      setResult(res);
      setStatus('done');
      showToast({ variant: 'success', message: 'Your clip is ready' });
    } catch (e) {
      setStatus('idle');
      if (!controller.signal.aborted) {
        showDialog({
          variant: 'error',
          title: "Couldn't cut audio",
          message: e instanceof Error ? e.message : 'Something went wrong. Please try again.',
        });
      }
    }
  };

  const handleCancel = async () => {
    const yes = await confirm({
      title: 'Stop cutting?',
      confirmLabel: 'Stop',
      cancelLabel: 'Keep going',
      destructive: true,
    });
    if (yes) abortRef.current?.abort();
  };

  const toggleResult = async () => {
    if (resultStatus.playing) {
      resultPlayer.pause();
      return;
    }
    if (resultStatus.duration > 0 && resultStatus.currentTime >= resultStatus.duration - 0.1) {
      await resultPlayer.seekTo(0);
    }
    resultPlayer.play();
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

  const backToEdit = () => {
    resultPlayer.pause();
    setStatus('idle');
  };

  // ---------- positions ----------
  const x = (t: number) => (duration ? (t / duration) * waveWidth : 0);
  const startX = x(start);
  const endX = x(end);
  const playheadX = x(playerStatus.currentTime);
  const showPlayhead = duration > 0 && (playerStatus.playing || playerStatus.currentTime > 0);

  // ---------- UI ----------
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ToolHeader title="Audio Cutter" />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        scrollEnabled={!dragging}
      >
        {!audio ? (
          <Pressable onPress={pickAudio} style={({ pressed }) => [styles.dropzone, pressed && { opacity: 0.8 }]}>
            <View style={styles.dropIcon}>
              <Ionicons name="cut-outline" size={30} color={ACCENT} />
            </View>
            <Text style={styles.dropTitle}>Choose a song</Text>
            <Text style={styles.dropHint}>MP3, M4A, WAV, AAC, OGG and more</Text>
            <View style={styles.browseButton}>
              <Text style={styles.browseText}>Browse files</Text>
            </View>
          </Pressable>
        ) : status === 'done' && result ? (
          /* ---------- Result ---------- */
          <View style={styles.resultCard}>
            <Pressable onPress={toggleResult} style={styles.resultPlay}>
              <Ionicons name={resultStatus.playing ? 'pause' : 'play'} size={34} color="#fff" />
            </Pressable>
            <Text style={styles.resultTitle}>Your clip is ready</Text>
            <Text style={styles.resultName} numberOfLines={2}>
              {result.name}
            </Text>
            <View style={styles.resultTrack}>
              <View
                style={[
                  styles.resultFill,
                  {
                    width: `${
                      resultStatus.duration ? Math.min(100, (resultStatus.currentTime / resultStatus.duration) * 100) : 0
                    }%` as const,
                  },
                ]}
              />
            </View>
            <View style={styles.badges}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{fmt(result.durationSec)}</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{format.toUpperCase()}</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{formatBytes(result.sizeBytes)}</Text>
              </View>
            </View>
            <View style={styles.links}>
              <Pressable onPress={backToEdit} hitSlop={8}>
                <Text style={styles.linkText}>Adjust cut</Text>
              </Pressable>
              <Text style={{ color: colors.muted }}>•</Text>
              <Pressable onPress={pickAudio} hitSlop={8}>
                <Text style={styles.linkText}>New song</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <>
            {/* ---------- Track ---------- */}
            <View style={styles.trackCard}>
              <View style={styles.trackIcon}>
                <Ionicons name="musical-notes" size={22} color={ACCENT} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.trackName} numberOfLines={1}>
                  {audio.name}
                </Text>
                <Text style={styles.trackMeta}>
                  {[duration ? fmt(duration) : 'Loading…', audio.sizeBytes ? formatBytes(audio.sizeBytes) : null]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              {!working && (
                <Pressable onPress={pickAudio} style={styles.changeButton} hitSlop={6}>
                  <Text style={styles.changeText}>Change</Text>
                </Pressable>
              )}
            </View>

            {/* ---------- Waveform editor ---------- */}
            <View style={styles.editorCard}>
              <View style={styles.selectionRow}>
                <Text style={styles.selectionLabel}>Selection</Text>
                <View style={styles.selectionPill}>
                  <Text style={styles.selectionText}>{fmt(selection)}</Text>
                </View>
              </View>

              <Pressable
                onLayout={(e) => setWaveWidth(e.nativeEvent.layout.width)}
                onPress={(e) => duration && seekTo((e.nativeEvent.locationX / waveWidth) * duration)}
                disabled={working || !duration}
                style={styles.wave}
              >
                {/* bars */}
                <View style={styles.bars} pointerEvents="none">
                  {(peaks ?? Array.from({ length: BARS }, () => 0.15)).map((p, i) => {
                    const t = ((i + 0.5) / BARS) * duration;
                    const inside = duration > 0 && t >= start && t <= end;
                    return (
                      <View
                        key={i}
                        style={[
                          styles.bar,
                          {
                            height: Math.max(3, p * (WAVE_HEIGHT - 12)),
                            backgroundColor: !peaks ? colors.border : inside ? ACCENT : '#CBD5E1',
                          },
                        ]}
                      />
                    );
                  })}
                </View>

                {/* dim outside the selection */}
                {duration > 0 && (
                  <>
                    <View pointerEvents="none" style={[styles.dim, { left: 0, width: startX }]} />
                    <View pointerEvents="none" style={[styles.dim, { left: endX, right: 0 }]} />
                  </>
                )}

                {/* playhead */}
                {showPlayhead && <View pointerEvents="none" style={[styles.playhead, { left: playheadX - 1 }]} />}

                {/* handles */}
                {duration > 0 && (
                  <>
                    <View {...startPan.panHandlers} style={[styles.handle, { left: startX - 14 }]}>
                      <View style={styles.handleLine} />
                      <View style={styles.handleGrip}>
                        <View style={styles.gripLine} />
                        <View style={styles.gripLine} />
                      </View>
                    </View>
                    <View {...endPan.panHandlers} style={[styles.handle, { left: endX - 14 }]}>
                      <View style={styles.handleLine} />
                      <View style={styles.handleGrip}>
                        <View style={styles.gripLine} />
                        <View style={styles.gripLine} />
                      </View>
                    </View>
                  </>
                )}
              </Pressable>

              <View style={styles.ruler}>
                <Text style={styles.rulerText}>0:00</Text>
                <Text style={styles.rulerText}>{peaks ? 'Tap to listen · drag handles' : 'Reading audio…'}</Text>
                <Text style={styles.rulerText}>{fmt(duration)}</Text>
              </View>

              {/* transport */}
              <View style={styles.transport}>
                <Pressable
                  onPress={() => playRange(start, Math.min(end, start + 3))}
                  disabled={working || !duration}
                  style={styles.smallButton}
                >
                  <Ionicons name="play-skip-back-outline" size={16} color={colors.text} />
                  <Text style={styles.smallButtonText}>First 3s</Text>
                </Pressable>

                <Pressable
                  onPress={togglePlaySelection}
                  disabled={working || !duration}
                  style={({ pressed }) => [styles.playButton, pressed && { opacity: 0.85 }]}
                >
                  <Ionicons name={playerStatus.playing ? 'pause' : 'play'} size={28} color="#fff" />
                </Pressable>

                <Pressable
                  onPress={() => playRange(Math.max(start, end - 3), end)}
                  disabled={working || !duration}
                  style={styles.smallButton}
                >
                  <Text style={styles.smallButtonText}>Last 3s</Text>
                  <Ionicons name="play-skip-forward-outline" size={16} color={colors.text} />
                </Pressable>
              </View>
            </View>

            {/* ---------- Precise start / end ---------- */}
            <View style={styles.timeRow}>
              <TimeControl
                label="Start"
                value={fmt(start)}
                disabled={working || !duration}
                onMinus={() => nudge('start', -0.1)}
                onPlus={() => nudge('start', 0.1)}
                onSetNow={() => setFromPlayhead('start')}
              />
              <TimeControl
                label="End"
                value={fmt(end)}
                disabled={working || !duration}
                onMinus={() => nudge('end', -0.1)}
                onPlus={() => nudge('end', 0.1)}
                onSetNow={() => setFromPlayhead('end')}
              />
            </View>

            {/* ---------- Options ---------- */}
            <Text style={styles.sectionLabel}>Options</Text>
            <View style={styles.optionsCard}>
              <ChipGroup<Fade>
                label="Fade in"
                value={fadeIn}
                onChange={setFadeIn}
                disabled={working}
                accent={ACCENT}
                options={[
                  { key: '0', label: 'Off' },
                  { key: '1', label: '1s' },
                  { key: '2', label: '2s' },
                  { key: '3', label: '3s' },
                ]}
              />
              <ChipGroup<Fade>
                label="Fade out"
                value={fadeOut}
                onChange={setFadeOut}
                disabled={working}
                accent={ACCENT}
                options={[
                  { key: '0', label: 'Off' },
                  { key: '1', label: '1s' },
                  { key: '2', label: '2s' },
                  { key: '3', label: '3s' },
                ]}
              />
              <ChipGroup<CutFormat>
                label="Format"
                value={format}
                onChange={setFormat}
                disabled={working}
                accent={ACCENT}
                last={format === 'wav'}
                options={[
                  { key: 'mp3', label: 'MP3' },
                  { key: 'm4a', label: 'M4A' },
                  { key: 'wav', label: 'WAV' },
                ]}
              />
              {format !== 'wav' && (
                <ChipGroup<Bitrate>
                  label="Quality"
                  value={bitrate}
                  onChange={setBitrate}
                  disabled={working}
                  accent={ACCENT}
                  last
                  options={[
                    { key: '128', label: '128 kbps' },
                    { key: '192', label: '192 kbps' },
                    { key: '320', label: '320 kbps' },
                  ]}
                />
              )}
            </View>

            <Text style={styles.sectionLabel}>Save as</Text>
            <FileNameInput
              value={fileName}
              onChangeText={setFileName}
              extension={format}
              defaultValue={defaultName}
              editable={!working}
              accent={ACCENT}
            />
          </>
        )}
      </ScrollView>

      {/* ---------- Footer ---------- */}
      {audio && (
        <View style={styles.footer}>
          {working ? (
            <View>
              <View style={styles.progressTop}>
                <Text style={styles.progressTitle}>Cutting… {Math.round(progress * 100)}%</Text>
                <Pressable onPress={handleCancel} hitSlop={8}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
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
              label={duration ? `Cut ${fmt(selection)} clip` : 'Loading…'}
              icon="cut-outline"
              color={ACCENT}
              disabled={!duration || selection < MIN_GAP}
              onPress={handleCut}
            />
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

function TimeControl({
  label,
  value,
  disabled,
  onMinus,
  onPlus,
  onSetNow,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onMinus: () => void;
  onPlus: () => void;
  onSetNow: () => void;
}) {
  return (
    <View style={styles.timeCard}>
      <Text style={styles.timeLabel}>{label}</Text>
      <View style={styles.timeValueRow}>
        <Pressable onPress={onMinus} disabled={disabled} style={styles.nudge} hitSlop={4}>
          <Ionicons name="remove" size={18} color={colors.text} />
        </Pressable>
        <Text style={styles.timeValue}>{value}</Text>
        <Pressable onPress={onPlus} disabled={disabled} style={styles.nudge} hitSlop={4}>
          <Ionicons name="add" size={18} color={colors.text} />
        </Pressable>
      </View>
      <Pressable onPress={onSetNow} disabled={disabled} hitSlop={6}>
        <Text style={styles.setNow}>Set to playhead</Text>
      </Pressable>
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

  trackCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    ...shadow,
  },
  trackIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: ACCENT + '1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackName: { fontSize: 15, fontWeight: '700', color: colors.text },
  trackMeta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  changeButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  changeText: { fontSize: 13, fontWeight: '700', color: colors.text },

  editorCard: {
    marginTop: 14,
    padding: 16,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    ...shadow,
  },
  selectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  selectionLabel: { fontSize: 14, fontWeight: '700', color: colors.text },
  selectionPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: ACCENT + '1A' },
  selectionText: { fontSize: 13, fontWeight: '800', color: ACCENT, fontVariant: ['tabular-nums'] },

  wave: { height: WAVE_HEIGHT, justifyContent: 'center' },
  bars: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bar: { width: 2, borderRadius: 1 },
  dim: { position: 'absolute', top: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.55)' },
  playhead: { position: 'absolute', top: -4, bottom: -4, width: 2, backgroundColor: '#0F172A', borderRadius: 1 },
  handle: { position: 'absolute', top: -8, bottom: -8, width: 28, alignItems: 'center', justifyContent: 'center' },
  handleLine: { position: 'absolute', top: 0, bottom: 0, width: 3, borderRadius: 2, backgroundColor: ACCENT },
  handleGrip: {
    width: 16,
    height: 32,
    borderRadius: 8,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 3,
    borderWidth: 2,
    borderColor: '#fff',
  },
  gripLine: { width: 1.5, height: 12, borderRadius: 1, backgroundColor: '#fff' },

  ruler: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  rulerText: { fontSize: 11.5, color: colors.muted, fontVariant: ['tabular-nums'] },

  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  playButton: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  smallButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  smallButtonText: { fontSize: 13, fontWeight: '700', color: colors.text },

  timeRow: { flexDirection: 'row', gap: 12, marginTop: 14 },
  timeCard: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    ...shadow,
  },
  timeLabel: { fontSize: 12, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  timeValueRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  timeValue: { fontSize: 18, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'], minWidth: 64, textAlign: 'center' },
  nudge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  setNow: { fontSize: 12.5, fontWeight: '700', color: ACCENT, marginTop: 10 },

  optionsCard: { backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: 16, ...shadow },

  resultCard: {
    marginTop: 12,
    padding: 24,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    ...shadow,
  },
  resultPlay: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  resultTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  resultName: { fontSize: 14, color: colors.muted, marginTop: 6, textAlign: 'center' },
  resultTrack: {
    alignSelf: 'stretch',
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginTop: 16,
  },
  resultFill: { height: '100%', backgroundColor: ACCENT },
  badges: { flexDirection: 'row', gap: 8, marginTop: 14 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: ACCENT + '1A' },
  badgeText: { fontSize: 12.5, fontWeight: '700', color: ACCENT },
  links: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18 },
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
  progressTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  progressTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  cancelText: { color: '#DC2626', fontWeight: '700', fontSize: 14 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4, backgroundColor: ACCENT },
});
