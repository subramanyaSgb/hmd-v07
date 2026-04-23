
import type, { ApiError } from '../types'
export const BASE_URL: string = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '';

const IS_DEV: boolean = import.meta.env.DEV || import.meta.env.MODE === 'development';

const DEFAULT_TIMEOUT = 30000;

const MAX_RETRIES = 2;

const RETRY_DELAY = 1000;

const CSRF_TOKEN_KEY = 'hmd_csrf_token';

const CSRF_HEADER_NAME = 'X-CSRF-Token';

const CSRF_PROTECTED_METHODS = ['POST', 'PUT', 'DELETE', 'PATCH'];

const devLog = {
    warn: (...args: unknown[]): void => {
        if (IS_DEV) console.warn(...args);
    },
    error: (...args: unknown[]): void => {
        if (IS_DEV) console.error(...args);
    },
};

interface StoredUser {
    access_token: string;
    token_type: string;
    username: string;
    role: string;
    user_id: string;
}

const getAuthToken = (): string | null => {
    try {
        const userData = sessionStorage.getItem('hmd_user');
        if (userData) {
            const user: StoredUser = JSON.parse(userData);
            return user.access_token;
        }
    } catch (e) {
        devLog.error('Error reading auth token:', e);
    }
    return null;
};

const getCsrfToken = (): string | null => {
    
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === 'csrf_token') {
            return value;
        }
    }
    
    return sessionStorage.getItem(CSRF_TOKEN_KEY);
};

const setCsrfToken = (token: string): void => {
    sessionStorage.setItem(CSRF_TOKEN_KEY, token);
};

const fetchCsrfToken = async (): Promise<string | null> => {
    try {
        const response = await fetch(`${BASE_URL}/api/csrf-token`, {
            method: 'GET',
            credentials: 'include', 
        });

        if (response.ok) {
            const data = await response.json();
            if (data.csrf_token) {
                setCsrfToken(data.csrf_token);
                return data.csrf_token;
            }
        }
    } catch (e) {
        devLog.error('Failed to fetch CSRF token:', e);
    }
    return null;
};

const ensureCsrfToken = async (): Promise<string | null> => {
    let token = getCsrfToken();
    if (!token) {
        token = await fetchCsrfToken();
    }
    return token;
};

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

const isRetryableError = (error: Error, status?: number): boolean => {
    if (error.name === 'AbortError') return false; 
    if (status && status >= 400 && status < 500) return false; 
    return true; 
};

type QueryParams = Record<string, string | number | boolean | undefined | null>;

