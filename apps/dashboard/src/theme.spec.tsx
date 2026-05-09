import '@testing-library/jest-dom/vitest';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getStoredThemePreference,
  resolveThemePreference,
  ThemeProvider,
  ThemeToggle,
} from './theme';

const installMatchMedia = (matches = false) => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
};

describe('theme handling', () => {
  beforeEach(() => {
    localStorage.removeItem('trading-bot-dashboard-theme');
    document.documentElement.className = '';
    installMatchMedia();
  });

  it('defaults to system preference', () => {
    expect(getStoredThemePreference()).toBe('system');
    expect(resolveThemePreference('light')).toBe('light');
  });

  it('applies dark class from system theme and stores overrides', async () => {
    installMatchMedia(true);
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );

    await waitFor(() => expect(document.documentElement).toHaveClass('dark'));

    await userEvent.click(screen.getByTitle('Light theme'));
    expect(document.documentElement).not.toHaveClass('dark');
    expect(localStorage.getItem('trading-bot-dashboard-theme')).toBe('light');
  });
});
