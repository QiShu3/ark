import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { useAuthStore } from '../../lib/auth';
import Login from '../Login';

describe('Login page', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
    window.localStorage.clear();
  });

  it('shows the ICP备案 footer link', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: '粤ICP备2026047635号' })).toHaveAttribute(
      'href',
      'https://beian.miit.gov.cn/',
    );
  });
});
