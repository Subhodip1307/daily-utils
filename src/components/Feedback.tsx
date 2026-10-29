import { Ionicons } from '@expo/vector-icons';
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '../constants/theme';

type IconName = keyof typeof Ionicons.glyphMap;
export type Variant = 'success' | 'error' | 'warning' | 'info';

export type DialogOptions = {
  variant?: Variant;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string; // set this to show a second button
  destructive?: boolean; // red confirm button
  onConfirm?: () => void;
  onCancel?: () => void;
};

export type ToastOptions = {
  variant?: Variant;
  message: string;
  duration?: number;
};

type FeedbackApi = {
  showDialog: (options: DialogOptions) => void;
  confirm: (options: Omit<DialogOptions, 'onConfirm' | 'onCancel'>) => Promise<boolean>;
  showToast: (options: ToastOptions | string) => void;
};

const VARIANTS: Record<Variant, { icon: IconName; color: string; soft: string }> = {
  success: { icon: 'checkmark-circle', color: '#10B981', soft: '#ECFDF5' },
  error: { icon: 'close-circle', color: '#EF4444', soft: '#FEF2F2' },
  warning: { icon: 'warning', color: '#F59E0B', soft: '#FFFBEB' },
  info: { icon: 'information-circle', color: colors.primary, soft: '#EEF2FF' },
};

const FeedbackContext = createContext<FeedbackApi | null>(null);

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback must be used inside <FeedbackProvider>');
  return ctx;
}

// ================= Provider =================
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogOptions | null>(null);
  const [toast, setToast] = useState<(ToastOptions & { key: number }) | null>(null);

  const showDialog = useCallback((options: DialogOptions) => setDialog(options), []);

  const confirm = useCallback(
    (options: Omit<DialogOptions, 'onConfirm' | 'onCancel'>) =>
      new Promise<boolean>((resolve) =>
        setDialog({
          variant: 'warning',
          cancelLabel: 'Cancel',
          ...options,
          onConfirm: () => resolve(true),
          onCancel: () => resolve(false),
        })
      ),
    []
  );

  const showToast = useCallback((options: ToastOptions | string) => {
    const opts = typeof options === 'string' ? { message: options } : options;
    setToast({ ...opts, key: Date.now() });
  }, []);

  const handleDialogDone = (confirmed: boolean) => {
    const current = dialog;
    setDialog(null);
    if (confirmed) current?.onConfirm?.();
    else current?.onCancel?.();
  };

  return (
    <FeedbackContext.Provider value={{ showDialog, confirm, showToast }}>
      <View style={{ flex: 1 }}>
        {children}
        <ToastHost toast={toast} onHide={() => setToast(null)} />
      </View>
      <DialogHost dialog={dialog} onDone={handleDialogDone} />
    </FeedbackContext.Provider>
  );
}

// ================= Dialog =================
function DialogHost({
  dialog,
  onDone,
}: {
  dialog: DialogOptions | null;
  onDone: (confirmed: boolean) => void;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);

  useEffect(() => {
    if (!dialog) return;
    closing.current = false;
    anim.setValue(0);
    Animated.spring(anim, { toValue: 1, friction: 7, tension: 90, useNativeDriver: true }).start();
  }, [dialog, anim]);

  if (!dialog) return null;

  const close = (confirmed: boolean) => {
    if (closing.current) return;
    closing.current = true;
    Animated.timing(anim, {
      toValue: 0,
      duration: 160,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(() => onDone(confirmed));
  };

  const v = VARIANTS[dialog.variant ?? 'info'];
  const confirmColor = dialog.destructive ? '#EF4444' : v.color;

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={() => close(false)}>
      <Animated.View style={[styles.backdrop, { opacity: anim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => close(false)} />

        <Animated.View
          style={[
            styles.dialog,
            {
              opacity: anim,
              transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }],
            },
          ]}
        >
          <View style={[styles.iconCircle, { backgroundColor: v.soft }]}>
            <Ionicons name={v.icon} size={38} color={v.color} />
          </View>

          <Text style={styles.title}>{dialog.title}</Text>
          {dialog.message ? <Text style={styles.message}>{dialog.message}</Text> : null}

          <View style={styles.actions}>
            {dialog.cancelLabel ? (
              <Pressable
                onPress={() => close(false)}
                style={({ pressed }) => [styles.button, styles.buttonGhost, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.buttonGhostText}>{dialog.cancelLabel}</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => close(true)}
              style={({ pressed }) => [styles.button, { backgroundColor: confirmColor }, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.buttonText}>{dialog.confirmLabel ?? 'OK'}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

// ================= Toast =================
function ToastHost({
  toast,
  onHide,
}: {
  toast: (ToastOptions & { key: number }) | null;
  onHide: () => void;
}) {
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;

  const hide = () => {
    Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(({ finished }) => {
      if (finished) onHide();
    });
  };

  useEffect(() => {
    if (!toast) return;
    anim.setValue(0);
    Animated.spring(anim, { toValue: 1, friction: 8, tension: 80, useNativeDriver: true }).start();
    const timer = setTimeout(hide, toast.duration ?? 2500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  if (!toast) return null;
  const v = VARIANTS[toast.variant ?? 'success'];

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.toastWrap,
        {
          top: insets.top + 10,
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-40, 0] }) }],
        },
      ]}
    >
      <Pressable onPress={hide} style={styles.toast}>
        <View style={[styles.toastIcon, { backgroundColor: v.color + '33' }]}>
          <Ionicons name={v.icon} size={20} color={v.color} />
        </View>
        <Text style={styles.toastText} numberOfLines={2}>
          {toast.message}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

// ================= Styles =================
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  dialog: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: 24,
    paddingTop: 28,
    paddingHorizontal: 22,
    paddingBottom: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 19, fontWeight: '800', color: colors.text, textAlign: 'center' },
  message: {
    fontSize: 14.5,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 8,
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 22, alignSelf: 'stretch' },
  button: {
    flex: 1,
    height: 50,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#fff', fontSize: 15.5, fontWeight: '700' },
  buttonGhost: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  buttonGhostText: { color: colors.text, fontSize: 15.5, fontWeight: '700' },

  toastWrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    maxWidth: 420,
    alignSelf: 'stretch',
    backgroundColor: '#0F172A',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  toastIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  toastText: { flex: 1, color: '#fff', fontSize: 14.5, fontWeight: '600', lineHeight: 20 },
});