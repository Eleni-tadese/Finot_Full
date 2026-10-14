import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Linking, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { brand } from '@/constants/brand';
import { useApi } from '@/hooks/use-api';
import type { PublicOverview } from '@/lib/types';

const WEBSITE = 'https://finot.pages.dev';

// The same photos as the website's carousel.
const PHOTOS = [
  require('@/assets/images/landing/gibi1.jpg'),
  require('@/assets/images/landing/gibi2.jpg'),
  require('@/assets/images/landing/gibi3.jpg'),
  require('@/assets/images/landing/gibi4.jpg'),
];

// What is inside the app: an icon and one word each, no sentences.
const INSIDE: { icon: keyof typeof MaterialIcons.glyphMap; label: string }[] = [
  { icon: 'event', label: 'Events' },
  { icon: 'school', label: 'Courses' },
  { icon: 'notifications', label: 'Alerts' },
  { icon: 'volunteer-activism', label: 'Giving' },
];

// A number that counts up from 0 when it appears, so the live numbers feel alive.
function useCountUp(target: number | undefined, duration = 900) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target === undefined) return;
    const start = Date.now();
    const timer = setInterval(() => {
      const progress = Math.min(1, (Date.now() - start) / duration);
      setValue(Math.round(target * (1 - Math.pow(1 - progress, 3)))); // slows down at the end
      if (progress >= 1) clearInterval(timer);
    }, 30);
    return () => clearInterval(timer);
  }, [target, duration]);
  return value;
}

function Stat({ icon, value, label }: { icon: keyof typeof MaterialIcons.glyphMap; value: number | undefined; label: string }) {
  const shown = useCountUp(value);
  return (
    <View style={styles.stat}>
      <MaterialIcons name={icon} size={20} color={brand.warning} />
      <AppText variant="title" color={brand.primary}>
        {value === undefined ? '-' : shown.toLocaleString()}
      </AppText>
      <AppText variant="caption" color={brand.muted}>
        {label}
      </AppText>
    </View>
  );
}

