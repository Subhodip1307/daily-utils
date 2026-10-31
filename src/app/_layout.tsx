import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { FeedbackProvider } from '../components/Feedback';
import { colors } from '../constants/theme';
import { warmUpDownloader } from '../services/videoDownloader';

export default function RootLayout() {
  useEffect(() => {
    warmUpDownloader();
  }, []);

 return (
  <KeyboardProvider>
    <FeedbackProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      />
    </FeedbackProvider>
  </KeyboardProvider>
);
}