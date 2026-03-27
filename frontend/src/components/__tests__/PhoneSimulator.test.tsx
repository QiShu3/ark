import React, { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PhoneSimulator from '../PhoneSimulator';

// createPortal 在 jsdom 中需要 document.body
describe('PhoneSimulator', () => {
  it('renders inside the document', () => {
    const ref = createRef<HTMLDivElement>();
    const div = document.createElement('div');
    document.body.appendChild(div);
    Object.defineProperty(div, 'getBoundingClientRect', {
      value: () => ({ top: 0, left: 0, width: 400, height: 800 }),
    });
    // Assign the div to the ref manually
    (ref as React.MutableRefObject<HTMLDivElement>).current = div;

    const onClose = vi.fn();
    render(<PhoneSimulator anchorRef={ref} onClose={onClose} />);

    // 关闭按钮存在
    expect(screen.getByRole('button', { name: /关闭手机模拟器/i })).toBeDefined();
  });

  it('calls onClose when the close button is clicked', () => {
    const ref = createRef<HTMLDivElement>();
    const div = document.createElement('div');
    document.body.appendChild(div);
    Object.defineProperty(div, 'getBoundingClientRect', {
      value: () => ({ top: 0, left: 0, width: 400, height: 800 }),
    });
    (ref as React.MutableRefObject<HTMLDivElement>).current = div;

    const onClose = vi.fn();
    render(<PhoneSimulator anchorRef={ref} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /关闭手机模拟器/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when ESC key is pressed', () => {
    const ref = createRef<HTMLDivElement>();
    const div = document.createElement('div');
    document.body.appendChild(div);
    Object.defineProperty(div, 'getBoundingClientRect', {
      value: () => ({ top: 0, left: 0, width: 400, height: 800 }),
    });
    (ref as React.MutableRefObject<HTMLDivElement>).current = div;

    const onClose = vi.fn();
    render(<PhoneSimulator anchorRef={ref} onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
