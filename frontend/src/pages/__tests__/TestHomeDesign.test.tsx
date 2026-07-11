import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import TestHomeDesign from '../TestHomeDesign';

describe('TestHomeDesign', () => {
  it('updates task progress and supports collapsing the assistant', () => {
    render(
      <MemoryRouter>
        <TestHomeDesign />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('今日任务完成 50%')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('标记为已完成：阅读理解精练'));
    expect(screen.getByLabelText('今日任务完成 75%')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /莫宁助手/ }));
    expect(screen.queryByText('调整顺序')).not.toBeInTheDocument();
  });
});
