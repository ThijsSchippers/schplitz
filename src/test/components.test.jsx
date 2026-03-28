import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LandingPage from '../LandingPage.jsx';
import App from '../../src/App.jsx';

// ─── MOCKS ───────────────────────────────────────────────────────────────────

// Suppress console.error/warn noise in test output
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

// Mock fetch so currency API calls don't hit the network
globalThis.fetch = vi.fn().mockResolvedValue({
  ok: false,
  json: async () => ({}),
});

// ─── LandingPage ─────────────────────────────────────────────────────────────

describe('LandingPage', () => {
  it('renders without crashing', () => {
    render(<LandingPage onLaunch={() => {}} />);
  });

  it('displays the main headline', () => {
    render(<LandingPage onLaunch={() => {}} />);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('calls onLaunch when the CTA button is clicked', async () => {
    const onLaunch = vi.fn();
    render(<LandingPage onLaunch={onLaunch} />);
    const ctaButtons = screen.getAllByText(/OPEN SCHPLITZ/i);
    await userEvent.click(ctaButtons[0]);
    expect(onLaunch).toHaveBeenCalledTimes(1);
  });

  it('renders all four how-it-works steps', () => {
    render(<LandingPage onLaunch={() => {}} />);
    expect(screen.getByText('01')).toBeInTheDocument();
    expect(screen.getByText('02')).toBeInTheDocument();
    expect(screen.getByText('03')).toBeInTheDocument();
    expect(screen.getByText('04')).toBeInTheDocument();
  });

  it('renders the full crypto spec table', () => {
    render(<LandingPage onLaunch={() => {}} />);
    expect(screen.getAllByText('AES-256-GCM').length).toBeGreaterThan(0);
    expect(screen.getAllByText('PBKDF2-SHA256').length).toBeGreaterThan(0);
    expect(screen.getAllByText('200,000').length).toBeGreaterThan(0);
  });
});

// ─── App shell ───────────────────────────────────────────────────────────────

describe('App shell', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.hash = '';
  });

  it('shows the landing page when there is no stored tally', () => {
    render(<App />);
    // Landing page has the SCHPLITZ logo in the nav
    expect(screen.getAllByText('SCHPLITZ').length).toBeGreaterThan(0);
  });

  it('shows the tracker directly when localStorage has an initialized tally', () => {
    localStorage.setItem('schplitzExpenses', JSON.stringify({
      initialized: true,
      myName: 'Alex',
      otherName: 'Jordan',
      securityQuestion: 'Where did we meet?',
      statuses: {},
      expenses: [],
    }));
    render(<App />);
    // The tracker header shows the user's name
    expect(screen.getAllByText('Alex').length).toBeGreaterThan(0);
  });
});

// ─── ExpenseTracker — setup flow ─────────────────────────────────────────────

describe('ExpenseTracker setup', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.hash = '';
  });

  it('renders the setup screen when uninitialized', () => {
    render(<App />);
    // Click through from landing page
    const openBtn = screen.getAllByText(/OPEN APP/i)[0];
    fireEvent.click(openBtn);
    expect(screen.getByText(/Welcome to Schplitz/i)).toBeInTheDocument();
  });

  it('can complete new tally setup with valid inputs', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Navigate past landing page
    fireEvent.click(screen.getAllByText(/OPEN APP/i)[0]);

    // Fill in the setup form
    const nameInputs = screen.getAllByPlaceholderText(/e\.g\.,/i);
    await user.type(nameInputs[0], 'Alex');
    // other name input
    await user.type(nameInputs[1], 'Jordan');
    // security question (third e.g., input)
    const allEgInputs = screen.getAllByPlaceholderText(/e\.g\.,/i);
    await user.type(allEgInputs[2], 'Where did we meet?');

    // Answer fields are password inputs
    const answerInput = screen.getAllByPlaceholderText('lowercase, no spaces')[0];
    await user.type(answerInput, 'berlin2023');
    const confirmInput = screen.getByPlaceholderText('Type it again');
    await user.type(confirmInput, 'berlin2023');

    // Submit
    const submitBtn = screen.getByText('Start Tracking');
    await user.click(submitBtn);

    // Should now see the main app
    await waitFor(() => {
      expect(screen.getAllByText('Alex').length).toBeGreaterThan(0);
    });
  });

  it('keeps the submit button disabled when answers do not match', async () => {
    const user = userEvent.setup();
    render(<App />);
    fireEvent.click(screen.getAllByText(/OPEN APP/i)[0]);

    const answerInput = screen.getAllByPlaceholderText('lowercase, no spaces')[0];
    await user.type(answerInput, 'answer1');
    const confirmInput = screen.getByPlaceholderText('Type it again');
    await user.type(confirmInput, 'answer2');

    expect(screen.getByText('Start Tracking')).toBeDisabled();
  });
});

// ─── ExpenseTracker — add expense ─────────────────────────────────────────────

describe('ExpenseTracker add expense', () => {
  beforeEach(() => {
    localStorage.setItem('schplitzExpenses', JSON.stringify({
      initialized: true,
      myName: 'Alex',
      otherName: 'Jordan',
      securityQuestion: 'Where did we meet?',
      statuses: {},
      expenses: [],
    }));
    sessionStorage.setItem('schplitzAnswer', 'berlin2023');
  });

  it('shows the Add Expense button', () => {
    render(<App />);
    expect(screen.getByText(/Add Expense/i)).toBeInTheDocument();
  });

  it('opens the expense form when Add Expense is clicked', async () => {
    render(<App />);
    await userEvent.click(screen.getByText(/Add Expense/i));
    expect(screen.getByPlaceholderText(/What was it for/i)).toBeInTheDocument();
  });

  it('adds an expense to the list', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByText(/Add Expense/i));
    await user.type(screen.getByPlaceholderText(/What was it for/i), 'dinner');
    await user.type(screen.getByPlaceholderText('0.00'), '45');
    await user.click(screen.getByRole('button', { name: /^Add$/i }));

    await waitFor(() => {
      expect(screen.getByText('dinner')).toBeInTheDocument();
    });
  });

  it('does not add an expense with no description', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByText(/Add Expense/i));
    await user.type(screen.getByPlaceholderText('0.00'), '45');

    expect(screen.getByRole('button', { name: /^Add$/i })).toBeDisabled();
  });
});
