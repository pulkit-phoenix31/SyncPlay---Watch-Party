/**
 * Extracts an 11-character YouTube Video ID from various YouTube URL formats or standalone IDs.
 */
export function extractYouTubeId(input: string): string {
  if (!input) return 'L_LUpnjgPso';
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

    // If youtube.com / m.youtube.com / youtube-nocookie.com
    if (url.hostname.includes('youtube.com') || url.hostname.includes('youtube-nocookie.com')) {
      const vParam = url.searchParams.get('v');
      if (vParam && /^[a-zA-Z0-9_-]{11}$/.test(vParam)) {
        return vParam;
      }

      // Check path segments (e.g., /embed/ID, /shorts/ID, /v/ID)
      const pathSegments = url.pathname.split('/').filter(Boolean);
      for (const segment of pathSegments) {
        if (/^[a-zA-Z0-9_-]{11}$/.test(segment)) {
          return segment;
        }
      }
    }

    // If youtu.be/ID
    if (url.hostname.includes('youtu.be')) {
      const pathSegments = url.pathname.split('/').filter(Boolean);
      if (pathSegments.length > 0 && /^[a-zA-Z0-9_-]{11}$/.test(pathSegments[0])) {
        return pathSegments[0];
      }
    }
  } catch (e) {
    // Ignore URL constructor parse errors and fallback to regex
  }

  // 2. Comprehensive Regex fallback
  const patterns = [
    /(?:v=|\/embed\/|\/shorts\/|\/v\/|youtu\.be\/|\/watch\?.*v=)([a-zA-Z0-9_-]{11})/,
    /([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return trimmed;
}
