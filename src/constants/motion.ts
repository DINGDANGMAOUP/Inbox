export const motion = {
  duration: {
    pressIn: 70,
    pressOut: 130,
    short: 140,
    medium: 220,
    long: 320,
    screen: 360,
    emphasized: 400,
  },
  scale: {
    pressSubtle: 0.996,
    pressStandard: 0.99,
    pressStrong: 0.982,
  },
  stagger: {
    listItem: 20,
    section: 34,
  },
  spring: {
    damping: 28,
    stiffness: 220,
    expressiveDamping: 34,
    expressiveStiffness: 260,
  },
} as const;
