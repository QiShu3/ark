import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, User, X } from 'lucide-react';
import { useCustomizationStore, CustomizationSettings } from '../lib/customization';

type SettingsModalProps = {
  open: boolean;
  onClose: () => void;
};

type TabType = 'personalization' | 'avatar';

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

  // Create a snapshot to revert if the user cancels
  const snapshotRef = useRef<CustomizationSettings | null>(null);

  useEffect(() => {
    if (open) {
      // Snapshot the current settings when opening the modal
      snapshotRef.current = {
        backgroundUrl: currentSettings.backgroundUrl,
        backgroundBlur: currentSettings.backgroundBlur,
        backgroundOpacity: currentSettings.backgroundOpacity,
        showCharacter: currentSettings.showCharacter,
        characterUrl: currentSettings.characterUrl,
        characterScale: currentSettings.characterScale,
      };
    }
  }, [open, currentSettings.backgroundUrl, currentSettings.backgroundBlur, currentSettings.backgroundOpacity, currentSettings.showCharacter, currentSettings.characterUrl, currentSettings.characterScale]);

  if (!open) return null;

  const handleCancel = () => {
    if (snapshotRef.current) {
      updateSettings(snapshotRef.current);
    }
    onClose();
  };

  const handleSave = () => {
    // Already updated in store in real-time, just close the modal
    onClose();
  };

  const handleRestoreDefaults = () => {
    resetToDefault();
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={handleCancel}
      role="dialog"
      aria-label="界面设置"
    >
      <div
        className="relative flex h-[520px] w-[720px] max-w-[92vw] overflow-hidden rounded-2xl border border-white/10 bg-[#121212]/90 shadow-2xl backdrop-blur-md animate-in zoom-in-95 duration-200"
        onClick={(event) => event.stopPropagation()}
      >
        {/* 左侧侧边栏 */}
        <div className="w-[200px] shrink-0 border-r border-white/10 bg-white/[0.02] flex flex-col p-4">
          <div className="mb-6 px-2">
            <h3 className="text-lg font-bold text-white">界面设置</h3>
            <p className="text-xs text-white/40">自定义你的专属空间</p>
          </div>

          <div className="flex flex-col gap-1 flex-1">
            <button
              type="button"
              onClick={() => setActiveTab('personalization')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'personalization'
                  ? 'bg-blue-600/25 border border-blue-500/30 text-blue-400 font-bold'
                  : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Sparkles size={16} />
              个性化
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('avatar')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'avatar'
                  ? 'bg-blue-600/25 border border-blue-500/30 text-blue-400 font-bold'
                  : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`}
            >
              <User size={16} />
              看板娘
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
          <div className="flex-1 overflow-y-auto p-6 pt-10">
            {activeTab === 'personalization' && (
              <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-left-4 duration-150">
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

                {/* 自定义背景 URL */}
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-white/70">自定义图片链接 (URL)</label>
                  <input
                    type="text"
                    value={currentSettings.backgroundUrl}
                    onChange={(e) => updateSettings({ backgroundUrl: e.target.value })}
                    placeholder="输入图片或壁纸的 https 链接"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/20 focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
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
              </div>
            )}

            {activeTab === 'avatar' && (
              <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-left-4 duration-150">
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

                    {/* 自定义人物 URL */}
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium text-white/70">自定义立绘链接 (URL)</label>
                      <input
                        type="text"
                        value={currentSettings.characterUrl}
                        onChange={(e) => updateSettings({ characterUrl: e.target.value })}
                        placeholder="输入立绘图片的 https 链接（透明背景 PNG 效果最佳）"
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/20 focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
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
                className="rounded-lg bg-blue-600 px-5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 active:scale-95"
              >
                保存并应用
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
