import { router } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { motion } from '@/constants/motion';
import { m3Easing } from '@/components/reader/motion-presets';

export function useRouteSlideTransition(width: number) {
  const closingRef = useRef(false);
  const progress = useSharedValue(1);
  const reduceMotion = useReducedMotion();
  const duration = reduceMotion ? 0 : motion.duration.medium;

  useEffect(() => {
    progress.set(withTiming(0, { duration, easing: m3Easing.emphasizedDecelerate }));
  }, [duration, progress]);

  const routeStyle = useAnimatedStyle(() => {
    const value = progress.get();
    return {
      opacity: 1 - value * 0.08,
      transform: [{ translateX: value * Math.max(width, 360) }],
    };
  });

  const closeRoute = useCallback(() => {
    if (closingRef.current) {
      return;
    }
    closingRef.current = true;
    progress.set(withTiming(1, { duration, easing: m3Easing.emphasizedAccelerate }));
    setTimeout(() => router.back(), duration);
  }, [duration, progress]);

  return { closeRoute, routeStyle };
}
