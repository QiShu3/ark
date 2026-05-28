import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, User, X, Upload, Loader2 } from 'lucide-react';
import { useCustomizationStore, CustomizationSettings } from '../lib/customization';
import { useAuthStore } from '../lib/auth';
import { uploadFile, updateProfile, getUserUploads } from '../lib/api';

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

  // Upload loading states
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [bgUploading, setBgUploading] = useState(false);
  const [charaUploading, setCharaUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 上传数量计数（每类最多 3 张）
  const [bgCount, setBgCount] = useState(0);
  const [charaCount, setCharaCount] = useState(0);

  // File input refs
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const charaInputRef = useRef<HTMLInputElement>(null);

  // Create a snapshot to revert if the user cancels
  const snapshotRef = useRef<CustomizationSettings | null>(null);

  useEffect(() => {
    if (open) {
      snapshotRef.current = {
        backgroundUrl: currentSettings.backgroundUrl,
        backgroundBlur: currentSettings.backgroundBlur,
        backgroundOpacity: currentSettings.backgroundOpacity,
        showCharacter: currentSettings.showCharacter,
        characterUrl: currentSettings.characterUrl,
        characterScale: currentSettings.characterScale,
        avatarUrl: currentSettings.avatarUrl,
      };
    }
  }, [open, currentSettings.backgroundUrl, currentSettings.backgroundBlur, currentSettings.backgroundOpacity, currentSettings.showCharacter, currentSettings.characterUrl, currentSettings.characterScale, currentSettings.avatarUrl]);

  // 打开弹窗时获取上传数量
  useEffect(() => {
    if (!open) return;
    getUserUploads()
      .then((uploads) => {
        setBgCount(uploads.filter((u) => u.category === 'background').length);
        setCharaCount(uploads.filter((u) => u.category === 'character').length);
      })
      .catch(() => {});
  }, [open]);

  if (!open) return null;

  const handleCancel = () => {
    if (snapshotRef.current) {
      updateSettings(snapshotRef.current);
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
      setBgCount((c) => c + 1);
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
      setCharaCount((c) => c + 1);
    } catch (err) {
      console.error('Character upload failed:', err);
    } finally {
      setCharaUploading(false);
      if (charaInputRef.current) charaInputRef.current.value = '';
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return iso;
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={handleCancel}
      role="dialog"
      aria-label="界面设置"
    >
      <div
        className="relative flex h-[760px] w-[1160px] max-h-[88vh] max-w-[96vw] overflow-hidden rounded-2xl border border-white/10 bg-[#121212]/90 shadow-2xl backdrop-blur-md animate-in zoom-in-95 duration-200"
        onClick={(event) => event.stopPropagation()}
      >
        {/* 左侧侧边栏 */}
        <div className="w-[280px] shrink-0 border-r border-white/10 bg-white/[0.02] flex flex-col p-4">
          <div className="mb-6 px-2">
            <h3 className="text-lg font-bold text-white">界面设置</h3>
            <p className="text-xs text-white/40">自定义你的专属空间</p>
          </div>

          <div className="flex flex-col gap-1 flex-1">
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-bold transition-all ${
                activeTab === 'profile'
                  ? 'bg-blue-600/25 border border-blue-500/30 text-blue-400'
                  : 'border border-transparent text-white/50 hover:bg-white/5 hover:text-white/80'
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
                  : 'border border-transparent text-white/50 hover:bg-white/5 hover:text-white/80'
              }`}
            >
              <Sparkles size={16} />
              个性化
            </button>
          </div>
        </div>

        {/* 右侧内容面板 */}
        <div className="flex flex-1 flex-col overflow-hidden bg-[#181818]/65">
          {/* 右上角关闭按钮 */}
          <div className="absolute right-4 top-4 z-10">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-full p-2 text-white/55 transition-colors hover:bg-white/10 hover:text-white"
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
                  <h4 className="text-base font-bold text-white mb-1">个人资料</h4>
                  <p className="text-xs text-white/45">管理你的账号信息和头像。</p>
                </div>

                {/* Avatar upload */}
                <div className="flex flex-col items-center gap-4 py-4">
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={avatarUploading}
                    className="group relative w-[120px] h-[120px] rounded-full overflow-hidden border-2 border-white/15 hover:border-blue-500/50 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    {currentSettings.avatarUrl ? (
                      <img src={currentSettings.avatarUrl} alt="头像" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-3xl font-bold text-white">
                        {user?.username.charAt(0).toUpperCase() ?? '?'}
                      </div>
                    )}
                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      {avatarUploading ? (
                        <Loader2 size={24} className="text-white animate-spin" />
                      ) : (
                        <Upload size={24} className="text-white" />
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
                  <p className="text-xs text-white/40">点击上传头像</p>
                </div>

                {/* User info */}
                <div className="flex flex-col gap-3 bg-white/[0.02] border border-white/5 rounded-xl p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white/50">用户名</span>
                    <span className="text-sm font-medium text-white">{user?.username ?? '—'}</span>
                  </div>
                  <div className="h-px bg-white/5" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white/50">注册时间</span>
                    <span className="text-sm font-medium text-white">
                      {user?.created_at ? formatDate(user.created_at) : '—'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'personalization' && (
              <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-left-4 duration-150 pb-8">
                {/* === 背景自定义部分 === */}
                <div>
                  <h4 className="text-base font-bold text-white mb-1">背景自定义</h4>
                  <p className="text-xs text-white/45">设置主界面的背景图，调整模糊及不透明度滤镜。</p>
                </div>

                {/* 预设背景图 */}
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-white/70">预设背景</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {PRESET_BACKGROUNDS.map((preset) => {
                      const isActive = currentSettings.backgroundUrl === preset.url;
                      return (
                        <button
                          key={preset.name}
                          type="button"
                          onClick={() => updateSettings({ backgroundUrl: preset.url })}
                          className={`group relative aspect-video overflow-hidden rounded-lg border bg-white/5 text-left transition-all ${
                            isActive
                              ? 'border-blue-500 ring-2 ring-blue-500/50 scale-[1.02]'
                              : 'border-white/10 hover:border-white/20'
                          }`}
                        >
                          <img
                            src={preset.thumbnail}
                            alt={preset.name}
                            className="h-full w-full object-cover opacity-60 group-hover:opacity-85 transition-opacity"
                          />
                          <div className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 text-[10px] text-white/80 text-center truncate">
                            {preset.name}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 上传本地背景图 */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => bgInputRef.current?.click()}
                      disabled={bgUploading}
                      className="flex items-center gap-2 self-start rounded-lg border border-dashed border-white/15 bg-white/[0.03] px-3 py-1.5 text-xs text-white/50 transition-colors hover:border-blue-500/40 hover:bg-blue-500/5 hover:text-blue-400"
                    >
                      {bgUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                      {bgUploading ? '上传中…' : '或上传本地图片'}
                    </button>
                    <span className="text-xs text-white/30">已上传 {bgCount}/3</span>
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
                <div className="flex flex-col gap-4 bg-white/[0.02] border border-white/5 rounded-xl p-4">
                  {/* 背景模糊 */}
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between text-xs text-white/60">
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
                      className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-white/10 accent-blue-500 focus:outline-none"
                    />
                    <div className="flex justify-between text-[10px] text-white/25">
                      <span>清晰</span>
                      <span>极度模糊</span>
                    </div>
                  </div>

                  {/* 背景不透明度 */}
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between text-xs text-white/60">
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
                      className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-white/10 accent-blue-500 focus:outline-none"
                    />
                    <div className="flex justify-between text-[10px] text-white/25">
                      <span>透明</span>
                      <span>完全显示</span>
                    </div>
                  </div>
                </div>

                {/* 分割线 */}
                <div className="h-px bg-white/10 my-4 shrink-0"></div>

                {/* === 看板娘设置部分 === */}
                <div>
                  <h4 className="text-base font-bold text-white mb-1">前景看板娘</h4>
                  <p className="text-xs text-white/45">设置主页前景中展示的心智人物角色或立绘。</p>
                </div>

                {/* 显隐开关 */}
                <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-4">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-white">显示前景人物</span>
                    <span className="text-xs text-white/40">关闭后主页左侧将不渲染人物立绘</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateSettings({ showCharacter: !currentSettings.showCharacter })}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      currentSettings.showCharacter ? 'bg-blue-600' : 'bg-white/15'
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
                      <label className="text-sm font-medium text-white/70">预设立绘</label>
                      <div className="grid grid-cols-4 gap-3">
                        {PRESET_CHARACTERS.map((preset) => {
                          const isActive = currentSettings.characterUrl === preset.url;
                          return (
                            <button
                              key={preset.name}
                              type="button"
                              onClick={() => updateSettings({ characterUrl: preset.url })}
                              className={`group relative aspect-[3/4] overflow-hidden rounded-lg border bg-white/5 text-left transition-all ${
                                isActive
                                  ? 'border-blue-500 ring-2 ring-blue-500/50 scale-[1.02]'
                                  : 'border-white/10 hover:border-white/20'
                              }`}
                            >
                              <img
                                src={preset.thumbnail}
                                alt={preset.name}
                                className="h-full w-full object-contain p-2 opacity-70 group-hover:opacity-90 transition-opacity"
                              />
                              <div className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-0.5 text-[9px] text-white/80 text-center truncate">
                                {preset.name}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 上传本地立绘 */}
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => charaInputRef.current?.click()}
                          disabled={charaUploading}
                          className="flex items-center gap-2 self-start rounded-lg border border-dashed border-white/15 bg-white/[0.03] px-3 py-1.5 text-xs text-white/50 transition-colors hover:border-blue-500/40 hover:bg-blue-500/5 hover:text-blue-400"
                        >
                          {charaUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                          {charaUploading ? '上传中…' : '或上传本地图片'}
                        </button>
                        <span className="text-xs text-white/30">已上传 {charaCount}/3</span>
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
                    <div className="flex flex-col gap-2 bg-white/[0.02] border border-white/5 rounded-xl p-4">
                      <div className="flex justify-between text-xs text-white/60">
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
                        className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-white/10 accent-blue-500 focus:outline-none"
                      />
                      <div className="flex justify-between text-[10px] text-white/25">
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
          <div className="flex shrink-0 items-center justify-between border-t border-white/10 bg-white/[0.01] p-5 pt-3">
            <button
              type="button"
              onClick={handleRestoreDefaults}
              className="rounded-lg border border-white/5 bg-white/5 px-4 py-1.5 text-xs text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            >
              恢复默认
            </button>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-1.5 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
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
      </div>
    </div>
  );
};

export default SettingsModal;
