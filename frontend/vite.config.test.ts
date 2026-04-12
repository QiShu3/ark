import viteConfig from './vite.config';

describe('vite dev proxy', () => {
  it('enables websocket proxying for /api routes', async () => {
    const configFactory = viteConfig as (env: { mode: string }) => unknown;
    const resolved = await configFactory({ mode: 'test' });
    const server = (resolved as { server?: { proxy?: Record<string, { ws?: boolean }> } }).server;

    expect(server?.proxy?.['/api']?.ws).toBe(true);
  });
});
