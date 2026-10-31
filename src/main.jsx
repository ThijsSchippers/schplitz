// The page at "/". Schplitz 1 by default; Schplitz 2 when built with VITE_V2_AT_ROOT=true
// (the launch switch, docs/launch.md). Vite replaces the flag at build time, so only one
// of the two apps ends up in this page's bundle.
import React from 'react'
import ReactDOM from 'react-dom/client'

const root = ReactDOM.createRoot(document.getElementById('root'));

if (import.meta.env.VITE_V2_AT_ROOT === 'true') {
  // The installable app lives at "/" after launch.
  for (const [rel, href] of [['manifest', '/manifest.webmanifest'], ['apple-touch-icon', '/v2/apple-touch-icon.png']]) {
    document.head.append(Object.assign(document.createElement('link'), { rel, href }));
  }
  import('./v2/ui/App.jsx').then(({ default: App }) => root.render(<React.StrictMode><App /></React.StrictMode>));
} else {
  import('./App.jsx').then(({ default: App }) => root.render(<React.StrictMode><App /></React.StrictMode>));
}
