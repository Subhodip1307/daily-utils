import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, shadow } from '../constants/theme';
import { CATEGORIES, Tool, TOOLS } from '../constants/tools';

function openTool(id: string) {
  router.push({ pathname: '/tool/[id]', params: { id } });
}

export default function HomeScreen() {
  const [query, setQuery] = useState('');
  const insets = useSafeAreaInsets();
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TOOLS;
    return TOOLS.filter(
      (t) => t.title.toLowerCase().includes(q) || t.subtitle.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Your everyday toolkit</Text>
            <Text style={styles.title}>Daily Utils</Text>
          </View>
          <Pressable style={styles.iconButton}>
            <Ionicons name="settings-outline" size={22} color={colors.text} />
          </Pressable>
        </View>

        {/* Search */}
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            placeholder="Search tools"
            placeholderTextColor={colors.muted}
            value={query}
            onChangeText={setQuery}
            style={styles.searchInput}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          )}
        </View>

        {/* Featured banner */}
        {query.length === 0 && (
          <Pressable
            style={({ pressed }) => [styles.banner, pressed && { opacity: 0.92 }]}
            onPress={() => openTool('video-downloader')}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerLabel}>MOST USED</Text>
              <Text style={styles.bannerTitle}>Download videos in one tap</Text>
              <Text style={styles.bannerText}>Paste a link and save it to your phone.</Text>
            </View>
            <View style={styles.bannerIcon}>
              <Ionicons name="cloud-download" size={30} color="#fff" />
            </View>
          </Pressable>
        )}

        {/* Categories */}
        {CATEGORIES.map((category) => {
          const items = filtered.filter((t) => t.category === category);
          if (items.length === 0) return null;
          return (
            <View key={category} style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{category}</Text>
                <Text style={styles.sectionCount}>{items.length} tools</Text>
              </View>
              <View style={styles.grid}>
                {items.map((tool) => (
                  <ToolCard key={tool.id} tool={tool} />
                ))}
              </View>
            </View>
          );
        })}

        {/* Empty search */}
        {filtered.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={40} color={colors.border} />
            <Text style={styles.emptyText}>No tools match "{query}"</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ToolCard({ tool }: { tool: Tool }) {
  return (
    <Pressable
      onPress={() => openTool(tool.id)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={[styles.cardIcon, { backgroundColor: tool.color + '1A' }]}>
        <Ionicons name={tool.icon} size={24} color={tool.color} />
      </View>
      <Text style={styles.cardTitle} numberOfLines={1}>
        {tool.title}
      </Text>
      <Text style={styles.cardSubtitle} numberOfLines={2}>
        {tool.subtitle}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 40 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  eyebrow: { fontSize: 14, color: colors.muted, fontWeight: '500' },
  title: { fontSize: 30, fontWeight: '800', color: colors.text, letterSpacing: -0.5, marginTop: 2 },
  iconButton: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center', ...shadow,
  },

  search: {
    flexDirection: 'row', alignItems: 'center', gap: 10, height: 50, paddingHorizontal: 14,
    backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text },

  banner: {
    marginTop: 20, padding: 20, borderRadius: radius.lg, backgroundColor: colors.primary,
    flexDirection: 'row', alignItems: 'center', gap: 16,
  },
  bannerLabel: { color: '#C7D2FE', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  bannerTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 6 },
  bannerText: { color: '#E0E7FF', fontSize: 13, marginTop: 4 },
  bannerIcon: {
    width: 60, height: 60, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },

  section: { marginTop: 28 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  sectionCount: { fontSize: 13, color: colors.muted },

  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12, marginTop: 12 },
  card: { width: '48.5%', backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, ...shadow },
  cardPressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
  cardIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  cardSubtitle: { fontSize: 12.5, color: colors.muted, marginTop: 4, lineHeight: 17 },

  empty: { alignItems: 'center', marginTop: 60, gap: 10 },
  emptyText: { color: colors.muted, fontSize: 15 },
});