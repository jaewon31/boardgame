import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

interface Props {
  compact?: boolean;
  title: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  secondary?: boolean;
}

export function ActionButton({ title, onPress, disabled, busy, secondary, compact }: Props) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      onPress={onPress} disabled={disabled || busy}
      style={({ pressed }) => [styles.button, compact && { minHeight: 44, padding: 8 }, secondary && styles.secondary, (disabled || busy) && styles.disabled, pressed && styles.pressed]}>
      {busy ? <ActivityIndicator color="#16261C" /> : <Text style={[styles.text, secondary && styles.secondaryText]}>{title}</Text>}
    </Pressable>
  );
}
const styles = StyleSheet.create({
  button: { minHeight: 52, borderRadius: 14, padding: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: '#DDC88F' },
  secondary: { backgroundColor: '#22392B', borderWidth: 1, borderColor: '#49614B' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  text: { color: '#16261C', fontSize: 15, fontWeight: '700' },
  secondaryText: { color: '#F5EBD1' },
});
