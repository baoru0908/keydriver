// className 合并工具：clsx 收集条件类名 + tailwind-merge 消除冲突（基础控件库统一使用）。
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
