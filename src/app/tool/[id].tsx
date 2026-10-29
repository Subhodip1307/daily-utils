import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFeedback } from '../../components/Feedback';
import { colors, radius, shadow } from '../../constants/theme';
import { TOOLS, Tool } from '../../constants/tools';

const INPUT_LABEL = {
  url: 'Video link',
  video: 'Video',
  audio: 'Audio',
  image: 'Image',
  images: 'Images',
  text: 'Content',
} as const;

const PICKER = {
  video: { icon: 'videocam-outline', title: 'Choose a video', hint: 'MP4, MOV, MKV and more' },
  audio: { icon: 'musical-note-outline', title: 'Choose an audio file', hint: 'MP3, M4A, WAV, AAC' },
  image: { icon: 'image-outline', title: 'Choose a photo', hint: 'JPG, PNG, WEBP, HEIC' },
  images: { icon: 'images-outline', title: 'Choose photos', hint: 'Select one or more images' },
} as const;

// Fake waveform bar heights (just for the design)
const BARS = Array.from({ length: 42 }, (_, i) => 0.25 + Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.23)) * 0.75);

export default function ToolScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tool = TOOLS.find((t) => t.id === id);

  if (!tool) {
    return (
      <SafeAreaView style={[styles.safe, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={styles.heroText}>Tool not found</Text>
      </SafeAreaView>
    );
  }

  return <ToolView tool={tool} />;
}

function ToolView({ tool }: { tool: Tool }) {
  const [chips, setChips] = useState<Record<string, string>>({});
  const [toggles, setToggles] = useState<Record<string, boolean>>({});
  const [text, setText] = useState('');

  const { showDialog } = useFeedback();

   const handleStart = () => {
     showDialog({
       variant: 'info',
       title: 'Coming soon',
       message: `${tool.title} is being built and will arrive in the next update.`,
       confirmLabel: 'Got it',
     });
   };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{tool.title}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={[styles.heroIcon, { backgroundColor: tool.color }]}>
            <Ionicons name={tool.icon} size={30} color="#fff" />
          </View>
          <Text style={styles.heroTitle}>{tool.title}</Text>
          <Text style={styles.heroText}>{tool.description}</Text>
        </View>

        {/* Input */}
        <Text style={styles.sectionLabel}>{INPUT_LABEL[tool.input]}</Text>
        <InputSection tool={tool} text={text} setText={setText} />

        {/* Options */}
        {tool.options.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Options</Text>
            <View style={styles.optionsCard}>
              {tool.options.map((option, index) => (
                <View key={option.key} style={[styles.optionBlock, index > 0 && styles.optionDivider]}>
                  {option.type === 'chips' && (
                    <>
                      <Text style={styles.optionLabel}>{option.label}</Text>
                      <View style={styles.chipRow}>
                        {option.choices.map((choice) => {
                          const active = (chips[option.key] ?? option.choices[0]) === choice;
                          return (
                            <Pressable
                              key={choice}
                              onPress={() => setChips({ ...chips, [option.key]: choice })}
                              style={[styles.chip, active && { backgroundColor: tool.color, borderColor: tool.color }]}
                            >
                              <Text style={[styles.chipText, active && styles.chipTextActive]}>{choice}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </>
                  )}

                  {option.type === 'toggle' && (
                    <View style={styles.toggleRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.toggleLabel}>{option.label}</Text>
                        {option.description && <Text style={styles.toggleDesc}>{option.description}</Text>}
                      </View>
                      <Switch
                        value={!!toggles[option.key]}
                        onValueChange={(v) => setToggles({ ...toggles, [option.key]: v })}
                        trackColor={{ true: tool.color, false: colors.border }}
                        thumbColor="#fff"
                      />
                    </View>
                  )}

                  {option.type === 'timeRange' && <TimeRange label={option.label} color={tool.color} />}
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {/* Bottom action button */}
      <View style={styles.footer}>
        <Pressable
          onPress={handleStart}
          style={({ pressed }) => [styles.primaryButton, { backgroundColor: tool.color }, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.primaryButtonText}>{tool.actionLabel}</Text>
          <Ionicons name="arrow-forward" size={18} color="#fff" />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

type InputProps = { tool: Tool; text: string; setText: (v: string) => void };

function InputSection({ tool, text, setText }: InputProps) {
  if (tool.input === 'url') {
    return (
      <View style={styles.inputCard}>
        <Ionicons name="link-outline" size={20} color={colors.muted} />
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Paste video link here"
          placeholderTextColor={colors.muted}
          style={styles.urlInput}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <Pressable style={[styles.pasteButton, { backgroundColor: tool.color + '1A' }]}>
          <Ionicons name="clipboard-outline" size={16} color={tool.color} />
          <Text style={[styles.pasteText, { color: tool.color }]}>Paste</Text>
        </Pressable>
      </View>
    );
  }

  if (tool.input === 'text') {
    return (
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Enter text, link or phone number"
        placeholderTextColor={colors.muted}
        style={styles.textArea}
        multiline
        textAlignVertical="top"
      />
    );
  }

  const picker = PICKER[tool.input];
  return (
    <Pressable
      style={({ pressed }) => [
        styles.dropzone,
        { borderColor: tool.color + '66', backgroundColor: tool.color + '0D' },
        pressed && { opacity: 0.8 },
      ]}
    >
      <View style={[styles.dropIcon, { backgroundColor: tool.color + '1F' }]}>
        <Ionicons name={picker.icon} size={28} color={tool.color} />
      </View>
      <Text style={styles.dropTitle}>{picker.title}</Text>
      <Text style={styles.dropHint}>{picker.hint}</Text>
      <View style={[styles.browseButton, { borderColor: tool.color }]}>
        <Text style={[styles.browseText, { color: tool.color }]}>Browse files</Text>
      </View>
    </Pressable>
  );
}

function TimeRange({ label, color }: { label: string; color: string }) {
  return (
    <>
      <Text style={styles.optionLabel}>{label}</Text>
      <View style={styles.waveform}>
        {BARS.map((h, i) => (
          <View
            key={i}
            style={[styles.bar, { height: h * 56, backgroundColor: i >= 10 && i <= 30 ? color : colors.border }]}
          />
        ))}
      </View>
      <View style={styles.timeRow}>
        <TimeBox label="Start" value="00:12" />
        <Ionicons name="arrow-forward" size={16} color={colors.muted} />
        <TimeBox label="End" value="00:42" />
      </View>
    </>
  );
}

function TimeBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.timeBox}>
      <Text style={styles.timeLabel}>{label}</Text>
      <Text style={styles.timeValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 8,
  },
  backButton: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center', ...shadow,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },

  content: { padding: 20, paddingBottom: 32 },

  hero: { alignItems: 'center', marginBottom: 8 },
  heroIcon: { width: 68, height: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  heroTitle: { fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  heroText: { fontSize: 14.5, color: colors.muted, textAlign: 'center', marginTop: 6, lineHeight: 21, paddingHorizontal: 10 },

  sectionLabel: {
    fontSize: 13, fontWeight: '700', color: colors.muted, textTransform: 'uppercase',
    letterSpacing: 0.8, marginTop: 24, marginBottom: 10,
  },

  inputCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingLeft: 14, paddingRight: 6, height: 56,
  },
  urlInput: { flex: 1, fontSize: 15, color: colors.text },
  pasteButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 42, borderRadius: radius.sm },
  pasteText: { fontWeight: '700', fontSize: 14 },

  textArea: {
    minHeight: 120, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1,
    borderColor: colors.border, padding: 14, fontSize: 15, color: colors.text,
  },

  dropzone: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: radius.lg, paddingVertical: 28, alignItems: 'center' },
  dropIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  dropTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  dropHint: { fontSize: 13, color: colors.muted, marginTop: 4 },
  browseButton: { marginTop: 16, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 9 },
  browseText: { fontWeight: '700', fontSize: 14 },

  optionsCard: { backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: 16, ...shadow },
  optionBlock: { paddingVertical: 16 },
  optionDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  optionLabel: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 12 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background,
  },
  chipText: { fontSize: 13.5, fontWeight: '600', color: colors.text },
  chipTextActive: { color: '#fff' },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  toggleDesc: { fontSize: 12.5, color: colors.muted, marginTop: 2 },

  waveform: {
    height: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.background, borderRadius: radius.sm, paddingHorizontal: 10,
  },
  bar: { width: 3, borderRadius: 2 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  timeBox: {
    flex: 1, backgroundColor: colors.background, borderRadius: radius.sm, paddingVertical: 10, alignItems: 'center',
  },
  timeLabel: { fontSize: 12, color: colors.muted },
  timeValue: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: 2 },

  footer: {
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, backgroundColor: colors.background,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  primaryButton: {
    height: 56, borderRadius: radius.md, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});