import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Flame,
  LayoutDashboard,
  MessageCircle,
  MoreHorizontal,
  Pause,
  Play,
  Search,
  Sparkles,
  Target,
  Trophy,
} from 'lucide-react';

import { useTheme } from '../hooks/useTheme';

type TodayTask = {
  id: number;
  title: string;
  meta: string;
  duration: string;
  completed: boolean;
};

const INITIAL_TASKS: TodayTask[] = [
  { id: 1, title: '核心词汇复习', meta: '闪卡 · 80 个单词', duration: '25 分钟', completed: true },
  { id: 2, title: '阅读理解精练', meta: 'Text 04 · 方法训练', duration: '50 分钟', completed: false },
  { id: 3, title: '错题回顾', meta: '近 7 天 · 12 道题', duration: '30 分钟', completed: false },
  { id: 4, title: '每日复盘', meta: '学习记录与明日计划', duration: '15 分钟', completed: true },
];

const NAV_ITEMS = [
  { label: '工作台', icon: LayoutDashboard },
  { label: '学习计划', icon: CalendarDays },
  { label: '资料库', icon: BookOpen },
  { label: '学习成果', icon: Trophy },
];

const WEEK_DAYS = [
  { weekday: '一', day: 6, status: 'done' },
  { weekday: '二', day: 7, status: 'done' },
  { weekday: '三', day: 8, status: 'done' },
  { weekday: '四', day: 9, status: 'done' },
  { weekday: '五', day: 10, status: 'today' },
  { weekday: '六', day: 11, status: 'idle' },
  { weekday: '日', day: 12, status: 'idle' },
];

