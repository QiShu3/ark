import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, User, X, Upload, Loader2, Monitor, Moon, Sun } from 'lucide-react';
import { useCustomizationStore, CustomizationSettings, DEFAULT_SETTINGS } from '../lib/customization';
import { useAuthStore } from '../lib/auth';
import { uploadFile, updateProfile, getUserUploads, deleteUserUpload, UserUpload } from '../lib/api';
import { useTheme, type ThemePreference } from '../hooks/useTheme';
import AppModalFrame from './AppModalFrame';

type SettingsModalProps = {
  open: boolean;
  onClose: () => void;
};

type TabType = 'profile' | 'personalization';

const PRESET_BACKGROUNDS = [
  {
    name: '默认星空',
    url: `${import.meta.env.BASE_URL || '/'}images/background.jpg`,
    thumbnail: `${import.meta.env.BASE_URL || '/'}images/background.jpg`,
  },
  {
    name: '极简深色',
    url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=600',
    thumbnail: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=200',
  },
  {
    name: '温馨绿植',
    url: 'https://images.unsplash.com/photo-1544816155-12df9643f363?q=80&w=600',
    thumbnail: 'https://images.unsplash.com/photo-1544816155-12df9643f363?q=80&w=200',
  },
  {
    name: '霓虹都市',
    url: 'https://images.unsplash.com/photo-1515621061946-eff1c2a352bd?q=80&w=600',
    thumbnail: 'https://images.unsplash.com/photo-1515621061946-eff1c2a352bd?q=80&w=200',
  },
];

const PRESET_CHARACTERS = [
  {
    name: '默认看板娘',
    url: `${import.meta.env.BASE_URL || '/'}images/chara.png`,
    thumbnail: `${import.meta.env.BASE_URL || '/'}images/chara.png`,
  },
];

