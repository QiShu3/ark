# Home Right Panel Collapse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a desktop-only collapse/expand interaction for the home page right panel, with a slim edge handle and persisted local browser state.

**Architecture:** Keep the existing two-column home layout and add one collapsed state in the page container so both columns can react together. The left panel widens when collapsed, while the right panel remains mounted, clips its card content, and exposes a keyboard-accessible edge handle for reopening.

**Tech Stack:** React 19, TypeScript, Tailwind CSS utilities, Vitest, Testing Library, Zustand-backed browser storage already present elsewhere in the frontend.

---

## File Map

- Modify: `frontend/src/App.tsx`
  Own the collapsed state, initialize it from `localStorage`, persist changes, and pass props into the two home panels.
- Modify: `frontend/src/components/LeftPanel.tsx`
  Accept the collapsed state and widen the hero column on desktop when the right panel is folded away.
- Modify: `frontend/src/components/RightPanel.tsx`
  Accept the collapsed state and toggle callback, animate width changes, clip card content while collapsed, and render the edge handle button.
- Create: `frontend/src/components/__tests__/HomeLayout.test.tsx`
  Verify the home page defaults to expanded, persists collapse state to storage, and restores a saved collapsed state.
- Create: `frontend/src/components/__tests__/RightPanel.test.tsx`
  Verify the right panel exposes the correct accessible button label, keeps its cards mounted, and marks the content region hidden when collapsed.

### Task 1: Wire Home Layout State Through `App`

**Files:**
- Create: `frontend/src/components/__tests__/HomeLayout.test.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/LeftPanel.tsx`
- Modify: `frontend/src/components/RightPanel.tsx`

- [ ] **Step 1: Write the failing home layout state test**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../../App';

const leftPanelSpy = vi.fn(({ collapsed }: { collapsed: boolean }) => (
  <div data-testid="left-panel" data-collapsed={String(collapsed)} />
));

const rightPanelSpy = vi.fn(({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) => (
  <button data-testid="right-panel-toggle" data-collapsed={String(collapsed)} onClick={onToggle}>
    toggle
  </button>
));

vi.mock('../Navigation', () => ({
  default: () => <div data-testid="navigation">Navigation</div>,
}));

vi.mock('../LeftPanel', () => ({
  default: (props: { collapsed: boolean }) => leftPanelSpy(props),
}));

vi.mock('../RightPanel', () => ({
  default: (props: { collapsed: boolean; onToggle: () => void }) => rightPanelSpy(props),
}));

describe('App home layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('defaults to expanded and persists collapsed state after toggle', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByTestId('left-panel')).toHaveAttribute('data-collapsed', 'false');
    expect(screen.getByTestId('right-panel-toggle')).toHaveAttribute('data-collapsed', 'false');

    await user.click(screen.getByTestId('right-panel-toggle'));

    expect(screen.getByTestId('left-panel')).toHaveAttribute('data-collapsed', 'true');
    expect(screen.getByTestId('right-panel-toggle')).toHaveAttribute('data-collapsed', 'true');
    expect(window.localStorage.getItem('ark-home-right-panel-collapsed')).toBe('true');
  });

  it('restores a previously collapsed state from localStorage', () => {
    window.localStorage.setItem('ark-home-right-panel-collapsed', 'true');

    render(<App />);

    expect(screen.getByTestId('left-panel')).toHaveAttribute('data-collapsed', 'true');
    expect(screen.getByTestId('right-panel-toggle')).toHaveAttribute('data-collapsed', 'true');
  });
});
```

- [ ] **Step 2: Run the new test to verify it fails**

```bash
cd /Users/qishu/Project/ark/frontend
pnpm test -- --run src/components/__tests__/HomeLayout.test.tsx
```

Expected: FAIL because `App` does not yet track `rightPanelCollapsed` or pass `collapsed` / `onToggle` props into `LeftPanel` and `RightPanel`.

- [ ] **Step 3: Implement the home-level collapse state and left-panel width behavior**

Update `frontend/src/App.tsx` to own the storage-backed state:

```tsx
import React, { useEffect, useState } from 'react';
import Navigation from './components/Navigation';
import LeftPanel from './components/LeftPanel';
import RightPanel from './components/RightPanel';

