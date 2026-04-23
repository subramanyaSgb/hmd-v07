
export * from './api';

import type, { AuthUser } from './api'
export interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<boolean>;
  isAuthenticated: () => boolean;
  hasRole: (role: string | string[]) => boolean;
  isAdmin: () => boolean;
}

export interface NotificationOptions {
  duration?: number;
  onRetry?: () => void;
}

export interface NotificationContextValue {
  showNotification: (type: 'success' | 'error' | 'warning' | 'info', message: string, options?: number | NotificationOptions) => number;
  showError: (message: string, options?: NotificationOptions) => number;
  showSuccess: (message: string, duration?: number) => number;
  showWarning: (message: string, options?: NotificationOptions) => number;
  showInfo: (message: string, duration?: number) => number;
  removeNotification: (id: number) => void;
}

export interface HeaderContextValue {
  headerContent: React.ReactNode | null;
  setHeaderContent: (content: React.ReactNode | null) => void;
}

export interface PageProps {
  
}

export interface TableSortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

export interface UseTableSortResult<T> {
  items: T[];
  requestSort: (key: string) => void;
  sortConfig: TableSortConfig;
}
