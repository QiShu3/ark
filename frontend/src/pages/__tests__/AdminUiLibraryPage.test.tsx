import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { describe, expect, it } from 'vitest';

import AdminUiLibraryPage from '../AdminUiLibraryPage';

describe('AdminUiLibraryPage', () => {
  it('renders the component library sections and core examples', () => {
    render(<AdminUiLibraryPage />);

    expect(screen.getByRole('main', { name: 'UI 组件库' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'UI 组件库' })).toBeInTheDocument();
    expect(screen.getByText('组件资产')).toBeInTheDocument();
    expect(screen.getByText('Theme Tokens')).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Button' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'HomeCard' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'HomeSectionHeader' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'WorkflowPhaseChips' })).toBeInTheDocument();
    expect(screen.getByText('ERC 真题练习')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'AppModalFrame' })).toBeInTheDocument();
    expect(screen.getByText('--ark-text')).toBeInTheDocument();
    expect(screen.getByText('--ark-glass-surface')).toBeInTheDocument();
  });

  it('opens the AppModalFrame preview', async () => {
    const user = userEvent.setup();
    render(<AdminUiLibraryPage />);

    await user.click(screen.getByRole('button', { name: '预览弹窗' }));

    const dialog = screen.getByRole('dialog', { name: 'AppModalFrame 预览' });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'AppModalFrame' })).toBeInTheDocument();
  });
});