const SettingsModal: React.FC<SettingsModalProps> = ({ open, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabType>('personalization');
  const updateSettings = useCustomizationStore((s) => s.updateSettings);
  const resetToDefault = useCustomizationStore((s) => s.resetToDefault);
  const currentSettings = useCustomizationStore();
  const user = useAuthStore((s) => s.user);
  const { themePreference, resolvedTheme, setThemePreference } = useTheme();

  // Upload loading states
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [bgUploading, setBgUploading] = useState(false);
  const [charaUploading, setCharaUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 用户已上传图片列表
  const [uploads, setUploads] = useState<UserUpload[]>([]);
  const bgUploads = uploads.filter((u) => u.category === 'background');
  const charaUploads = uploads.filter((u) => u.category === 'character');

  // File input refs
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const charaInputRef = useRef<HTMLInputElement>(null);

  // Create a snapshot to revert if the user cancels
  const snapshotRef = useRef<CustomizationSettings | null>(null);
  const themeSnapshotRef = useRef<ThemePreference | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      snapshotRef.current = {
        backgroundUrl: currentSettings.backgroundUrl,
        backgroundBlur: currentSettings.backgroundBlur,
        backgroundOpacity: currentSettings.backgroundOpacity,
        showCharacter: currentSettings.showCharacter,
        characterUrl: currentSettings.characterUrl,
        characterScale: currentSettings.characterScale,
        avatarUrl: currentSettings.avatarUrl,
      };
      themeSnapshotRef.current = themePreference;
    }
    if (!open) {
      snapshotRef.current = null;
      themeSnapshotRef.current = null;
    }
    wasOpenRef.current = open;
  }, [
    open,
    currentSettings.backgroundUrl,
    currentSettings.backgroundBlur,
    currentSettings.backgroundOpacity,
    currentSettings.showCharacter,
    currentSettings.characterUrl,
    currentSettings.characterScale,
    currentSettings.avatarUrl,
    themePreference,
  ]);

  // 打开弹窗时获取已上传图片
  useEffect(() => {
    if (!open) return;
    getUserUploads()
      .then(setUploads)
      .catch(() => {});
  }, [open]);

  if (!open) return null;

  const handleCancel = () => {
    if (snapshotRef.current) {
      updateSettings(snapshotRef.current);
    }
    if (themeSnapshotRef.current) {
      setThemePreference(themeSnapshotRef.current);
    }
    onClose();
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({
        avatar_url: currentSettings.avatarUrl || null,
        custom_background_url: currentSettings.backgroundUrl || null,
        custom_character_url: currentSettings.characterUrl || null,
        background_blur: currentSettings.backgroundBlur,
        background_opacity: currentSettings.backgroundOpacity,
        show_character: currentSettings.showCharacter,
        character_scale: currentSettings.characterScale,
      });
    } catch (err) {
      console.error('Failed to save profile settings:', err);
    } finally {
      setSaving(false);
    }
    onClose();
  };

  const handleRestoreDefaults = () => {
    resetToDefault();
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const { url } = await uploadFile(file);
      updateSettings({ avatarUrl: url });
      await updateProfile({ avatar_url: url });
    } catch (err) {
      console.error('Avatar upload failed:', err);
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const handleBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBgUploading(true);
    try {
      const { url } = await uploadFile(file, 'background');
      updateSettings({ backgroundUrl: url });
      setUploads((prev) => [{ url, category: 'background', created_at: new Date().toISOString() }, ...prev]);
    } catch (err) {
      console.error('Background upload failed:', err);
    } finally {
      setBgUploading(false);
      if (bgInputRef.current) bgInputRef.current.value = '';
    }
  };

  const handleCharaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCharaUploading(true);
    try {
      const { url } = await uploadFile(file, 'character');
      updateSettings({ characterUrl: url });
      setUploads((prev) => [{ url, category: 'character', created_at: new Date().toISOString() }, ...prev]);
    } catch (err) {
      console.error('Character upload failed:', err);
    } finally {
      setCharaUploading(false);
      if (charaInputRef.current) charaInputRef.current.value = '';
    }
  };

  const handleDeleteUpload = async (upload: UserUpload) => {
    if (!window.confirm('确定要删除这张图片吗？删除后无法恢复。')) return;
    try {
      await deleteUserUpload(upload.url);
      setUploads((prev) => prev.filter((u) => u.url !== upload.url));
      // 如果删除的是当前选中的图片，重置为默认
      if (upload.category === 'background' && currentSettings.backgroundUrl === upload.url) {
        updateSettings({ backgroundUrl: DEFAULT_SETTINGS.backgroundUrl });
      } else if (upload.category === 'character' && currentSettings.characterUrl === upload.url) {
        updateSettings({ characterUrl: DEFAULT_SETTINGS.characterUrl });
      }
    } catch (err) {
      console.error('Delete upload failed:', err);
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return iso;
    }
  };

  const themeOptions: Array<{ value: ThemePreference; label: string; icon: typeof Monitor }> = [
    { value: 'system', label: '跟随系统', icon: Monitor },
    { value: 'light', label: '日间', icon: Sun },
    { value: 'dark', label: '夜间', icon: Moon },
  ];

  return (
    <AppModalFrame
      open={true}
      onClose={handleCancel}
      zIndexClassName="z-[80]"
      ariaLabel="界面设置"
      panelClassName="relative flex h-[760px] w-[1160px] max-w-[96vw] overflow-hidden rounded-2xl shadow-2xl backdrop-blur-md animate-in zoom-in-95 duration-200"
    >
        {/* 左侧侧边栏 */}
        <div className="flex w-[280px] shrink-0 flex-col border-r ark-border bg-[var(--ark-surface-subtle)] p-4">
          <div className="mb-6 px-2">
            <h3 className="text-lg font-bold text-[var(--ark-text)]">界面设置</h3>
            <p className="text-xs text-[var(--ark-text-faint)]">自定义你的专属空间</p>
          </div>

          <div className="flex flex-col gap-1 flex-1">
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-bold transition-all ${
                activeTab === 'profile'
                  ? 'bg-blue-600/25 border border-blue-500/30 text-blue-400'
                  : 'border border-transparent text-[var(--ark-text-muted)] hover:bg-[var(--ark-surface)] hover:text-[var(--ark-text)]'
              }`}
            >
              <User size={16} />
              个人资料
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('personalization')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-bold transition-all ${
                activeTab === 'personalization'
                  ? 'bg-blue-600/25 border border-blue-500/30 text-blue-400'
                  : 'border border-transparent text-[var(--ark-text-muted)] hover:bg-[var(--ark-surface)] hover:text-[var(--ark-text)]'
              }`}
            >
              <Sparkles size={16} />
              个性化
            </button>
          </div>
        </div>

        {/* 右侧内容面板 */}
        <div className="flex flex-1 flex-col overflow-hidden bg-[var(--ark-surface)]">
          {/* 右上角关闭按钮 */}
          <div className="absolute right-4 top-4 z-10">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-full p-2 text-[var(--ark-text-muted)] transition-colors hover:bg-[var(--ark-surface-subtle)] hover:text-[var(--ark-text)]"
              aria-label="关闭设置弹窗"
            >
              <X size={20} />
            </button>
          </div>

          {/* 内容区 */}
          <div className="flex-1 overflow-y-auto p-8 pt-10">
            {activeTab === 'profile' && (
              <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-left-4 duration-150 pb-8">
                {/* === 个人资料 === */}
                <div>
                  <h4 className="mb-1 text-base font-bold text-[var(--ark-text)]">个人资料</h4>
                  <p className="text-xs text-[var(--ark-text-faint)]">管理你的账号信息和头像。</p>
                </div>

                {/* Avatar upload */}
                <div className="flex flex-col items-center gap-4 py-4">
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={avatarUploading}
                    className="group relative w-[120px] h-[120px] rounded-full overflow-hidden border-2 border-ark-border hover:border-blue-500/50 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    {currentSettings.avatarUrl ? (
                      <img src={currentSettings.avatarUrl} alt="头像" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-3xl font-bold text-ark-text">
                        {user?.username.charAt(0).toUpperCase() ?? '?'}
                      </div>
                    )}
                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-ark-overlay flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      {avatarUploading ? (
                        <Loader2 size={24} className="text-ark-text animate-spin" />
                      ) : (
                        <Upload size={24} className="text-ark-text" />
                      )}
                    </div>
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                  />
                  <p className="text-xs text-[var(--ark-text-faint)]">点击上传头像</p>
                </div>

                {/* User info */}
                <div className="ark-surface-subtle flex flex-col gap-3 rounded-xl border p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[var(--ark-text-muted)]">用户名</span>
                    <span className="text-sm font-medium text-[var(--ark-text)]">{user?.username ?? '—'}</span>
                  </div>
                  <div className="h-px bg-[var(--ark-border)]" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[var(--ark-text-muted)]">邮箱</span>
                    <span className="text-sm font-medium text-[var(--ark-text)]">{user?.email ?? '—'}</span>
                  </div>
                  <div className="h-px bg-[var(--ark-border)]" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[var(--ark-text-muted)]">注册时间</span>
                    <span className="text-sm font-medium text-[var(--ark-text)]">
                      {user?.created_at ? formatDate(user.created_at) : '—'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'personalization' && (
              <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-left-4 duration-150 pb-8">
                <div className="rounded-xl border ark-border bg-[var(--ark-surface-subtle)] p-4">
                  <div className="flex flex-col gap-1">
                    <h4 className="text-base font-bold text-[var(--ark-text)]">外观模式</h4>
                    <p className="text-xs text-[var(--ark-text-muted)]">
                      选择 Ark 使用日间、夜间，或跟随当前系统外观。
                    </p>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2" role="group" aria-label="外观模式">
                    {themeOptions.map((option) => {
                      const Icon = option.icon;
                      const active = themePreference === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setThemePreference(option.value)}
                          className={`ark-focus-ring flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                            active
                              ? 'border-[var(--ark-accent)] bg-[var(--ark-accent-soft)] text-[var(--ark-text)]'
                              : 'ark-border bg-[var(--ark-surface)] text-[var(--ark-text-muted)] hover:text-[var(--ark-text)]'
                          }`}
                        >
                          <Icon size={15} aria-hidden />
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  {themePreference === 'system' ? (
                    <p className="mt-3 text-xs text-[var(--ark-text-muted)]">
                      当前跟随为：{resolvedTheme === 'dark' ? '夜间' : '日间'}
                    </p>
                  ) : null}
                </div>

                {/* === 背景自定义部分 === */}
                <div>
                  <h4 className="mb-1 text-base font-bold text-[var(--ark-text)]">背景自定义</h4>
                  <p className="text-xs text-[var(--ark-text-faint)]">设置主界面的背景图，调整模糊及不透明度滤镜。</p>
                </div>

                {/* 预设背景图 */}
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-[var(--ark-text-muted)]">预设背景</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {PRESET_BACKGROUNDS.map((preset) => {
                      const isActive = currentSettings.backgroundUrl === preset.url;
                      return (
                        <button
                          key={preset.name}
                          type="button"
                          onClick={() => updateSettings({ backgroundUrl: preset.url })}
                          className={`group relative aspect-video overflow-hidden rounded-lg border bg-ark-surface-subtle text-left transition-all ${
                            isActive
                              ? 'border-blue-500 ring-2 ring-blue-500/50 scale-[1.02]'
                              : 'ark-border hover:border-[var(--ark-border-strong)]'
                          }`}
                        >
                          <img
                            src={preset.thumbnail}
                            alt={preset.name}
                            className="h-full w-full object-cover opacity-60 group-hover:opacity-85 transition-opacity"
                          />
                          <div className="absolute inset-x-0 bottom-0 bg-ark-overlay px-2 py-1 text-[10px] text-ark-text text-center truncate">
                            {preset.name}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 已上传背景图 */}
                {bgUploads.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-[var(--ark-text-muted)]">我的背景</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {bgUploads.map((upload) => {
                        const isActive = currentSettings.backgroundUrl === upload.url;
                        return (
                          <div key={upload.url} className="relative group">
                            <button
                              type="button"
                              onClick={() => updateSettings({ backgroundUrl: upload.url })}
                              className={`w-full aspect-video overflow-hidden rounded-lg border bg-ark-surface-subtle text-left transition-all ${
                                isActive
                                  ? 'border-blue-500 ring-2 ring-blue-500/50 scale-[1.02]'
                                  : 'ark-border hover:border-[var(--ark-border-strong)]'
                              }`}
                            >
                              <img
                                src={upload.url}
                                alt="已上传背景"
                                className="h-full w-full object-cover opacity-60 group-hover:opacity-85 transition-opacity"
                              />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleDeleteUpload(upload); }}
                              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-400 shadow-lg"
                              title="删除图片"
                            >
                              <X size={12} className="text-ark-text" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 上传本地背景图 */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => bgInputRef.current?.click()}
                      disabled={bgUploading}
                      className="flex items-center gap-2 self-start rounded-lg border border-dashed ark-border bg-[var(--ark-surface-subtle)] px-3 py-1.5 text-xs text-[var(--ark-text-muted)] transition-colors hover:border-blue-500/40 hover:bg-blue-500/5 hover:text-blue-400"
                    >
                      {bgUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                      {bgUploading ? '上传中…' : '或上传本地图片'}
                    </button>
                    <span className="text-xs text-[var(--ark-text-faint)]">已上传 {bgUploads.length}/3</span>
                  </div>
                  <input
                    ref={bgInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleBgUpload}
                  />
                </div>

                {/* 背景滤镜调节 */}
                <div className="ark-surface-subtle flex flex-col gap-4 rounded-xl border p-4">
                  {/* 背景模糊 */}
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between text-xs text-[var(--ark-text-muted)]">
                      <span>背景模糊</span>
                      <span className="text-blue-400 font-bold">{currentSettings.backgroundBlur}px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="20"
                      step="1"
                      value={currentSettings.backgroundBlur}
                      onChange={(e) => updateSettings({ backgroundBlur: Number(e.target.value) })}
                      className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-ark-surface-subtle accent-blue-500 focus:outline-none"
                    />
                    <div className="flex justify-between text-[10px] text-[var(--ark-text-faint)]">
                      <span>清晰</span>
                      <span>极度模糊</span>
                    </div>
                  </div>

                  {/* 背景不透明度 */}
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between text-xs text-[var(--ark-text-muted)]">
                      <span>背景不透明度</span>
                      <span className="text-blue-400 font-bold">{Math.round(currentSettings.backgroundOpacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="1.0"
                      step="0.05"
                      value={currentSettings.backgroundOpacity}
                      onChange={(e) => updateSettings({ backgroundOpacity: Number(e.target.value) })}
                      className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-ark-surface-subtle accent-blue-500 focus:outline-none"
                    />
                    <div className="flex justify-between text-[10px] text-[var(--ark-text-faint)]">
                      <span>透明</span>
                      <span>完全显示</span>
                    </div>
                  </div>
                </div>

                {/* 分割线 */}
                <div className="my-4 h-px shrink-0 bg-[var(--ark-border)]"></div>

                {/* === 看板娘设置部分 === */}
                <div>
                  <h4 className="mb-1 text-base font-bold text-[var(--ark-text)]">前景看板娘</h4>
                  <p className="text-xs text-[var(--ark-text-faint)]">设置主页前景中展示的心智人物角色或立绘。</p>
                </div>

                {/* 显隐开关 */}
                <div className="ark-surface-subtle flex items-center justify-between rounded-xl border p-4">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-[var(--ark-text)]">显示前景人物</span>
                    <span className="text-xs text-[var(--ark-text-faint)]">关闭后主页左侧将不渲染人物立绘</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateSettings({ showCharacter: !currentSettings.showCharacter })}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      currentSettings.showCharacter ? 'bg-blue-600' : 'bg-ark-surface-subtle'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        currentSettings.showCharacter ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {currentSettings.showCharacter && (
                  <div className="flex flex-col gap-6 animate-in fade-in duration-200">
                    {/* 预设人物图 */}
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium text-[var(--ark-text-muted)]">预设立绘</label>
                      <div className="grid grid-cols-4 gap-3">
                        {PRESET_CHARACTERS.map((preset) => {
                          const isActive = currentSettings.characterUrl === preset.url;
                          return (
                            <button
                              key={preset.name}
                              type="button"
                              onClick={() => updateSettings({ characterUrl: preset.url })}
                              className={`group relative aspect-[3/4] overflow-hidden rounded-lg border bg-ark-surface-subtle text-left transition-all ${
                                isActive
                                  ? 'border-blue-500 ring-2 ring-blue-500/50 scale-[1.02]'
                                  : 'ark-border hover:border-[var(--ark-border-strong)]'
                              }`}
                            >
                              <img
                                src={preset.thumbnail}
                                alt={preset.name}
                                className="h-full w-full object-contain p-2 opacity-70 group-hover:opacity-90 transition-opacity"
                              />
                              <div className="absolute inset-x-0 bottom-0 bg-ark-overlay px-2 py-0.5 text-[9px] text-ark-text text-center truncate">
                                {preset.name}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 已上传立绘 */}
                    {charaUploads.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-[var(--ark-text-muted)]">我的立绘</label>
                        <div className="grid grid-cols-4 gap-3">
                          {charaUploads.map((upload) => {
                            const isActive = currentSettings.characterUrl === upload.url;
                            return (
                              <div key={upload.url} className="relative group">
                                <button
                                  type="button"
                                  onClick={() => updateSettings({ characterUrl: upload.url })}
                                  className={`w-full aspect-[3/4] overflow-hidden rounded-lg border bg-ark-surface-subtle text-left transition-all ${
                                    isActive
                                      ? 'border-blue-500 ring-2 ring-blue-500/50 scale-[1.02]'
                                      : 'ark-border hover:border-[var(--ark-border-strong)]'
                                  }`}
                                >
                                  <img
                                    src={upload.url}
                                    alt="已上传立绘"
                                    className="h-full w-full object-contain p-2 opacity-70 group-hover:opacity-90 transition-opacity"
                                  />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleDeleteUpload(upload); }}
                                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-400 shadow-lg"
                                  title="删除图片"
                                >
                                  <X size={12} className="text-ark-text" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 上传本地立绘 */}
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => charaInputRef.current?.click()}
                          disabled={charaUploading}
                          className="flex items-center gap-2 self-start rounded-lg border border-dashed ark-border bg-[var(--ark-surface-subtle)] px-3 py-1.5 text-xs text-[var(--ark-text-muted)] transition-colors hover:border-blue-500/40 hover:bg-blue-500/5 hover:text-blue-400"
                        >
                          {charaUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                          {charaUploading ? '上传中…' : '或上传本地图片'}
                        </button>
                        <span className="text-xs text-[var(--ark-text-faint)]">已上传 {charaUploads.length}/3</span>
                      </div>
                      <input
                        ref={charaInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleCharaUpload}
                      />
                    </div>

                    {/* 人物大小微调 */}
                    <div className="ark-surface-subtle flex flex-col gap-2 rounded-xl border p-4">
                      <div className="flex justify-between text-xs text-[var(--ark-text-muted)]">
                        <span>大小比例 (Scale)</span>
                        <span className="text-blue-400 font-bold">{Math.round(currentSettings.characterScale * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="1.5"
                        step="0.05"
                        value={currentSettings.characterScale}
                        onChange={(e) => updateSettings({ characterScale: Number(e.target.value) })}
                        className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-ark-surface-subtle accent-blue-500 focus:outline-none"
                      />
                      <div className="flex justify-between text-[10px] text-[var(--ark-text-faint)]">
                        <span>缩小 (50%)</span>
                        <span>放大 (150%)</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 底部操作栏 */}
          <div className="flex shrink-0 items-center justify-between border-t ark-border bg-[var(--ark-surface-subtle)] p-5 pt-3">
            <button
              type="button"
              onClick={handleRestoreDefaults}
              className="ark-button-secondary rounded-lg px-4 py-1.5 text-xs transition-colors"
            >
              恢复默认
            </button>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleCancel}
                className="ark-button-secondary rounded-lg px-4 py-1.5 text-sm transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {saving ? '保存中…' : '保存并应用'}
              </button>
            </div>
          </div>
        </div>
    </AppModalFrame>
  );
};

export default SettingsModal;
