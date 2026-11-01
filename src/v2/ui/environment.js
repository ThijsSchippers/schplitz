// What kind of browser this is, for the hints in docs/v2.0.md §4.1. Detection by user
// agent is imperfect, so it only drives gentle hints, never behaviour that matters.

const IN_APP = [
  [/FBAN|FBAV|FB_IAB/, "Facebook"], [/Instagram/, "Instagram"], [/Line\//, "LINE"], [/Snapchat/, "Snapchat"],
  [/musical_ly|BytedanceWebview|TikTok/, "TikTok"], [/LinkedInApp/, "LinkedIn"], [/; wv\)/, null],
];

/**
 * { inApp, appleWebKit }:
 *   inApp        the app whose built-in browser this is ("Instagram"), "" when it's an
 *                unnamed in-app browser, null in a normal browser. Its storage is separate
 *                from the phone's browser, so a tally opened there stays there.
 *   appleWebKit  Safari, or any browser on iPhone/iPad (all use WebKit): the 7-day rule applies.
 */
export function browserKind(ua = typeof navigator !== "undefined" ? navigator.userAgent : "") {
  const hit = IN_APP.find(([re]) => re.test(ua));
  const ios = /iPhone|iPad|iPod/.test(ua);
  const macSafari = /Macintosh/.test(ua) && /AppleWebKit/.test(ua) && !/Chrome|Chromium|Edg|Firefox|OPR/.test(ua);
  return { inApp: hit ? (hit[1] ?? "") : null, appleWebKit: ios || macSafari };
}
