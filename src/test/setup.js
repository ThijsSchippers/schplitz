import '@testing-library/jest-dom';

// jsdom doesn't implement window.matchMedia — provide a minimal stub
// Guard: setup.js is also loaded by Node-environment tests where window is undefined
if (typeof window !== 'undefined') Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
}); // eslint-disable-line
