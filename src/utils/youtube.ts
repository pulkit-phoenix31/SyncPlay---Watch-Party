/**
 * Extracts an 11-character YouTube Video ID from various YouTube URL formats or standalone IDs.
 */
export function extractYouTubeId(input: string): string {
  const DEFAULT_ID = 'L_LUpnjgPso';
  if (!input) return DEFAULT_ID;
  const trimmed = input.trim();

  // If already an 11-char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  // 1. URL constructor parsing
  try {
    const urlString = trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? trimmed
      : `https://${trimmed}`;

    const url = new URL(urlString);

    // If youtube.com / m.youtube.com / music.youtube.com / youtube-nocookie.com
    if (url.hostname.includes('youtube.com') || url.hostname.includes('youtube-nocookie.com')) {
      const vParam = url.searchParams.get('v');
      if (vParam) {
        const cleanV = vParam.substring(0, 11);
        if (/^[a-zA-Z0-9_-]{11}$/.test(cleanV)) {
          return cleanV;
        }
      }

      // Check path segments (e.g., /embed/ID, /shorts/ID, /v/ID, /live/ID)
      const pathSegments = url.pathname.split('/').filter(Boolean);
      for (const segment of pathSegments) {
        const cleanSeg = segment.substring(0, 11);
        if (/^[a-zA-Z0-9_-]{11}$/.test(cleanSeg)) {
          return cleanSeg;
        }
      }
    }

    // If youtu.be/ID
    if (url.hostname.includes('youtu.be')) {
      const pathSegments = url.pathname.split('/').filter(Boolean);
      if (pathSegments.length > 0) {
        const cleanSeg = pathSegments[0].substring(0, 11);
        if (/^[a-zA-Z0-9_-]{11}$/.test(cleanSeg)) {
          return cleanSeg;
        }
      }
    }
  } catch (e) {
    // Ignore URL constructor parse errors and fallback to regex
  }

  // 2. Comprehensive Regex fallback
  const patterns = [
    /(?:v=|\/embed\/|\/shorts\/|\/live\/|\/v\/|youtu\.be\/|\/watch\?.*v=)([a-zA-Z0-9_-]{11})/,
    /([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return DEFAULT_ID;
}

