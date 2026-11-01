// What search engines, link previews (WhatsApp, iMessage) and AI crawlers see of "/" once
// Schplitz 2 is there. Swapped into index.html and public/llms.txt by the launch build
// (vite.config.js, VITE_V2_AT_ROOT=true); the default build keeps Schplitz 1's versions.
// Plain strings, no browser APIs: this runs in Node during the build.

const TITLE = "Schplitz · Split costs with friends, privately";
const DESCRIPTION = "Keep track of who's ahead with friends, so you know whose turn it is next. No sign-up, and Schplitz stores nothing. Your payment data is yours and yours alone.";
const IMAGE = "https://schplitz.com/images/sunset-couple.jpg";

/** Replaces the block between <!-- site-meta --> and <!-- /site-meta --> in index.html. */
export const HEAD = `    <title>${TITLE}</title>

    <!-- Primary meta -->
    <meta name="description" content="${DESCRIPTION}" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="https://schplitz.com/" />

    <!-- Open Graph (WhatsApp, iMessage, Slack, etc.) -->
    <meta property="og:type"        content="website" />
    <meta property="og:url"         content="https://schplitz.com/" />
    <meta property="og:title"       content="${TITLE}" />
    <meta property="og:description" content="${DESCRIPTION}" />
    <meta property="og:image"       content="${IMAGE}" />
    <meta property="og:image:alt"   content="Two friends at sunset" />
    <meta property="og:locale"      content="en_US" />
    <meta property="og:site_name"   content="Schplitz" />

    <!-- Twitter / X card -->
    <meta name="twitter:card"        content="summary_large_image" />
    <meta name="twitter:title"       content="${TITLE}" />
    <meta name="twitter:description" content="${DESCRIPTION}" />
    <meta name="twitter:image"       content="${IMAGE}" />
    <meta name="theme-color"         content="#F5F4FE" />
`;

/** Replaces the block between <!-- site-noscript --> and <!-- /site-noscript --> in index.html. */
export const NOSCRIPT = `    <noscript>
      <main>
        <h1>Schplitz: your payment data is yours. And yours alone.</h1>
        <p>Schplitz keeps track of who's ahead between friends, so you know whose turn it is next. No sign-up, and Schplitz stores nothing. Schplitz needs JavaScript to run.</p>

        <h2>How it works</h2>
        <ol>
          <li><strong>Start a tally</strong> with a friend or a group of up to 10, and pick a question only you can answer. The answer locks every link.</li>
          <li><strong>Tap what you paid for</strong> (a coffee, drinks, a padel court) and type the amount.</li>
          <li><strong>Send the link in your chat.</strong> Your friends tap it and they're up to date. The chat is the record.</li>
          <li><strong>See whose turn it is.</strong> "Next one's on Ben", in things you actually buy each other. Exact numbers are in Details.</li>
        </ol>

        <h2>No small print</h2>
        <ul>
          <li>Does Schplitz keep what I spend? No. It has nowhere to put it.</li>
          <li>Do I need an account? No.</li>
          <li>Does Schplitz track me? No. No ads, no cookies.</li>
          <li>Who can open my links? Only people who know your group's answer.</li>
          <li>Does Schplitz go online at all? Only to look up exchange rates.</li>
        </ul>

        <p>Open Schplitz: <a href="https://schplitz.com/">schplitz.com</a></p>
      </main>
    </noscript>
`;

/** public/llms.txt for the launch build. */
export const LLMS_TXT = `# Schplitz

> Keeps track of who's ahead between friends, so they know whose turn it is next. No server, no account, no database. The links friends send each other in their chat are the record.

Schplitz is a client-side web app for pairs and groups of up to 10 who take turns paying (coffees, rounds of drinks, dinners, padel courts, trips). People log what they paid by tapping a category and typing the amount. The main screen shows whose turn it is ("Next one's on Ben", "about 2 coffees behind") rather than debts to settle; exact amounts, currencies and dates are in Details.

There is no server-side storage. Every change is shared as a link in the group's own chat. Each link is encrypted with a key derived from an answer to a question only the group knows, and carries every member's running balance plus the last 30 days of entries, so any recent link restores the tally on a new or wiped phone. Older history moves as a "full copy" file.

## Key facts

- Cipher: AES-256-GCM (Web Crypto API); the link header (version, tally ID, question) is authenticated as additional data
- Key derivation: PBKDF2-SHA256, 600,000 iterations, salted with the random tally ID; keys are stored non-extractable
- IV: 96-bit, random per link
- Link contents: deflate-compressed JSON; per-member running summaries with hash chains, plus a 30-day correction window; about 2,000 characters
- Readable in a link: only the question (users are told to keep it vague)
- Storage: a cache in the browser (IndexedDB) for convenience; losing it loses nothing that isn't in the chat
- Server, database, account: none
- Telemetry, ads, cookies: none
- Network: exchange rates only (api.frankfurter.app), locked at the rate of the payment's day
- Group size: up to 10 people; whose turn is picked among the people present
- Corrections: "Not me" for a payment someone wasn't part of applies at once; questions go to the person who paid

## How it works

1. Someone starts a tally, adds names and picks a question with an answer the group knows.
2. They send the invite link in the group chat. Friends open it, type the answer once and pick their name.
3. Whoever pays logs it with a category tile and the amount, then shares the update link in the chat.
4. Opening a link merges it: per member, the newest summary wins, so links can be opened in any order and old links can't roll anything back.

Old Schplitz 1 tallies and links still open, and are brought in on the same phone. Schplitz 1 stays available at https://schplitz.com/classic/.

## App

- URL: https://schplitz.com/
- Source: https://github.com/thijsschippers/schplitz
`;
