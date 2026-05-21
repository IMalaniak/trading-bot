import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { RiskConfigAuditLogEntryDto } from '../lib/portfolio-api';
import { RiskConfigAuditLogView } from './risk-config-audit-log-view';

const entry: RiskConfigAuditLogEntryDto = {
  id: 'audit-1',
  entityType: 'INSTRUMENT_CONFIG',
  portfolioId: 'portfolio-alpha',
  field: 'enabled',
  oldValue: 'true',
  newValue: 'false',
  changedAt: '2026-05-21T10:00:00.000Z',
};

const portfolioEntry: RiskConfigAuditLogEntryDto = {
  id: 'audit-2',
  entityType: 'PORTFOLIO',
  portfolioId: 'portfolio-alpha',
  field: 'exposureCapNotional',
  oldValue: '1000',
  newValue: '2000',
  changedAt: '2026-05-21T11:00:00.000Z',
};

describe('RiskConfigAuditLogView', () => {
  it('shows empty state when no entries', () => {
    render(<RiskConfigAuditLogView entries={[]} />);

    expect(
      screen.getByRole('heading', { name: /no audit log entries/i }),
    ).toBeInTheDocument();
  });

  it('renders entry with field and old→new values', () => {
    render(<RiskConfigAuditLogView entries={[entry]} />);

    // Both mobile card and desktop table render the same content
    const fieldCells = screen.getAllByText('enabled');
    expect(fieldCells.length).toBeGreaterThanOrEqual(1);

    const oldValues = screen.getAllByText('true');
    expect(oldValues.length).toBeGreaterThanOrEqual(1);

    const newValues = screen.getAllByText('false');
    expect(newValues.length).toBeGreaterThanOrEqual(1);
  });

  it('renders entityType in the entry', () => {
    render(<RiskConfigAuditLogView entries={[entry]} />);

    const types = screen.getAllByText('INSTRUMENT_CONFIG');
    expect(types.length).toBeGreaterThanOrEqual(1);
  });

  it('renders multiple entries', () => {
    render(<RiskConfigAuditLogView entries={[entry, portfolioEntry]} />);

    const enabledFields = screen.getAllByText('enabled');
    expect(enabledFields.length).toBeGreaterThanOrEqual(1);

    const capFields = screen.getAllByText('exposureCapNotional');
    expect(capFields.length).toBeGreaterThanOrEqual(1);
  });
});
