import { StyleSheet, Pressable, type PressableProps, type PressableStateCallbackType, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { motion } from '@/constants/motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type M3PressableFeedback = 'subtle' | 'standard' | 'strong' | 'none';

type M3PressableProps = Omit<PressableProps, 'style'> & {
  captureTouches?: boolean;
  feedback?: M3PressableFeedback;
  stateLayerColor?: string;
  style?: StyleProp<ViewStyle>;
};

function feedbackScale(feedback: M3PressableFeedback) {
  switch (feedback) {
    case 'subtle':
      return motion.scale.pressSubtle;
    case 'strong':
      return motion.scale.pressStrong;
    case 'none':
      return 1;
    default:
      return motion.scale.pressStandard;
  }
}

export function M3Pressable({
  captureTouches = false,
  feedback = 'standard',
  stateLayerColor = 'rgba(231, 217, 183, 0.18)',
  style,
  disabled,
  onStartShouldSetResponderCapture,
  onPressIn,
  onPressOut,
  children,
  ...props
}: M3PressableProps) {
  const pressed = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  const targetScale = reduceMotion ? 1 : feedbackScale(feedback);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: disabled ? 0.36 : 1 - pressed.get() * 0.08,
    transform: [
      { translateY: reduceMotion ? 0 : pressed.get() * 0.75 },
      { scale: 1 - pressed.get() * (1 - targetScale) },
    ],
  }));

  const stateLayerStyle = useAnimatedStyle(() => ({
    opacity: disabled || feedback === 'none' ? 0 : pressed.get(),
  }));

  const renderChildren = (state: PressableStateCallbackType) => (
    <>
      {typeof children === 'function' ? children(state) : children}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.stateLayer, { backgroundColor: stateLayerColor }, stateLayerStyle]} />
    </>
  );

  return (
    <AnimatedPressable
      disabled={disabled}
      onPressIn={(event) => {
        pressed.set(withTiming(1, { duration: reduceMotion ? 0 : motion.duration.pressIn }));
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        pressed.set(withTiming(0, { duration: reduceMotion ? 0 : motion.duration.pressOut }));
        onPressOut?.(event);
      }}
      style={[style, animatedStyle]}
      onStartShouldSetResponderCapture={(event) => {
        return onStartShouldSetResponderCapture?.(event) ?? captureTouches;
      }}
      {...props}>
      {renderChildren}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  stateLayer: {
    borderRadius: 999,
  },
});
