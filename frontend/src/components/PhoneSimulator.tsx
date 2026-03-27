import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface PhoneSimulatorProps {
  /** 触发关闭的回调 */
  onClose: () => void;
  /** 参考元素的 ref，PhoneSimulator 将对齐覆盖该元素所在区域 */
  anchorRef: React.RefObject<HTMLElement | null>;
  /** 可选的额外 className */
  className?: string;
}

/**
 * PhoneSimulator — 模拟手机界面浮层
 *
 * 通过 Portal 挂载至 document.body，再用 fixed 定位精确覆盖 anchorRef
 * 所指向的容器区域（与 RightPanel 对齐）。
 *
 * 内容区域为占位设计，后续可替换为具体页面。
 */
const PhoneSimulator: React.FC<PhoneSimulatorProps> = ({ onClose, anchorRef, className = '' }) => {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // 计算并持续跟踪 anchorRef 的位置
  useEffect(() => {
    function updateRect() {
      if (anchorRef.current) {
        setRect(anchorRef.current.getBoundingClientRect());
      }
    }
    updateRect();
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [anchorRef]);

  // ESC 键关闭
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!rect) return null;

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    zIndex: 50,
  };

  return createPortal(
    <div
      ref={overlayRef}
      style={overlayStyle}
      className={`flex items-center justify-center bg-black/40 backdrop-blur-sm ${className}`}
    >
      {/* 手机外壳 */}
      <div
        className="relative flex flex-col"
        style={{
          width: 'min(56%, 240px)',
          // 标准手机比例约 19.5:9，这里取稍高的 19:9 视觉效果
          aspectRatio: '9 / 19',
          background: 'linear-gradient(160deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
          borderRadius: '2.4rem',
          boxShadow:
            '0 0 0 2px rgba(255,255,255,0.12), 0 0 0 5px #0a0a0a, 0 32px 64px rgba(0,0,0,0.7)',
          overflow: 'hidden',
        }}
      >
        {/* ---- Status Bar 占位 ---- */}
        <div className="flex items-center justify-between px-5 pt-3 pb-1 shrink-0">
          <span className="text-[9px] font-semibold text-white/70 tracking-wide">
            {new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </span>
          {/* 刘海 / Dynamic Island 占位 */}
          <div className="w-16 h-3.5 bg-black rounded-full" />
          <div className="flex items-center gap-1">
            {/* 信号格 */}
            <svg width="14" height="10" viewBox="0 0 14 10" fill="none" className="opacity-70">
              <rect x="0" y="6" width="2" height="4" fill="white" rx="0.5" />
              <rect x="3" y="4" width="2" height="6" fill="white" rx="0.5" />
              <rect x="6" y="2" width="2" height="8" fill="white" rx="0.5" />
              <rect x="9" y="0" width="2" height="10" fill="white" rx="0.5" />
            </svg>
            {/* 电池 */}
            <svg width="18" height="10" viewBox="0 0 18 10" fill="none" className="opacity-70">
              <rect x="0.5" y="0.5" width="14" height="9" rx="2" stroke="white" strokeWidth="1" />
              <rect x="2" y="2" width="9" height="6" rx="1" fill="white" />
              <rect x="15" y="3" width="2" height="4" rx="1" fill="white" />
            </svg>
          </div>
        </div>

        {/* ---- 主内容区 占位 ---- */}
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4 overflow-hidden">
          {/* 装饰光晕 */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse 60% 40% at 50% 40%, rgba(99,102,241,0.18) 0%, transparent 70%)',
              pointerEvents: 'none',
            }}
          />
          {/* 占位图标 */}
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
          >
            📱
          </div>
          <p className="text-white/40 text-[11px] text-center leading-relaxed">
            内容区域
            <br />
            <span className="text-white/25">( 占位 · 待开发 )</span>
          </p>
        </div>

        {/* ---- Home Indicator 占位 ---- */}
        <div className="flex justify-center pb-3 pt-1 shrink-0">
          <div className="w-24 h-1 rounded-full bg-white/30" />
        </div>
      </div>

      {/* 关闭按钮 */}
      <button
        onClick={onClose}
        aria-label="关闭手机模拟器"
        className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white/70 hover:text-white transition-all duration-200"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>,
    document.body,
  );
};

export default PhoneSimulator;
