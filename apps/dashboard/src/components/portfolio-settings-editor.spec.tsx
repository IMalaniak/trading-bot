import '@testing-library/jest-dom/vitest';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { PortfolioSummaryDto } from '../lib/portfolio-api';
import { PortfolioSettingsEditor } from './portfolio-settings-editor';

const summary: PortfolioSummaryDto = {
  portfolioId: 'portfolio-alpha',
  name: 'Alpha Portfolio',
  isActive: true,
  exposureCapNotional: '1000',
  aggregateExposureNotional: '150',
  openPositionCount: 1,
  updatedAt: '2026-05-21T10:00:00.000Z',
};

describe('PortfolioSettingsEditor', () => {
  it('renders current portfolio values', () => {
    render(<PortfolioSettingsEditor portfolio={summary} onSubmit={vi.fn()} />);

    expect(screen.getByRole('textbox', { name: /exposure cap/i })).toHaveValue(
      '1000',
    );
    expect(screen.getByRole('checkbox', { name: /active/i })).toBeChecked();
  });

  it('calls onSubmit with changed values', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<PortfolioSettingsEditor portfolio={summary} onSubmit={onSubmit} />);

    const capInput = screen.getByRole('textbox', { name: /exposure cap/i });
    await userEvent.clear(capInput);
    await userEvent.type(capInput, '2000');

    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        exposureCapNotional: '2000',
        isActive: true,
      });
    });
  });

  it('shows validation error for non-decimal exposure cap', async () => {
    render(<PortfolioSettingsEditor portfolio={summary} onSubmit={vi.fn()} />);

    const capInput = screen.getByRole('textbox', { name: /exposure cap/i });
    await userEvent.clear(capInput);
    await userEvent.type(capInput, 'not-a-number');

    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(
      await screen.findByText(/must be a valid decimal/i),
    ).toBeInTheDocument();
  });

  it('shows success state after submit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<PortfolioSettingsEditor portfolio={summary} onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByText(/saved/i)).toBeInTheDocument();
  });

  it('shows error message when submit rejects', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Server error'));
    render(<PortfolioSettingsEditor portfolio={summary} onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByText(/Server error/i)).toBeInTheDocument();
  });

  it('disables the save button while submitting', async () => {
    let resolveSubmit!: () => void;
    const onSubmit = vi.fn().mockReturnValue(
      new Promise<void>((resolve) => {
        resolveSubmit = resolve;
      }),
    );
    render(<PortfolioSettingsEditor portfolio={summary} onSubmit={onSubmit} />);

    const saveButton = screen.getByRole('button', { name: /save/i });
    await userEvent.click(saveButton);

    expect(saveButton).toBeDisabled();
    resolveSubmit();
  });
});