export default function WelcomeScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const overview = useApi<PublicOverview>('/api/public/overview/');
  const stats = overview.data?.stats;

  const photoHeight = Math.round(height * 0.46);

  // The photos change by themselves every 4 seconds. The timer restarts when the index changes.
  const listRef = useRef<FlatList>(null);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = (index + 1) % PHOTOS.length;
      listRef.current?.scrollToIndex({ index: next, animated: true });
      setIndex(next);
    }, 4000);
    return () => clearTimeout(timer);
  }, [index]);

  // A very slow zoom on the photos (like a documentary), so the top never feels static.
  const zoom = useSharedValue(1);
  useEffect(() => {
    zoom.value = withRepeat(withTiming(1.12, { duration: 9000 }), -1, true);
  }, [zoom]);
  const zoomStyle = useAnimatedStyle(() => ({ transform: [{ scale: zoom.value }] }));

  return (
    <View style={styles.root}>
      {/* White status-bar icons, because the photo is dark */}
      <StatusBar style="light" />

      {/* ---- Photo with the name over it ---- */}
      <View style={{ height: photoHeight, overflow: 'hidden' }}>
        <Animated.View style={[{ height: photoHeight }, zoomStyle]}>
          <FlatList
            ref={listRef}
            data={PHOTOS}
            horizontal
            pagingEnabled
            scrollEnabled={false}
            showsHorizontalScrollIndicator={false}
            keyExtractor={(_, i) => String(i)}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            renderItem={({ item }) => <Image source={item} style={{ width, height: photoHeight }} contentFit="cover" />}
          />
        </Animated.View>

        <LinearGradient
          colors={['rgba(27,46,102,0.50)', 'rgba(27,46,102,0.30)', 'rgba(27,46,102,0.94)']}
          style={StyleSheet.absoluteFill}
        />

        <SafeAreaView style={styles.overlay} edges={['top', 'left', 'right']}>
          <Animated.View entering={FadeInDown.duration(700)} style={styles.brand}>
            <Image source={require('@/assets/images/finot-logo.png')} style={styles.logo} contentFit="contain" />
            <AppText variant="display" color="#ffffff" style={styles.name}>
              finot
            </AppText>
            <View style={styles.tagPill}>
              <View style={styles.tagDot} />
              <AppText variant="bodyStrong" color={brand.accent}>
                Gibi Gubae fellowship
              </AppText>
            </View>
          </Animated.View>

          <View style={styles.dots}>
            {PHOTOS.map((_, i) => (
              <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
            ))}
          </View>
        </SafeAreaView>
      </View>

      {/* ---- Bottom sheet ---- */}
      <View style={styles.sheet}>
        {/* Live numbers */}
        <Animated.View entering={FadeInUp.delay(150).duration(500)} style={styles.statsCard}>
          <Stat icon="school" value={stats?.active_students} label="Students" />
          <View style={styles.divider} />
          <Stat icon="groups" value={stats?.service_groups} label="Groups" />
          <View style={styles.divider} />
          <Stat icon="event" value={stats?.events} label="Events" />
        </Animated.View>

        {/* What is inside */}
        <Animated.View entering={FadeInUp.delay(280).duration(500)} style={styles.insideRow}>
          {INSIDE.map((item) => (
            <View key={item.label} style={styles.insideItem}>
              <View style={styles.insideIcon}>
                <MaterialIcons name={item.icon} size={22} color={brand.primary} />
              </View>
              <AppText variant="caption" color={brand.text}>
                {item.label}
              </AppText>
            </View>
          ))}
        </Animated.View>

        {/* Actions */}
        <Animated.View entering={FadeInUp.delay(400).duration(500)} style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.signIn, pressed && styles.pressed]}
            onPress={() => router.push('/sign-in')}>
            <AppText variant="heading" color="#ffffff">
              Sign in
            </AppText>
            <View style={styles.arrowCircle}>
              <MaterialIcons name="arrow-forward" size={18} color={brand.primary} />
            </View>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.give, pressed && styles.pressed]}
            onPress={() => router.push('/give')}>
            <MaterialIcons name="volunteer-activism" size={20} color={brand.primary} />
            <AppText variant="bodyStrong" color={brand.primary}>
              Give without an account
            </AppText>
          </Pressable>

          <View style={styles.links}>
            <Pressable onPress={() => Linking.openURL(`${WEBSITE}/anonymous`)} hitSlop={8}>
              <AppText variant="caption" color={brand.muted}>
                Anonymous Q&amp;A
              </AppText>
            </Pressable>
            <AppText variant="caption" color={brand.border}>
              |
            </AppText>
            <Pressable onPress={() => Linking.openURL(WEBSITE)} hitSlop={8}>
              <AppText variant="caption" color={brand.muted}>
                Website
              </AppText>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: brand.primary },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  brand: { alignItems: 'center', gap: 4, paddingBottom: 26 },
  logo: { width: 88, height: 88, borderRadius: 24, backgroundColor: '#ffffff', marginBottom: 10 },
  name: { fontSize: 46, lineHeight: 52 },
  tagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(247,223,30,0.5)',
    marginTop: 4,
  },
  tagDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: brand.accent },
  dots: { position: 'absolute', bottom: 44, flexDirection: 'row', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.45)' },
  dotActive: { width: 22, backgroundColor: brand.accent },
  sheet: {
    flex: 1,
    marginTop: -30, // slides up over the photo
    backgroundColor: brand.background,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 16,
    gap: 18,
  },
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: brand.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: brand.border,
    paddingVertical: 12,
    shadowColor: brand.primary,
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  stat: { flex: 1, alignItems: 'center', gap: 1 },
  divider: { width: 1, height: 38, backgroundColor: brand.border },
  insideRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 6 },
  insideItem: { alignItems: 'center', gap: 6, flex: 1 },
  insideIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: brand.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { gap: 12 },
  signIn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: brand.primary,
    paddingVertical: 16,
    borderRadius: 18,
    borderBottomWidth: 4,
    borderBottomColor: brand.accent, // the amber line, like the website
  },
  arrowCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: brand.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  give: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: brand.card,
    borderWidth: 1.5,
    borderColor: brand.border,
    paddingVertical: 14,
    borderRadius: 18,
  },
  pressed: { opacity: 0.8 },
  links: { flexDirection: 'row', justifyContent: 'center', gap: 14, paddingTop: 2 },
});