const HOME_RIGHT_PANEL_STORAGE_KEY = 'ark-home-right-panel-collapsed';

function App() {
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(HOME_RIGHT_PANEL_STORAGE_KEY) === 'true';
  });

  useEffect(() => {
    window.localStorage.setItem(HOME_RIGHT_PANEL_STORAGE_KEY, String(rightPanelCollapsed));
  }, [rightPanelCollapsed]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black text-white font-sans">
      <div className="fixed inset-0 z-0">
        <img
          src={`${import.meta.env.BASE_URL}images/background.jpg`}
          alt="Background"
          className="w-full h-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60"></div>
      </div>

      <Navigation />

      <div className="relative z-10 flex w-full h-full pt-0">
        <LeftPanel collapsed={rightPanelCollapsed} />
        <RightPanel
          collapsed={rightPanelCollapsed}
          onToggle={() => setRightPanelCollapsed((prev) => !prev)}
        />
      </div>
    </div>
  );
}

export default App;
```

Update `frontend/src/components/LeftPanel.tsx` to react to the new prop:

```tsx
import React from 'react';
import CharacterDisplay from './CharacterDisplay';
import EventCountdownCard from './EventCountdownCard';
import { cn } from '../lib/utils';

type LeftPanelProps = {
  collapsed: boolean;
};

const LeftPanel: React.FC<LeftPanelProps> = ({ collapsed }) => {
  return (
    <div
      className={cn(
        'h-full relative border-r border-white/10 transition-all duration-300 ease-out',
        collapsed ? 'w-[65%] lg:w-[calc(100%-1rem)]' : 'w-[65%] lg:w-[65%]',
      )}
    >
      <EventCountdownCard />

      <div className="w-full h-full absolute top-0 left-0 pt-16 z-0 flex items-center justify-center">
        <CharacterDisplay />
      </div>
    </div>
  );
};

export default LeftPanel;
```

Update `frontend/src/components/RightPanel.tsx` so it accepts the new prop contract while preserving the current layout:

```tsx
import React, { useRef } from 'react';
import PlaceholderCard from './PlaceholderCard';

interface RightPanelProps {
  collapsed: boolean;
  onToggle: () => void;
}

const RightPanel: React.FC<RightPanelProps> = ({ collapsed, onToggle }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const configs = [
    { split: 1 },
    { split: 2 },
    { split: 2 },
    { split: 3 },
  ];

  void collapsed;
  void onToggle;

  return (
    <div ref={panelRef} className="w-[35%] mt-16 h-[calc(100%-4rem)] p-4 flex flex-col gap-4">
      {configs.map((config, i) => (
        <PlaceholderCard
          key={i}
          index={i}
          split={config.split}
          anchorRef={i === 3 ? panelRef : undefined}
        />
      ))}
    </div>
  );
};
```

- [ ] **Step 4: Run the home layout test again**

```bash
cd /Users/qishu/Project/ark/frontend
pnpm test -- --run src/components/__tests__/HomeLayout.test.tsx
```

Expected: PASS with 2 tests covering default expanded state and storage restoration.

- [ ] **Step 5: Commit the state wiring**

```bash
cd /Users/qishu/Project/ark
git add frontend/src/App.tsx frontend/src/components/LeftPanel.tsx frontend/src/components/RightPanel.tsx frontend/src/components/__tests__/HomeLayout.test.tsx
git commit -m "feat(frontend): persist home right panel layout state"
```

### Task 2: Add the Right Panel Collapse Handle and Content Clipping

**Files:**
- Create: `frontend/src/components/__tests__/RightPanel.test.tsx`
- Modify: `frontend/src/components/RightPanel.tsx`

- [ ] **Step 1: Write the failing right panel interaction test**

```tsx
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
```

- [ ] **Step 2: Run the right panel test to verify it fails**

```bash
cd /Users/qishu/Project/ark/frontend
pnpm test -- --run src/components/__tests__/RightPanel.test.tsx
```

Expected: FAIL because `RightPanel` does not yet render any toggle button, `aria-label`, or content wrapper with `aria-hidden`.

- [ ] **Step 3: Implement the edge handle, width animation, and clipped content**

Replace `frontend/src/components/RightPanel.tsx` with this shape:

```tsx
import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import PlaceholderCard from './PlaceholderCard';
import { cn } from '../lib/utils';

