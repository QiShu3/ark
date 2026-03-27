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

// ─── 微信 Demo 数据 ────────────────────────────────────────────────────────────

const WECHAT_CHATS = [
  {
    id: 1,
    name: '莫宁',
    avatar: '🤖',
    msg: '前辈好呀！有什么需要帮忙的吗～',
    time: '16:09',
    unread: 2,
    avatarColor: '#6c5ce7',
  },
  {
    id: 2,
    name: '六级备考群',
    avatar: '📚',
    msg: '张三：今天的单词打卡完成了吗？',
    time: '15:42',
    unread: 12,
    avatarColor: '#00b894',
  },
  {
    id: 3,
    name: '李四',
    avatar: '🎮',
    msg: '周末要不要一起打游戏？',
    time: '昨天',
    unread: 0,
    avatarColor: '#e17055',
  },
  {
    id: 4,
    name: '妈妈',
    avatar: '💛',
    msg: '记得按时吃饭哦',
    time: '昨天',
    unread: 1,
    avatarColor: '#fdcb6e',
  },
  {
    id: 5,
    name: '大学同学群',
    avatar: '🎓',
    msg: '王五：毕业照的链接发给大家了',
    time: '周一',
    unread: 0,
    avatarColor: '#74b9ff',
  },
  {
    id: 6,
    name: '工作群',
    avatar: '💼',
    msg: '[文件] Q1季度总结报告.pdf',
    time: '周一',
    unread: 0,
    avatarColor: '#a29bfe',
  },
  {
    id: 7,
    name: '赵六',
    avatar: '🌙',
    msg: '好的，明天见！',
    time: '周日',
    unread: 0,
    avatarColor: '#81ecec',
  },
];

// ─── 底部 Tab 数据 ───────────────────────────────────────────────────────────

const TABS = [
  { icon: '💬', label: '微信', active: true },
  { icon: '👥', label: '通讯录', active: false },
  { icon: '☰', label: '发现', active: false },
  { icon: '👤', label: '我', active: false },
];

/**
 * PhoneSimulator — 模拟手机内部屏幕浮层（无外壳）
 *
 * 通过 Portal 挂载至 document.body，用 fixed 定位精确覆盖 anchorRef 区域。
 * 屏幕内容以微信会话列表为 demo 占位，后续可替换为实际功能页面。
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
    overflow: 'hidden',
  };

  // 当前时间 HH:MM
  const now = new Date();
  const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  return createPortal(
    <div
      ref={overlayRef}
      style={overlayStyle}
      className={`flex flex-col bg-[#EDEDED] text-[#000] select-none ${className}`}
    >
      {/* ── Status Bar ─────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-1 bg-[#EDEDED] shrink-0" style={{ fontSize: 11 }}>
        <span className="font-semibold text-black/80">{timeStr}</span>
        <div className="flex items-center gap-1">
          {/* 信号 */}
          <svg width="13" height="9" viewBox="0 0 13 9" fill="none">
            <rect x="0" y="5" width="2" height="4" rx="0.4" fill="#000" opacity="0.7" />
            <rect x="3" y="3.5" width="2" height="5.5" rx="0.4" fill="#000" opacity="0.7" />
            <rect x="6" y="2" width="2" height="7" rx="0.4" fill="#000" opacity="0.7" />
            <rect x="9" y="0" width="2" height="9" rx="0.4" fill="#000" opacity="0.7" />
          </svg>
          {/* WiFi */}
          <svg width="13" height="10" viewBox="0 0 13 10" fill="none">
            <path d="M6.5 8.5 a0.7 0.7 0 0 1 0-1.4 0.7 0.7 0 0 1 0 1.4z" fill="#000" opacity="0.7" />
            <path d="M4 6.2 Q6.5 4.2 9 6.2" stroke="#000" strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.7" />
            <path d="M2 4 Q6.5 1 11 4" stroke="#000" strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.5" />
          </svg>
          {/* 电池 */}
          <svg width="18" height="9" viewBox="0 0 18 9" fill="none">
            <rect x="0.5" y="0.5" width="14" height="8" rx="1.5" stroke="#000" strokeOpacity="0.7" strokeWidth="1" />
            <rect x="2" y="2" width="9" height="5" rx="0.5" fill="#000" opacity="0.7" />
            <path d="M15.5 3v3" stroke="#000" strokeOpacity="0.5" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      {/* ── 顶部导航栏 ─────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#EDEDED] border-b border-black/8 shrink-0">
        <button className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-black/8 transition-colors text-black/60">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
        <span className="text-base font-semibold text-black">微信</span>
        <button className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-black/8 transition-colors text-black/60">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {/* ── 聊天列表 ────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
        {WECHAT_CHATS.map((chat, idx) => (
          <div
            key={chat.id}
            className="flex items-center gap-3 px-4 py-2.5 bg-white hover:bg-[#f5f5f5] transition-colors cursor-pointer"
            style={{ borderBottom: idx < WECHAT_CHATS.length - 1 ? '0.5px solid rgba(0,0,0,0.08)' : 'none' }}
          >
            {/* 头像 */}
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0 relative"
              style={{ background: chat.avatarColor + '33', border: `1.5px solid ${chat.avatarColor}55` }}
            >
              {chat.avatar}
              {chat.unread > 0 && (
                <span
                  className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full flex items-center justify-center text-white"
                  style={{ fontSize: 9, background: '#fa5151', padding: '0 3px' }}
                >
                  {chat.unread > 99 ? '99+' : chat.unread}
                </span>
              )}
            </div>

            {/* 内容 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm text-black truncate">{chat.name}</span>
                <span className="text-[10px] text-black/35 shrink-0">{chat.time}</span>
              </div>
              <p className="text-[11px] text-black/40 truncate mt-0.5">{chat.msg}</p>
            </div>
          </div>
        ))}

        {/* 底部留白 */}
        <div className="h-3" />
      </div>

      {/* ── 底部 Tab Bar ──────────────────────────────────── */}
      <div
        className="flex items-center bg-[#F7F7F7] border-t border-black/10 shrink-0"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 6px)' }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.label}
            className="flex-1 flex flex-col items-center justify-center py-1.5 gap-0.5 transition-colors"
            style={{ color: tab.active ? '#07c160' : 'rgba(0,0,0,0.4)' }}
          >
            <span style={{ fontSize: 26, lineHeight: 1 }}>{tab.icon}</span>
            <span style={{ fontSize: 9 }}>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── 关闭按钮（右上角浮层） ──────────────────────────── */}
      <button
        onClick={onClose}
        aria-label="关闭手机模拟器"
        className="absolute top-8 right-2 w-7 h-7 rounded-full bg-black/20 hover:bg-black/35 flex items-center justify-center text-white transition-all duration-200"
        style={{ backdropFilter: 'blur(4px)' }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
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
