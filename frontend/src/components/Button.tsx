import React from 'react';
import { cn } from '../lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'cta';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  loading?: boolean;
  loadingText?: string;
  fullWidth?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'secondary',
      size = 'md',
      leftIcon,
      rightIcon,
      loading = false,
      loadingText,
      fullWidth = false,
      disabled,
      children,
      type = 'button',
      ...props
    },
    ref
  ) => {
    // 基础样式：微交互动效、弹性盒布局、对齐规则、点击微缩放
    const baseStyles =
      'inline-flex items-center justify-center font-medium transition-all duration-200 focus:outline-none disabled:opacity-60 disabled:pointer-events-none select-none active:scale-95 cursor-pointer';

    // 变体样式定义
    const variants: Record<ButtonVariant, string> = {
      // 核心高亮主按钮（蓝色）
      primary: 'bg-blue-600 hover:bg-blue-500 text-white shadow-sm shadow-blue-600/10 border border-transparent',
      // 精致微立体玻璃边框按钮（灰色/系统默认）
      secondary:
        'border border-ark-border bg-ark-surface-subtle hover:bg-ark-surface hover:border-ark-border text-ark-text-muted hover:text-ark-text shadow-sm hover:shadow',
      // 危险/删除动作按钮（红色微调边框 + 红色浅背景 hover）
      danger:
        'border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 text-red-200 shadow-sm',
      // 极简纯文本按钮（无边框，hover淡灰色背景）
      ghost: 'text-ark-text-muted hover:bg-ark-surface-subtle hover:text-ark-text border border-transparent',
      // 独立于主题的纯白 CTA 按钮
      cta: 'bg-white hover:bg-slate-50 text-slate-950 border border-slate-200 shadow-md font-semibold',
    };

    // 尺寸定义
    const sizes: Record<ButtonSize, string> = {
      xs: 'px-2 py-0.5 text-[10px] rounded-md gap-0.5',
      sm: 'px-2.5 py-1 text-xs rounded-md gap-1',
      md: 'px-3.5 py-1.5 text-sm rounded-lg gap-1.5',
      lg: 'px-5 py-2.5 text-base rounded-xl gap-2',
    };

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        className={cn(
          baseStyles,
          variants[variant],
          sizes[size],
          fullWidth && 'w-full',
          className
        )}
        {...props}
      >
        {/* Loading Spinner */}
        {loading && (
          <svg
            className="animate-spin -ml-1 mr-1 h-3.5 w-3.5 shrink-0 text-current"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}

        {/* Left Icon (only when not loading) */}
        {!loading && leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>}

        {/* Button Content */}
        <span>{loading && loadingText ? loadingText : children}</span>

        {/* Right Icon (only when not loading) */}
        {!loading && rightIcon && <span className="inline-flex shrink-0">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
