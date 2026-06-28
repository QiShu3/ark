import { useState } from 'react';
import { FileUp, X } from 'lucide-react';

import AppModalFrame from '../AppModalFrame';
import Button from '../Button';
import type { DeliberateKind, DeliberateUploadError } from '../../lib/deliberate/api';

type UploadBankModalProps = {
  kind: DeliberateKind;
  uploading: boolean;
  onUpload: (data: {
    kind: DeliberateKind;
    name: string;
    description: string;
    file: File;
  }) => Promise<void>;
  onClose: () => void;
};

const inputClass =
  'w-full rounded-lg border border-ark-border bg-ark-input px-3 py-2 text-sm text-ark-text placeholder:text-ark-text-faint focus:outline-none focus:ring-2 focus:ring-[var(--ark-focus-ring)]';

export default function UploadBankModal({
  kind,
  uploading,
  onUpload,
  onClose,
}: UploadBankModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const kindLabel = kind === 'flashcard' ? '闪卡' : kind === 'input' ? '输入题' : '选择题';

  async function handleUpload() {
    if (!name.trim()) {
      setErrors(['请填写题库名称']);
      return;
    }
    if (!file) {
      setErrors(['请选择 JSON 或 ZIP 文件']);
      return;
    }
    setErrors([]);
    try {
      await onUpload({ kind, name: name.trim(), description, file });
      onClose();
    } catch (err) {
      const rich = err as DeliberateUploadError;
      setErrors(rich.errors || [rich.message || '上传失败']);
    }
  }

  return (
    <AppModalFrame open={true} onClose={onClose} ariaLabel="上传题库">
      <div className="w-[480px] max-w-[92vw] space-y-4 rounded-xl border border-ark-border bg-ark-surface p-5 shadow-xl">
        <div className="flex items-center justify-between border-b border-ark-border pb-3">
          <h3 className="text-lg font-semibold text-ark-text">上传{kindLabel}题库</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-ark-text-muted hover:bg-ark-surface-subtle hover:text-ark-text"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ark-text-muted">题库名称</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="输入题库名称"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ark-text-muted">JSON 或 ZIP 文件</label>
            <input
              type="file"
              accept=".json,application/json,.zip,application/zip"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-ark-text-muted file:mr-3 file:rounded-md file:border file:border-ark-border file:bg-ark-surface-subtle file:px-3 file:py-2 file:text-sm file:text-ark-text"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ark-text-muted">描述（可选）</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`${inputClass} min-h-16`}
              placeholder="题库描述"
            />
          </div>

          {errors.length > 0 && (
            <div className="rounded-md bg-red-500/10 p-2 text-xs text-red-400">
              {errors.map((err, i) => <div key={i}>{err}</div>)}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-ark-border pt-4">
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            loading={uploading}
            loadingText="上传中"
            leftIcon={<FileUp className="h-4 w-4" />}
            onClick={() => void handleUpload()}
          >
            上传题库
          </Button>
        </div>
      </div>
    </AppModalFrame>
  );
}
