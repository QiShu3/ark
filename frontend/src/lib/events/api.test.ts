import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { apiJson } from '../api';
import { createEvent, deleteEvent, getPrimaryEvent, listEvents, updateEvent } from './api';

vi.mock('../api', () => ({
  apiJson: vi.fn(),
}));

describe('event API wrappers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists events and fetches the primary event', async () => {
    (apiJson as Mock).mockResolvedValueOnce([]).mockResolvedValueOnce({ id: 'event-1' });

    await expect(listEvents()).resolves.toEqual([]);
    await expect(getPrimaryEvent()).resolves.toEqual({ id: 'event-1' });

    expect(apiJson).toHaveBeenNthCalledWith(1, '/todo/events');
    expect(apiJson).toHaveBeenNthCalledWith(2, '/todo/events/primary');
  });

  it('creates events with a JSON POST body', async () => {
    const input = {
      name: '论文投稿',
      start_date: '2026-03-01',
      due_at: '2026-03-20T08:00:00.000Z',
      is_primary: true,
    };
    (apiJson as Mock).mockResolvedValue({ id: 'event-1', ...input });

    await createEvent(input);

    expect(apiJson).toHaveBeenCalledWith('/todo/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  });

  it('updates and deletes events by id', async () => {
    const patch = { is_primary: true };
    (apiJson as Mock).mockResolvedValueOnce({ id: 'event-1' }).mockResolvedValueOnce({ ok: true });

    await updateEvent('event-1', patch);
    await deleteEvent('event-1');

    expect(apiJson).toHaveBeenNthCalledWith(1, '/todo/events/event-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    expect(apiJson).toHaveBeenNthCalledWith(2, '/todo/events/event-1', { method: 'DELETE' });
  });
});
