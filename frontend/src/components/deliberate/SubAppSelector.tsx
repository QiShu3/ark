import { ChevronDown, Edit3, Plus } from 'lucide-react';

import type { DeliberateSubApp } from '../../lib/deliberate/api';
import Button from '../Button';

type SubAppSelectorProps = {
  subApps: DeliberateSubApp[];
  selectedAppId: string | null;
  onSelect: (appId: string | null) => void;
  onCreate: () => void;
  onEdit: (app: DeliberateSubApp) => void;
};

export default function SubAppSelector({
  subApps,
  selectedAppId,
  onSelect,
  onCreate,
  onEdit,
}: SubAppSelectorProps) {
  const selectedApp = subApps.find((a) => a.id === selectedAppId) ?? null;

  return (
    <section className="grid gap-3 rounded-lg border border-ark-border bg-ark-surface-subtle p-4 md:grid-cols-[minmax(0,1fr)_auto_auto]">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ark-text-muted">当前子应用</span>
        <div className="relative">
          <select
            value={selectedAppId ?? ''}
            onChange={(e) => onSelect(e.target.value || null)}
            className="w-full appearance-none rounded-lg border border-ark-border bg-ark-input px-3 py-2 pr-8 text-sm text-ark-text focus:outline-none focus:ring-2 focus:ring-[var(--ark-focus-ring)]"
          >
            <option value="">全局</option>
            {subApps.map((app) => (
              <option key={app.id} value={app.id}>{app.name}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ark-text-faint" />
        </div>
      </label>
      <div className="flex items-end">
        {selectedApp && (
          <Button
            variant="ghost"
            leftIcon={<Edit3 className="h-4 w-4" />}
            onClick={() => onEdit(selectedApp)}
          >
            编辑
          </Button>
        )}
      </div>
      <div className="flex items-end">
        <Button
          variant="primary"
          leftIcon={<Plus className="h-4 w-4" />}
          onClick={onCreate}
        >
          新建子应用
        </Button>
      </div>
    </section>
  );
}
