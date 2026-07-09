import { useEffect, useState } from 'react';
import { Trash2, Upload, X } from 'lucide-react';

import AppModalFrame from '../AppModalFrame';
import Button from '../Button';
import {
  listDeliberateBanks,
  type DeliberateKind,
  type DeliberateSubApp,
} from '../../lib/deliberate/api';

type EditSubAppModalProps = {
  subApp: DeliberateSubApp;
  saving: boolean;
  onSave: (patch: {
    name?: string;
    description?: string;
    icon?: string;
    bank_ids?: string[];
  }) => Promise<void>;
  onDelete: () => Promise<void>;
  onUploadBank: (kind: DeliberateKind) => void;
  onClose: () => void;
};

const inputClass =
  'w-full rounded-lg border border-ark-border bg-ark-input px-3 py-2 text-sm text-ark-text placeholder:text-ark-text-faint focus:outline-none focus:ring-2 focus:ring-[var(--ark-focus-ring)]';

const ICON_OPTIONS = [
  { value: 'workflow', label: '工作流' },
  { value: 'book-open', label: '书本' },
  { value: 'scroll-text', label: '文本' },
  { value: 'bar-chart', label: '图表' },
];

export default function EditSubAppModal({
  subApp,
  saving,
  onSave,
  onDelete,
  onUploadBank,
  onClose,
}: EditSubAppModalProps) {
  const [name, setName] = useState(subApp.name);
  const [description, setDescription] = useState(subApp.description);
  const [icon, setIcon] = useState(subApp.icon);
  const [bankIds, setBankIds] = useState<string[]>(subApp.bank_ids);
  const [allBanks, setAllBanks] = useState<{ id: string; name: string; count: number; kind: DeliberateKind }[]>([]);
  const [loadingBanks, setLoadingBanks] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let ignore = false;
    const loadAllBanks = async () => {
      setLoadingBanks(true);
      const results: { id: string; name: string; count: number; kind: DeliberateKind }[] = [];
      for (const k of ['choice', 'flash_card', 'input'] as DeliberateKind[]) {
        try {
          const data = await listDeliberateBanks(k);
          for (const bank of data) {
            results.push({ id: bank.id, name: bank.name, count: bank.count, kind: k });
          }
        } catch {
          // ignore
        }
      }
      if (!ignore) {
        setAllBanks(results);
        setLoadingBanks(false);
      }
    };
    void loadAllBanks();
    return () => { ignore = true; };
  }, []);

  const kindLabel = (k: DeliberateKind) => (k === 'flash_card' ? '闪卡' : k === 'input' ? '输入题' : '选择题');
  const countLabel = (k: DeliberateKind) => (k === 'flash_card' ? '词' : '题');

  const canSave = name.trim().length > 0;

  function toggleBank(id: string) {
    setBankIds((prev) => (prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]));
  }

  async function handleSave() {
    await onSave({
      name: name.trim(),
      description: description.trim(),
      icon,
      bank_ids: bankIds,
    });
  }

  return (
    <AppModalFrame open={true} onClose={onClose} ariaLabel="编辑子应用">
      <div className="w-[600px] max-w-[92vw] space-y-4 rounded-xl border border-ark-border bg-ark-surface p-5 shadow-xl">
        <div className="flex items-center justify-between border-b border-ark-border pb-3">
          <h3 className="text-lg font-semibold text-ark-text">编辑子应用</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-ark-text-muted hover:bg-ark-surface-subtle hover:text-ark-text"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ark-text-muted">名称</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ark-text-muted">描述</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ark-text-muted">图标</label>
            <div className="grid grid-cols-4 gap-2">
              {ICON_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setIcon(opt.value)}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                    icon === opt.value
                      ? 'bg-ark-surface-strong text-ark-text'
                      : 'text-ark-text-muted hover:text-ark-text'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-ark-text-muted">关联题库</label>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<Upload className="h-3.5 w-3.5" />}
                onClick={() => onUploadBank('choice')}
              >
                上传新题库
              </Button>
            </div>
            {loadingBanks ? (
              <p className="text-xs text-ark-text-faint">正在加载题库…</p>
            ) : allBanks.length === 0 ? (
              <p className="text-xs text-ark-text-faint">暂无题库</p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto rounded-lg border border-ark-border bg-ark-surface-subtle p-3">
                {allBanks.map((bank) => (
                  <label
                    key={bank.id}
                    className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-ark-surface"
                  >
                    <input
                      type="checkbox"
                      checked={bankIds.includes(bank.id)}
                      onChange={() => toggleBank(bank.id)}
                      className="rounded border-ark-border"
                    />
                    <span className="flex-1 text-sm text-ark-text">{bank.name}</span>
                    <span className="text-xs text-ark-text-faint">
                      {bank.count} {countLabel(bank.kind)} · {kindLabel(bank.kind)}
                    </span>
                  </label>
                ))}
              </div>
            )}
            {bankIds.length > 0 && (
              <p className="mt-1.5 text-xs text-ark-text-muted">已选 {bankIds.length} 个题库</p>
            )}
          </div>

          {/* Delete section */}
          <div className="border-t border-ark-border pt-4">
            {!confirmDelete ? (
              <Button
                variant="ghost"
                leftIcon={<Trash2 className="h-4 w-4" />}
                onClick={() => setConfirmDelete(true)}
              >
                删除子应用
              </Button>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                <span className="flex-1 text-sm text-ark-text">确认删除？该子应用的所有数据将被永久删除。</span>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>取消</Button>
                <Button
                  variant="primary"
                  size="sm"
                  loading={saving}
                  onClick={() => void onDelete()}
                >
                  确认删除
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-ark-border pt-4">
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button
            variant="primary"
            loading={saving}
            loadingText="保存中"
            disabled={!canSave}
            onClick={() => void handleSave()}
          >
            保存
          </Button>
        </div>
      </div>
    </AppModalFrame>
  );
}
