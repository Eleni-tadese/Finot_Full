import { useWindowDimensions } from 'react-native';

// What kind of screen is this right now? Every screen that changes its design for tablets or for
// landscape asks here, so the rules are written ONCE and the numbers stay the same everywhere.
// Sizes are in "points" (the same physical size on every phone), not in pixels.
export function useLayout() {
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  // A tablet is recognised by its SHORT side: a phone turned sideways is still short (under 600),
  // a tablet is not, in either direction.
  const tablet = Math.min(width, height) >= 600;
  return {
    width,
    height,
    landscape,
    tablet,
    // Use a two-part design (list beside detail, photo beside actions) when there is room for it.
    split: landscape || width >= 900,
    // Text pages never stretch wider than this, so lines stay easy to read on a big screen.
    contentWidth: Math.min(width, tablet ? 760 : 560),
  };
}
