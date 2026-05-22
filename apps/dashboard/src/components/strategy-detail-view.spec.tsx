import '@testing-library/jest-dom/vitest';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { StrategyDto } from '../lib/portfolio-api';
import { StrategyDetailView } from './strategy-detail-view';

const strategy: StrategyDto = {
  id: 'strategy-1',
  name: 'SELL Only',
  description: 'Only takes SELL signals',
  allowedSides: [2],
  minIntervalSecs: 60,
  activeTimeStart: '09:00',
  activeTimeEnd: '17:00',
  createdAt: '2026-05-20T10:00:00.000Z',
  updatedAt: '2026-05-20T10:00:00.000Z',
};

describe('StrategyDetailView', () => {
  it('renders current strategy values', () => {
    render(<StrategyDetailView onUpdate={vi.fn()} strategy={strategy} />);

    expect(screen.getByRole('textbox', { name: /strategy name/i })).toHaveValue(
      'SELL Only',
    );
    expect(screen.getByRole('textbox', { name: /description/i })).toHaveValue(
      'Only takes SELL signals',
    );
    expect(screen.getByRole('checkbox', { name: /^sell$/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /^buy$/i })).not.toBeChecked();
    expect(
      screen.getByRole('spinbutton', { name: /min interval/i }),
    ).toHaveValue(60);
    expect(screen.getByRole('textbox', { name: /active from/i })).toHaveValue(
      '09:00',
    );
    expect(screen.getByRole('textbox', { name: /active until/i })).toHaveValue(
      '17:00',
    );
  });

  it('submits update with changed values', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(<StrategyDetailView onUpdate={onUpdate} strategy={strategy} />);

    const nameInput = screen.getByRole('textbox', { name: /strategy name/i });
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Updated Strategy');

    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Updated Strategy' }),
      );
    });
  });

  it('shows validation error when name is cleared', async () => {
    render(<StrategyDetailView onUpdate={vi.fn()} strategy={strategy} />);

    const nameInput = screen.getByRole('textbox', { name: /strategy name/i });
    await userEvent.clear(nameInput);
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByText(/name is required/i)).toBeInTheDocument();
  });

  it('shows validation error when no sides selected', async () => {
    render(<StrategyDetailView onUpdate={vi.fn()} strategy={strategy} />);

    await userEvent.click(screen.getByRole('checkbox', { name: /^sell$/i }));
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(
      await screen.findByText(/select at least one allowed side/i),
    ).toBeInTheDocument();
  });
});
