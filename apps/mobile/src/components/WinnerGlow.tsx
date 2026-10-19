import { useEffect, useId, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { useReducedMotion } from './PokerCards';

// Decorative only: never intercept a card reveal or table action.
export function WinnerGlow() {
  const id = 'winner' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const pulse = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    pulse.setValue(0);
    if (reduced) return;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 850, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]), { iterations: 3 });
    animation.start();
    return () => animation.stop();
  }, [pulse, reduced]);
  return <Animated.View pointerEvents="none" accessible={false} style={[styles.glow, {
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [.75, 1] }),
    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }],
  }]}>
    <Svg width="100%" height="100%" viewBox="0 0 180 160" preserveAspectRatio="none">
      <Defs><RadialGradient id={id} cx="50%" cy="48%" rx="50%" ry="50%"><Stop offset="0" stopColor="#FFF2A5" stopOpacity={0.85}/><Stop offset={0.4} stopColor="#FFC64D" stopOpacity={0.48}/><Stop offset="1" stopColor="#E5A332" stopOpacity="0"/></RadialGradient></Defs>
      <Ellipse cx="90" cy="80" rx="90" ry="80" fill={`url(#${id})`} />
    </Svg>
  </Animated.View>;
}
const styles = StyleSheet.create({glow:{position:'absolute',left:-22,right:-22,top:-20,bottom:-16}});
