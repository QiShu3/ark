import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import NotFound from '../NotFound';

describe('NotFound', () => {
  it('renders a shell-preserving 404 state', () => {
    render(<NotFound />);

    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByText('页面不存在')).toBeInTheDocument();
  });
});
