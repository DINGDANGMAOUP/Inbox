import {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  Keyframe,
  LinearTransition,
  SlideInDown,
  SlideInUp,
  SlideOutDown,
  SlideOutUp,
} from 'react-native-reanimated';

import { motion } from '@/constants/motion';

export const appEasing = {
  standard: Easing.bezier(0.2, 0, 0, 1),
  emphasized: Easing.bezier(0.2, 0, 0, 1),
  emphasizedDecelerate: Easing.bezier(0.05, 0.7, 0.1, 1),
  emphasizedAccelerate: Easing.bezier(0.3, 0, 0.8, 0.15),
} as const;

export const appMotion = {
  fadeScreenIn: () => FadeIn.duration(motion.duration.screen).easing(appEasing.emphasizedDecelerate),
  fadeMediumOut: () => FadeOut.duration(motion.duration.medium).easing(appEasing.emphasizedAccelerate),
  fadeShortIn: () => FadeIn.duration(motion.duration.short).easing(appEasing.standard),
  fadeShortOut: () => FadeOut.duration(motion.duration.short).easing(appEasing.emphasizedAccelerate),
  fadeDown: (delay = 0) => FadeInDown.delay(delay).duration(motion.duration.medium).easing(appEasing.emphasizedDecelerate),
  fadeDownShort: () => FadeInDown.duration(motion.duration.short).easing(appEasing.standard),
  bottomBarIn: () => new Keyframe({
    0: { opacity: 0, transform: [{ translateY: 10 }] },
    100: { opacity: 1, transform: [{ translateY: 0 }], easing: appEasing.standard },
  }).duration(motion.duration.short),
  bottomBarOut: () => new Keyframe({
    0: { opacity: 1, transform: [{ translateY: 0 }] },
    100: { opacity: 0, transform: [{ translateY: 8 }], easing: appEasing.emphasizedAccelerate },
  }).duration(motion.duration.short),
  slideChromeUp: () => SlideInUp.duration(motion.duration.medium).easing(appEasing.emphasizedDecelerate),
  slideChromeDown: () => SlideInDown.duration(motion.duration.medium).easing(appEasing.emphasizedDecelerate),
  slideOutUp: () => SlideOutUp.duration(motion.duration.short).easing(appEasing.emphasizedAccelerate),
  slideOutDown: () => SlideOutDown.duration(motion.duration.short).easing(appEasing.emphasizedAccelerate),
  layoutShort: () => LinearTransition.duration(motion.duration.short).easing(appEasing.standard),
  layoutMedium: () => LinearTransition.duration(motion.duration.medium).easing(appEasing.standard),
} as const;
