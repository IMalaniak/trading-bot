import '@testing-library/jest-dom/vitest';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { StrategyDto } from '../lib/portfolio-api';
import { StrategyListView } from './strategy-list-view';

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

describe('StrategyListView', () => {
  it('renders strategy list', () => {
    render(
      <StrategyListView
        onCreate={vi.fn()}
        onSelect={vi.fn()}
        strategies={[strategy]}
      />,
    );

    expect(screen.getByText('SELL Only')).toBeInTheDocument();
    expect(screen.getByText('Only takes SELL signals')).toBeInTheDocument();
    expect(screen.getByText('SELL')).toBeInTheDocument();
  });

  it('shows empty state when no strategies', () => {
    render(
      <StrategyListView
        onCreate={vi.fn()}
        onSelect={vi.fn()}
        strategies={[]}
      />,
    );

    expect(
      screen.getByRole('heading', { name: /no strategies/i }),
    ).toBeInTheDocument();
  });

  it('submits create form with valid values', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(
      <StrategyListView
        onCreate={onCreate}
        onSelect={vi.fn()}
        strategies={[]}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: /new strategy/i }),
    );

    await userEvent.type(
      screen.getByRole('textbox', { name: /strategy name/i }),
      'My Strategy',
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /^buy$/i }));

    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'My Strategy', allowedSides: [1] }),
      );
    });
  });

  it('shows validation error when name is empty', async () => {
    render(
      <StrategyListView
        onCreate={vi.fn()}
        onSelect={vi.fn()}
        strategies={[]}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: /new strategy/i }),
    );
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));

    expect(await screen.findByText(/name is required/i)).toBeInTheDocument();
  });

  it('shows validation error when no sides selected', async () => {
    render(
      <StrategyListView
        onCreate={vi.fn()}
        onSelect={vi.fn()}
        strategies={[]}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: /new strategy/i }),
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: /strategy name/i }),
      'Test',
    );
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));

    expect(
      await screen.findByText(/select at least one allowed side/i),
    ).toBeInTheDocument();
  });

  it('calls onSelect when a strategy row is clicked', async () => {
    const onSelect = vi.fn();
    render(
      <StrategyListView
        onCreate={vi.fn()}
        onSelect={onSelect}
        strategies={[strategy]}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /sell only/i }));
    expect(onSelect).toHaveBeenCalledWith(strategy);
  });
});
