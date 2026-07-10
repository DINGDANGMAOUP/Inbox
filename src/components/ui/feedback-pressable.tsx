import { StyleSheet, Pressable, type PressableProps, type PressableStateCallbackType, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { motion } from '@/constants/motion';
import { appEasing } from '@/components/ui/motion-presets';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PressFeedback = 'subtle' | 'standard' | 'strong' | 'none';

type FeedbackPressableProps = Omit<PressableProps, 'style'> & {
  captureTouches?: boolean;
  feedback?: PressFeedback;
  stateLayerColor?: string;
  style?: StyleProp<ViewStyle>;
};

function feedbackScale(feedback: PressFeedback) {
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

export function FeedbackPressable({
  captureTouches = false,
  feedback = 'standard',
  stateLayerColor = 'rgba(205, 232, 208, 0.18)',
  style,
  disabled,
  accessibilityRole = 'button',
  onStartShouldSetResponderCapture,
  pointerEvents,
  onPressIn,
  onPressOut,
  children,
  ...props
}: FeedbackPressableProps) {
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
      accessibilityRole={accessibilityRole}
      onPressIn={(event) => {
        pressed.set(withTiming(1, { duration: reduceMotion ? 0 : motion.duration.pressIn, easing: appEasing.standard }));
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        pressed.set(withTiming(0, { duration: reduceMotion ? 0 : motion.duration.pressOut, easing: appEasing.emphasizedDecelerate }));
        onPressOut?.(event);
      }}
      style={[style, animatedStyle]}
      pointerEvents={captureTouches ? 'box-only' : pointerEvents}
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
