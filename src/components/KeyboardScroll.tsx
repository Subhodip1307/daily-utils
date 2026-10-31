import { ComponentProps } from 'react';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

type Props = ComponentProps<typeof KeyboardAwareScrollView>;

/** ScrollView that keeps the focused text field above the keyboard */
export function KeyboardScroll({ children, ...props }: Props) {
  return (
    <KeyboardAwareScrollView
      bottomOffset={24}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      {...props}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}
