export const motionTokens = {
  duration: { fast: 0.18, normal: 0.35, slow: 0.6 },
  easing: {
    smooth: [0.22, 1, 0.36, 1],
    sharp:  [0.4, 0, 0.2, 1],
  },
  distance: { sm: 8, md: 16, lg: 24 },

  // Interaction values calibrated to be *seen from across a room on a projector*.
  // The previous pass used scale 1.01 for card hover, which is imperceptible at
  // presentation distance -- these are the corrected values, still short enough
  // (fast/normal) that they never feel sluggish.
  hover: {
    cardScale: 1.03,
    cardLift: -4,     // px translateY -- transform, never `top`
    pillScale: 1.12,
    rowLift: 2,
    iconScale: 1.2,
  },
  tap: {
    cardScale: 0.985,
    pillScale: 0.95,
  },
};
