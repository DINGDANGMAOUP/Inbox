import {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  SlideInDown,
  SlideInUp,
  SlideOutDown,
  SlideOutUp,
} from 'react-native-reanimated';

import { motion } from '@/constants/motion';

export const m3Easing = {
  standard: Easing.bezier(0.2, 0, 0, 1),
  emphasized: Easing.bezier(0.2, 0, 0, 1),
  emphasizedDecelerate: Easing.bezier(0.05, 0.7, 0.1, 1),
  emphasizedAccelerate: Easing.bezier(0.3, 0, 0.8, 0.15),
} as const;

export const m3Motion = {
  fadeScreenIn: () => FadeIn.duration(motion.duration.screen).easing(m3Easing.emphasizedDecelerate),
  fadeMediumOut: () => FadeOut.duration(motion.duration.medium).easing(m3Easing.emphasizedAccelerate),
  fadeShortIn: () => FadeIn.duration(motion.duration.short).easing(m3Easing.standard),
  fadeShortOut: () => FadeOut.duration(motion.duration.short).easing(m3Easing.emphasizedAccelerate),
  fadeDown: (delay = 0) => FadeInDown.delay(delay).duration(motion.duration.medium).easing(m3Easing.emphasizedDecelerate),
  fadeDownShort: () => FadeInDown.duration(motion.duration.short).easing(m3Easing.standard),
  slideChromeUp: () => SlideInUp.duration(motion.duration.medium).easing(m3Easing.emphasizedDecelerate),
  slideChromeDown: () => SlideInDown.duration(motion.duration.medium).easing(m3Easing.emphasizedDecelerate),
  slideOutUp: () => SlideOutUp.duration(motion.duration.short).easing(m3Easing.emphasizedAccelerate),
  slideOutDown: () => SlideOutDown.duration(motion.duration.short).easing(m3Easing.emphasizedAccelerate),
  layoutShort: () => LinearTransition.duration(motion.duration.short).easing(m3Easing.standard),
  layoutMedium: () => LinearTransition.duration(motion.duration.medium).easing(m3Easing.standard),
} as const;
