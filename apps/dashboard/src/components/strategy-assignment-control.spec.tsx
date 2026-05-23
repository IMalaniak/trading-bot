import '@testing-library/jest-dom/vitest';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { StrategyDto } from '../lib/portfolio-api';
import { StrategyAssignmentControl } from './strategy-assignment-control';

const strategies: StrategyDto[] = [
  {
    id: 'strategy-1',
    name: 'SELL Only',
    description: 'Only takes SELL signals',
    allowedSides: [2],
    createdAt: '2026-05-20T10:00:00.000Z',
    updatedAt: '2026-05-20T10:00:00.000Z',
  },
  {
    id: 'strategy-2',
    name: 'BUY Only',
    description: 'Only takes BUY signals',
    allowedSides: [1],
    createdAt: '2026-05-20T10:00:00.000Z',
    updatedAt: '2026-05-20T10:00:00.000Z',
  },
];

describe('StrategyAssignmentControl', () => {
  it('shows assigned strategy name', () => {
    render(
      <StrategyAssignmentControl
        assignedStrategyId="strategy-1"
        onAssign={vi.fn()}
        strategies={strategies}
      />,
    );

    expect(
      screen.getByRole('combobox', { name: /assigned strategy/i }),
    ).toHaveValue('strategy-1');
    expect(screen.getByText(/sell only/i)).toBeInTheDocument();
  });

  it('shows none when no strategy is assigned', () => {
    render(
      <StrategyAssignmentControl onAssign={vi.fn()} strategies={strategies} />,
    );

    expect(
      screen.getByRole('combobox', { name: /assigned strategy/i }),
    ).toHaveValue('');
  });

  it('calls onAssign with selected strategy id', async () => {
    const onAssign = vi.fn().mockResolvedValue(undefined);
    render(
      <StrategyAssignmentControl onAssign={onAssign} strategies={strategies} />,
    );

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /assigned strategy/i }),
      'strategy-2',
    );

    await waitFor(() => {
      expect(onAssign).toHaveBeenCalledWith('strategy-2');
    });
  });

  it('calls onAssign with null when cleared', async () => {
    const onAssign = vi.fn().mockResolvedValue(undefined);
    render(
      <StrategyAssignmentControl
        assignedStrategyId="strategy-1"
        onAssign={onAssign}
        strategies={strategies}
      />,
    );

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /assigned strategy/i }),
      '',
    );

    await waitFor(() => {
      expect(onAssign).toHaveBeenCalledWith(null);
    });
  });
});