function formatTimer(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function TestHomeDesign() {
  useTheme();
  const [activeNav, setActiveNav] = useState('工作台');
  const [tasks, setTasks] = useState(INITIAL_TASKS);
  const [focusRunning, setFocusRunning] = useState(false);
  const [focusSeconds, setFocusSeconds] = useState(50 * 60);
  const [assistantOpen, setAssistantOpen] = useState(true);
  const [assistantMessage, setAssistantMessage] = useState('你还有 2 项学习任务。建议先完成阅读理解，再集中回顾错题。');

  useEffect(() => {
    if (!focusRunning || focusSeconds <= 0) return;
    const timer = window.setInterval(() => setFocusSeconds((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [focusRunning, focusSeconds]);

  const completedCount = tasks.filter((task) => task.completed).length;
  const progress = Math.round((completedCount / tasks.length) * 100);
  const todayLabel = useMemo(
    () => new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date()),
    [],
  );

  function toggleTask(taskId: number) {
    setTasks((current) => current.map((task) => (
      task.id === taskId ? { ...task, completed: !task.completed } : task
    )));
  }

  return (
    <div className="ark-test-page h-screen min-w-[1180px] overflow-hidden bg-ark-surface-subtle text-ark-text">
      <header className="flex h-[72px] items-center border-b border-ark-border bg-ark-surface-strong px-7">
        <Link to="/" className="ark-focus-ring flex items-center gap-3 rounded-lg" aria-label="返回当前首页">
          <img src="/favicon.png" alt="" className="h-9 w-9 rounded-lg" />
          <span className="text-lg font-bold">Ark</span>
          <span className="border-l border-ark-border pl-3 text-sm text-ark-text-faint">学习工作台</span>
        </Link>

        <nav className="ml-12 flex h-full items-center gap-1" aria-label="主导航">
          {NAV_ITEMS.map(({ label, icon: Icon }) => {
            const active = activeNav === label;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setActiveNav(label)}
                className={`ark-focus-ring relative flex h-full items-center gap-2 px-4 text-sm font-medium transition-colors ${
                  active ? 'text-ark-text' : 'text-ark-text-muted hover:text-ark-text'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
                {active ? <span className="absolute inset-x-4 bottom-0 h-0.5 bg-ark-accent" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            className="ark-focus-ring flex h-10 items-center gap-2 rounded-lg border border-ark-border bg-ark-surface-subtle px-3 text-sm text-ark-text-muted transition-colors hover:bg-ark-surface hover:text-ark-text"
          >
            <Target className="h-4 w-4 text-ark-accent" aria-hidden="true" />
            考研英语冲刺
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" className="ark-test-icon-button ark-focus-ring" aria-label="搜索">
            <Search className="h-5 w-5" aria-hidden="true" />
          </button>
          <button type="button" className="ark-test-icon-button ark-focus-ring" aria-label="通知中心">
            <Bell className="h-5 w-5" aria-hidden="true" />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-ark-accent" aria-hidden="true" />
          </button>
          <button type="button" className="ark-focus-ring ml-1 flex h-10 w-10 items-center justify-center rounded-lg bg-ark-text text-sm font-bold text-ark-surface-strong" aria-label="打开用户菜单">
            Q
          </button>
        </div>
      </header>

      <div className="grid h-[calc(100vh-72px)] grid-cols-[220px_minmax(0,1fr)]">
        <aside className="flex flex-col border-r border-ark-border bg-ark-surface-strong p-4">
          <div className="px-3 pb-3 pt-2 text-xs font-semibold text-ark-text-faint">今天</div>
          <button type="button" className="ark-focus-ring flex items-center gap-3 rounded-lg bg-ark-accent-soft px-3 py-2.5 text-left text-sm font-semibold text-ark-text">
            <LayoutDashboard className="h-4 w-4 text-ark-accent" aria-hidden="true" />
            今日概览
          </button>
          <button type="button" className="ark-focus-ring mt-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-ark-text-muted transition-colors hover:bg-ark-surface-subtle hover:text-ark-text">
            <Clock3 className="h-4 w-4" aria-hidden="true" />
            专注记录
          </button>

          <div className="mt-6 px-3 pb-3 text-xs font-semibold text-ark-text-faint">快捷入口</div>
          <button type="button" className="ark-focus-ring flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-ark-text-muted transition-colors hover:bg-ark-surface-subtle hover:text-ark-text">
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            单词闪卡
            <span className="ml-auto text-xs text-ark-text-faint">80</span>
          </button>
          <button type="button" className="ark-focus-ring mt-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-ark-text-muted transition-colors hover:bg-ark-surface-subtle hover:text-ark-text">
            <Target className="h-4 w-4" aria-hidden="true" />
            阅读训练
          </button>

          <div className="mt-auto border-t border-ark-border pt-4">
            <div className="flex items-center gap-3 px-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ark-accent-soft text-ark-accent">
                <Flame className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <div className="text-sm font-semibold">连续学习 12 天</div>
                <div className="text-xs text-ark-text-faint">本周已专注 8.4 小时</div>
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 overflow-y-auto px-8 py-7">
          <div className="mx-auto max-w-[1600px]">
            <div className="mb-5 flex items-end justify-between">
              <div>
                <p className="text-sm font-medium text-ark-text-muted">{todayLabel}</p>
                <h1 className="mt-1 text-2xl font-bold">下午好，七叔</h1>
              </div>
              <span className="text-sm text-ark-text-faint">今日目标 120 分钟 · 已完成 55 分钟</span>
            </div>

            <div className="grid grid-cols-[minmax(0,1.8fr)_minmax(320px,0.8fr)] items-start gap-7">
              <div className="min-w-0">
              <section className="ark-test-focus-stage relative h-[270px] overflow-hidden rounded-2xl p-7" aria-labelledby="focus-title">
                <div className="relative z-10 flex h-full max-w-[68%] flex-col">
                  <div className="flex items-center gap-2 text-xs font-semibold opacity-70">
                    <span className="h-2 w-2 rounded-full bg-ark-accent" aria-hidden="true" />
                    下一项学习任务
                  </div>
                  <h2 id="focus-title" className="mt-5 text-2xl font-bold">阅读理解精练 · Text 04</h2>
                  <p className="mt-2 max-w-xl text-sm leading-6 opacity-70">先完成限时阅读，再逐题分析定位依据。系统会在结束后生成错因摘要。</p>

                  <div className="mt-5 flex items-center gap-2 text-xs font-medium">
                    <span className="rounded-md border border-current px-2 py-1 opacity-70">限时阅读 20min</span>
                    <ArrowRight className="h-3.5 w-3.5 opacity-50" aria-hidden="true" />
                    <span className="rounded-md border border-current px-2 py-1 opacity-70">题目作答 15min</span>
                    <ArrowRight className="h-3.5 w-3.5 opacity-50" aria-hidden="true" />
                    <span className="rounded-md border border-current px-2 py-1 opacity-70">错题复盘 15min</span>
                  </div>

                  <div className="mt-auto flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => setFocusRunning((current) => !current)}
                      className="ark-focus-ring inline-flex h-11 items-center gap-2 rounded-lg bg-white px-5 text-sm font-bold text-slate-950 shadow-md transition-transform hover:scale-[1.01] active:scale-[0.98]"
                    >
                      {focusRunning ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4 fill-current" aria-hidden="true" />}
                      {focusRunning ? '暂停专注' : '开始专注'}
                    </button>
                    <span className="font-mono text-lg font-semibold tabular-nums" aria-live="polite">{formatTimer(focusSeconds)}</span>
                  </div>
                </div>

                <img src="/images/chara.png" alt="" className="ark-test-focus-character absolute bottom-[-22%] right-[-1%] h-[132%] max-w-[42%] object-contain object-bottom" />
              </section>

              <section className="mt-7 overflow-hidden rounded-xl border border-ark-border bg-ark-surface-strong" aria-labelledby="today-plan-title">
                <div className="flex items-center justify-between border-b border-ark-border px-5 py-4">
                  <div>
                    <h2 id="today-plan-title" className="text-base font-bold">今日计划</h2>
                    <p className="mt-0.5 text-xs text-ark-text-faint">按建议顺序完成，减少任务切换</p>
                  </div>
                  <button type="button" className="ark-focus-ring rounded-lg px-3 py-2 text-sm font-medium text-ark-accent transition-colors hover:bg-ark-accent-soft">
                    管理计划
                  </button>
                </div>

                <div>
                  {tasks.map((task, index) => (
                    <div key={task.id} className={`flex items-center gap-4 px-5 py-4 ${index < tasks.length - 1 ? 'border-b border-ark-border' : ''}`}>
                      <button
                        type="button"
                        onClick={() => toggleTask(task.id)}
                        aria-label={`${task.completed ? '标记为未完成' : '标记为已完成'}：${task.title}`}
                        aria-pressed={task.completed}
                        className={`ark-focus-ring flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors ${
                          task.completed ? 'border-ark-accent bg-ark-accent text-[var(--ark-on-accent)]' : 'border-ark-border-strong text-transparent hover:border-ark-accent'
                        }`}
                      >
                        <Check className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm font-semibold ${task.completed ? 'text-ark-text-faint line-through' : 'text-ark-text'}`}>{task.title}</div>
                        <div className="mt-1 text-xs text-ark-text-faint">{task.meta}</div>
                      </div>
                      <span className="text-xs font-medium text-ark-text-muted">{task.duration}</span>
                      <button type="button" className="ark-test-icon-button ark-focus-ring h-8 w-8" aria-label={`更多操作：${task.title}`}>
                        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            </div>

              <aside className="min-w-0">
              <section className="rounded-xl border border-ark-border bg-ark-surface-strong p-5" aria-labelledby="progress-title">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 id="progress-title" className="text-base font-bold">今日进度</h2>
                    <p className="mt-1 text-xs text-ark-text-faint">已完成 {completedCount} / {tasks.length} 项</p>
                  </div>
                  <div
                    className="ark-test-progress-ring flex h-16 w-16 items-center justify-center rounded-full"
                    style={{ '--ark-test-progress': `${progress}%` } as React.CSSProperties}
                    aria-label={`今日任务完成 ${progress}%`}
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ark-surface-strong text-sm font-bold tabular-nums">{progress}%</span>
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-2 border-t border-ark-border pt-4">
                  <div>
                    <div className="text-xl font-bold tabular-nums">55</div>
                    <div className="text-xs text-ark-text-faint">专注分钟</div>
                  </div>
                  <div className="border-l border-ark-border pl-5">
                    <div className="text-xl font-bold tabular-nums">3</div>
                    <div className="text-xs text-ark-text-faint">完成阶段</div>
                  </div>
                </div>
              </section>

              <section className="mt-4 rounded-xl border border-ark-border bg-ark-surface-strong p-5" aria-labelledby="week-title">
                <div className="flex items-center justify-between">
                  <h2 id="week-title" className="text-base font-bold">本周节奏</h2>
                  <button type="button" className="ark-focus-ring rounded-md px-2 py-1 text-xs text-ark-text-muted hover:bg-ark-surface-subtle">查看日历</button>
                </div>
                <div className="mt-5 grid grid-cols-7 gap-2">
                  {WEEK_DAYS.map((item) => (
                    <div key={item.day} className="flex flex-col items-center gap-2">
                      <span className="text-[11px] text-ark-text-faint">{item.weekday}</span>
                      <span className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-semibold ${
                        item.status === 'today'
                          ? 'bg-ark-accent text-[var(--ark-on-accent)]'
                          : item.status === 'done'
                            ? 'bg-ark-accent-soft text-ark-accent'
                            : 'bg-ark-surface-subtle text-ark-text-muted'
                      }`}>
                        {item.day}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="mt-4 rounded-xl border border-ark-border bg-ark-surface-strong p-5" aria-labelledby="schedule-title">
                <div className="flex items-center justify-between">
                  <h2 id="schedule-title" className="text-base font-bold">接下来</h2>
                  <button type="button" className="ark-focus-ring rounded-md px-2 py-1 text-xs text-ark-text-muted hover:bg-ark-surface-subtle">安排</button>
                </div>
                <div className="mt-4 space-y-4">
                  <div className="grid grid-cols-[48px_12px_1fr] items-start gap-2">
                    <span className="text-xs font-semibold tabular-nums text-ark-text-muted">15:30</span>
                    <span className="mt-1 h-2.5 w-2.5 rounded-full bg-ark-accent" aria-hidden="true" />
                    <div>
                      <div className="text-sm font-semibold">阅读理解精练</div>
                      <div className="mt-1 text-xs text-ark-text-faint">预计 50 分钟</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-[48px_12px_1fr] items-start gap-2">
                    <span className="text-xs font-semibold tabular-nums text-ark-text-muted">20:00</span>
                    <span className="mt-1 h-2.5 w-2.5 rounded-full border-2 border-ark-border-strong bg-ark-surface-strong" aria-hidden="true" />
                    <div>
                      <div className="text-sm font-semibold">第一轮复习</div>
                      <div className="mt-1 text-xs text-ark-text-faint">复盘今日错题</div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="mt-4 overflow-hidden rounded-xl border border-ark-border bg-ark-surface-strong" aria-labelledby="assistant-title">
                <button
                  type="button"
                  onClick={() => setAssistantOpen((current) => !current)}
                  className="ark-focus-ring flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-ark-surface-subtle"
                  aria-expanded={assistantOpen}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ark-accent-soft text-ark-accent">
                    <Sparkles className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span id="assistant-title" className="block text-sm font-bold">莫宁助手</span>
                    <span className="block text-xs text-ark-text-faint">学习建议与快速操作</span>
                  </span>
                  <ChevronRight className={`h-4 w-4 text-ark-text-faint transition-transform ${assistantOpen ? 'rotate-90' : ''}`} aria-hidden="true" />
                </button>
                {assistantOpen ? (
                  <div className="border-t border-ark-border px-5 py-4">
                    <p className="text-sm leading-6 text-ark-text-muted" aria-live="polite">{assistantMessage}</p>
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setAssistantMessage('建议保持当前顺序：阅读理解完成后休息 10 分钟，再进入错题回顾。')}
                        className="ark-focus-ring rounded-lg border border-ark-border px-3 py-2 text-xs font-medium transition-colors hover:bg-ark-surface-subtle"
                      >
                        调整顺序
                      </button>
                      <button
                        type="button"
                        onClick={() => setAssistantMessage('今日复盘将聚焦定位依据、长难句理解和时间分配 3 个维度。')}
                        className="ark-focus-ring flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-ark-accent transition-colors hover:bg-ark-accent-soft"
                      >
                        <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        查看建议
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>
              </aside>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