export const api = {
    
    async request<T = unknown>(
        endpoint: string,
        options: RequestInit = {},
        timeout: number = DEFAULT_TIMEOUT,
        retries: number = MAX_RETRIES
    ): Promise<T> {
        const url = `${BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

        const token = getAuthToken();
        const method = (options.method || 'GET').toUpperCase();

        let csrfToken: string | null = null;
        if (CSRF_PROTECTED_METHODS.includes(method)) {
            csrfToken = await ensureCsrfToken();
        }

        const defaultOptions: RequestInit = {
            credentials: 'include', 
            headers: {
                'Content-Type': 'application/json',
                ...(token && { 'Authorization': `Bearer ${token}` }),
                ...(csrfToken && { [CSRF_HEADER_NAME]: csrfToken }),
            },
        };

        let lastError: ApiError = new Error('Unknown error');
        let lastStatus: number | undefined;

        for (let attempt = 0; attempt <= retries; attempt++) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            try {
                const response = await fetch(url, {
                    ...defaultOptions,
                    ...options,
                    headers: {
                        ...defaultOptions.headers,
                        ...options.headers,
                    },
                    signal: controller.signal,
                });

                clearTimeout(timeoutId);
                lastStatus = response.status;

                if (response.status === 401) {
                    sessionStorage.removeItem('hmd_user');
                    window.dispatchEvent(new CustomEvent('auth:logout'));
                    throw new Error('Session expired. Please login again.');
                }

                if (response.status === 403) {
                    const data = await response.json().catch(() => ({}));
                    const detail = data?.detail || '';

                    if (detail.toLowerCase().includes('csrf') && attempt === 0) {
                        
                        sessionStorage.removeItem(CSRF_TOKEN_KEY);
                        const newToken = await fetchCsrfToken();

                        if (newToken) {
                            devLog.warn('CSRF token refreshed, retrying request...');
                            
                            options.headers = {
                                ...options.headers,
                                [CSRF_HEADER_NAME]: newToken,
                            };
                            continue;
                        }
                    }
                }

                const data = await response.json().catch(() => null);

                if (!response.ok) {
                    
                    const errorDetail = data?.detail;
                    let errorMessage = 'An unexpected system error occurred.';

                    if (typeof errorDetail === 'string') {
                        errorMessage = errorDetail;
                    } else if (Array.isArray(errorDetail)) {
                        
                        errorMessage = errorDetail
                            .map((err: { loc?: string[]; msg: string }) =>
                                `${err.loc?.join('.') || 'field'}: ${err.msg}`
                            )
                            .join(', ');
                    }

                    const error: ApiError = new Error(errorMessage);
                    error.status = response.status;
                    throw error;
                }

                return data as T;
            } catch (error) {
                clearTimeout(timeoutId);

                if (error instanceof Error) {
                    lastError = error as ApiError;

                    if (error.name === 'AbortError') {
                        lastError = new Error('Request timed out. Please check your connection and try again.') as ApiError;
                        lastError.status = 408;
                    }

                    if (attempt < retries && isRetryableError(error, lastStatus)) {
                        devLog.warn(`API request failed, retrying (${attempt + 1}/${retries})...`, endpoint);
                        await sleep(RETRY_DELAY * (attempt + 1)); 
                        continue;
                    }

                    devLog.error(`API Error [${endpoint}]:`, {
                        message: error.message,
                        status: (error as ApiError).status || lastStatus,
                        attempt: attempt + 1,
                    });
                }

                throw lastError;
            }
        }

        throw lastError;
    },

    async get<T = unknown>(
        endpoint: string,
        params: QueryParams = {},
        options: RequestInit = {}
    ): Promise<T> {
        let url = endpoint;
        const queryParams = new URLSearchParams();

        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                queryParams.append(key, String(value));
            }
        });

        const queryString = queryParams.toString();
        if (queryString) {
            url += (url.includes('?') ? '&' : '?') + queryString;
        }

        return this.request<T>(url, { method: 'GET', ...options });
    },

    post<T = unknown, B = unknown>(
        endpoint: string,
        body: B,
        options: RequestInit = {}
    ): Promise<T> {
        return this.request<T>(endpoint, {
            method: 'POST',
            body: JSON.stringify(body),
            ...options,
        });
    },

    put<T = unknown, B = unknown>(
        endpoint: string,
        body: B,
        options: RequestInit = {}
    ): Promise<T> {
        return this.request<T>(endpoint, {
            method: 'PUT',
            body: JSON.stringify(body),
            ...options,
        });
    },

    delete<T = unknown>(endpoint: string, options: RequestInit = {}): Promise<T> {
        return this.request<T>(endpoint, { method: 'DELETE', ...options });
    },

    isAuthenticated(): boolean {
        return !!getAuthToken();
    },

    clearAuth(): void {
        sessionStorage.removeItem('hmd_user');
        sessionStorage.removeItem(CSRF_TOKEN_KEY);
    },

    async init(): Promise<void> {
        try {
            await fetchCsrfToken();
            devLog.warn('API client initialized with CSRF token');
        } catch (e) {
            devLog.error('Failed to initialize API client:', e);
        }
    },

    async refreshCsrfToken(): Promise<string | null> {
        sessionStorage.removeItem(CSRF_TOKEN_KEY);
        return fetchCsrfToken();
    },
};