interface RightPanelProps {
  collapsed: boolean;
  onToggle: () => void;
}

const RightPanel: React.FC<RightPanelProps> = ({ collapsed, onToggle }) => {
  const panelRef = useRef<HTMLDivElement>(null);

  const configs = [
    { split: 1 },
    { split: 2 },
    { split: 2 },
    { split: 3 },
  ];

  return (
    <aside
      className={cn(
        'relative mt-16 h-[calc(100%-4rem)] overflow-visible transition-[width,padding] duration-300 ease-out',
        collapsed ? 'w-[35%] p-4 lg:w-4 lg:px-0 lg:py-4' : 'w-[35%] p-4 lg:w-[35%]',
      )}
    >
      <button
        type="button"
        aria-label={collapsed ? 'Expand right panel' : 'Collapse right panel'}
        onClick={onToggle}
        className={cn(
          'absolute top-1/2 z-20 hidden -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/35 text-white/80 backdrop-blur-md transition-all duration-200 hover:bg-black/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 lg:flex',
          collapsed ? 'right-0 h-24 w-4' : 'right-1 h-16 w-6',
        )}
      >
        {collapsed ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-4 w-4" />}
      </button>

      <div
        ref={panelRef}
        data-testid="right-panel-content"
        aria-hidden={collapsed}
        className={cn(
          'flex h-full flex-col gap-4 overflow-hidden transition-opacity duration-200',
          collapsed ? 'pointer-events-none opacity-0' : 'opacity-100',
        )}
      >
        {configs.map((config, i) => (
          <PlaceholderCard
            key={i}
            index={i}
            split={config.split}
            anchorRef={i === 3 ? panelRef : undefined}
          />
        ))}
      </div>
    </aside>
  );
};

export default RightPanel;
```

- [ ] **Step 4: Run the right panel test again**

```bash
cd /Users/qishu/Project/ark/frontend
pnpm test -- --run src/components/__tests__/RightPanel.test.tsx
```

Expected: PASS with both expanded and collapsed behaviors covered.

- [ ] **Step 5: Commit the right panel UI**

```bash
cd /Users/qishu/Project/ark
git add frontend/src/components/RightPanel.tsx frontend/src/components/__tests__/RightPanel.test.tsx
git commit -m "feat(frontend): add home right panel collapse handle"
```

### Task 3: Run Focused Regression Checks and Manual Smoke Test

**Files:**
- Test: `frontend/src/components/__tests__/HomeLayout.test.tsx`
- Test: `frontend/src/components/__tests__/RightPanel.test.tsx`
- Verify: `frontend/src/App.tsx`
- Verify: `frontend/src/components/LeftPanel.tsx`
- Verify: `frontend/src/components/RightPanel.tsx`

- [ ] **Step 1: Run the targeted frontend tests together**

```bash
cd /Users/qishu/Project/ark/frontend
pnpm test -- --run src/components/__tests__/HomeLayout.test.tsx src/components/__tests__/RightPanel.test.tsx
```

Expected: PASS for all new tests.

- [ ] **Step 2: Run the frontend type check**

```bash
cd /Users/qishu/Project/ark/frontend
pnpm check
```

Expected: PASS with no TypeScript errors from the new props or button markup.

- [ ] **Step 3: Run a browser smoke test against the home page**

```bash
cd /Users/qishu/Project/ark/frontend
pnpm dev
```

Verify manually in `http://localhost:5173/#/`:

```text
1. Home page loads with the right panel expanded.
2. Clicking the collapse button shrinks the right panel to a slim edge handle.
3. The left hero area expands without a jarring jump.
4. Refreshing the page keeps the collapsed state.
5. Clicking the handle expands the panel again.
6. Tab + Enter can activate the handle in both directions.
```

- [ ] **Step 4: Check the final diff before handoff**

```bash
cd /Users/qishu/Project/ark
git status --short
git diff -- frontend/src/App.tsx frontend/src/components/LeftPanel.tsx frontend/src/components/RightPanel.tsx frontend/src/components/__tests__/HomeLayout.test.tsx frontend/src/components/__tests__/RightPanel.test.tsx
```

Expected: only the intended home layout and test changes are present.
