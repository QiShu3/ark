import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import RightPanel from '../RightPanel';

vi.mock('../PlaceholderCard', () => ({
  default: ({ index }: { index: number }) => <div data-testid={`placeholder-card-${index}`}>Card {index}</div>,
}));

describe('RightPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a collapse affordance while expanded', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();

    render(<RightPanel collapsed={false} onToggle={onToggle} />);

    expect(screen.getByRole('button', { name: 'Collapse right panel' })).toBeInTheDocument();
    expect(screen.getByTestId('right-panel-content')).toHaveAttribute('aria-hidden', 'false');

    await user.click(screen.getByRole('button', { name: 'Collapse right panel' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('keeps cards mounted and exposes an expand affordance while collapsed', () => {
    render(<RightPanel collapsed={true} onToggle={() => {}} />);

    expect(screen.getByRole('button', { name: 'Expand right panel' })).toBeInTheDocument();
    expect(screen.getByTestId('right-panel-content')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('placeholder-card-0')).toBeInTheDocument();
    expect(screen.getByTestId('placeholder-card-3')).toBeInTheDocument();
  });
});
