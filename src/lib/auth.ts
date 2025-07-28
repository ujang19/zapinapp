import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import { JWTPayload, UserWithTenant } from '../types';

const JWT_SECRET = process.env.JWT_SECRET!;
const API_URL = process.env.API_URL || 'http://localhost:3001';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  avatar: string | null;
  tenant: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    status: string;
  };
}

export interface AuthTokens {
  token: string;
  refreshToken: string;
  expiresAt: Date;
}

/**
 * Client-side authentication utilities
 */
export class AuthClient {
  private static readonly TOKEN_KEY = 'zapin_token';
  private static readonly REFRESH_TOKEN_KEY = 'zapin_refresh_token';
  private static readonly USER_KEY = 'zapin_user';

  /**
   * Store authentication data in localStorage
   */
  static setAuth(user: AuthUser, tokens: AuthTokens): void {
    if (typeof window === 'undefined') return;

    localStorage.setItem(this.TOKEN_KEY, tokens.token);
    localStorage.setItem(this.REFRESH_TOKEN_KEY, tokens.refreshToken);
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
  }

  /**
   * Get stored authentication token
   */
  static getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(this.TOKEN_KEY);
  }

  /**
   * Get stored refresh token
   */
  static getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(this.REFRESH_TOKEN_KEY);
  }

  /**
   * Get stored user data
   */
  static getUser(): AuthUser | null {
    if (typeof window === 'undefined') return null;
    
    const userData = localStorage.getItem(this.USER_KEY);
    if (!userData) return null;

    try {
      return JSON.parse(userData);
    } catch {
      return null;
    }
  }

  /**
   * Clear all authentication data
   */
  static clearAuth(): void {
    if (typeof window === 'undefined') return;

    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
  }

  /**
   * Check if user is authenticated
   */
  static isAuthenticated(): boolean {
    const token = this.getToken();
    if (!token) return false;

    try {
      const decoded = jwt.decode(token) as JWTPayload;
      if (!decoded || !decoded.exp) return false;

      // Check if token is expired (with 5 minute buffer)
      const now = Math.floor(Date.now() / 1000);
      return decoded.exp > (now + 300);
    } catch {
      return false;
    }
  }

  /**
   * Get authorization header for API requests
   */
  static getAuthHeader(): Record<string, string> {
    const token = this.getToken();
    if (!token) return {};

    return {
      Authorization: `Bearer ${token}`
    };
  }

  /**
   * Make authenticated API request
   */
  static async apiRequest<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${API_URL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...this.getAuthHeader(),
      ...options.headers
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (response.status === 401) {
      // Try to refresh token
      const refreshed = await this.refreshToken();
      if (refreshed) {
        // Retry the request with new token
        const newHeaders = {
          ...headers,
          ...this.getAuthHeader()
        };
        
        const retryResponse = await fetch(url, {
          ...options,
          headers: newHeaders
        });

        if (!retryResponse.ok) {
          throw new Error(`API request failed: ${retryResponse.statusText}`);
        }

        return retryResponse.json();
      } else {
        // Refresh failed, redirect to login
        this.clearAuth();
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        throw new Error('Authentication failed');
      }
    }

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Refresh authentication token
   */
  static async refreshToken(): Promise<boolean> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return false;

    try {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ refreshToken })
      });

      if (!response.ok) return false;

      const data = await response.json();
      if (!data.success) return false;

      // Update stored auth data
      this.setAuth(data.data.user, {
        token: data.data.token,
        refreshToken: data.data.refreshToken,
        expiresAt: new Date(data.data.expiresAt)
      });

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Login user
   */
  static async login(email: string, password: string): Promise<AuthUser> {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error?.message || 'Login failed');
    }

    // Store auth data
    this.setAuth(data.data.user, {
      token: data.data.token,
      refreshToken: data.data.refreshToken,
      expiresAt: new Date(data.data.expiresAt)
    });

    return data.data.user;
  }

  /**
   * Register new user
   */
  static async register(userData: {
    email: string;
    password: string;
    name: string;
    tenantName: string;
    tenantSlug?: string;
  }): Promise<AuthUser> {
    const response = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(userData)
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error?.message || 'Registration failed');
    }

    // Store auth data
    this.setAuth(data.data.user, {
      token: data.data.token,
      refreshToken: data.data.refreshToken,
      expiresAt: new Date(data.data.expiresAt)
    });

    return data.data.user;
  }

  /**
   * Logout user
   */
  static async logout(): Promise<void> {
    const token = this.getToken();
    const refreshToken = this.getRefreshToken();

    // Clear local storage first
    this.clearAuth();

    // Try to logout on server (don't throw if it fails)
    try {
      if (token) {
        await fetch(`${API_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ refreshToken })
        });
      }
    } catch {
      // Ignore server logout errors
    }
  }
}

/**
 * Server-side authentication utilities for Next.js
 */
export class AuthServer {
  /**
   * Get user from server-side cookies (for server components only)
   */
  static async getUser(): Promise<AuthUser | null> {
    try {
      // This should only be called from server components
      if (typeof window !== 'undefined') {
        throw new Error('AuthServer.getUser() can only be called from server components');
      }

      // Dynamic import to avoid client-side bundling
      const { cookies } = await import('next/headers');
      const cookieStore = await cookies();
      const token = cookieStore.get('zapin_token')?.value;

      if (!token) return null;

      // Verify token
      const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
      
      // Fetch user data from API
      const response = await fetch(`${API_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) return null;

      const data = await response.json();
      return data.success ? data.data.user : null;
    } catch {
      return null;
    }
  }

  /**
   * Require authentication (redirect to login if not authenticated)
   */
  static async requireAuth(): Promise<AuthUser> {
    const user = await this.getUser();
    
    if (!user) {
      // Dynamic import to avoid client-side bundling
      const { redirect } = await import('next/navigation');
      redirect('/login');
      // This line should never be reached due to redirect, but TypeScript needs it
      throw new Error('Authentication required');
    }

    return user;
  }

  /**
   * Require specific role
   */
  static async requireRole(role: string): Promise<AuthUser> {
    const user = await this.requireAuth();
    
    if (user.role !== role) {
      // Dynamic import to avoid client-side bundling
      const { redirect } = await import('next/navigation');
      redirect('/unauthorized');
    }

    return user;
  }

  /**
   * Check if user has permission
   */
  static hasPermission(user: AuthUser, permission: string): boolean {
    // Simple role-based permissions
    switch (user.role) {
      case 'ADMIN':
        return true; // Admin has all permissions
      case 'USER':
        return ['read', 'write'].includes(permission);
      default:
        return false;
    }
  }
}

/**
 * Middleware helper for API routes
 */
export function withAuth(handler: Function) {
  return async (request: NextRequest) => {
    try {
      const token = request.headers.get('authorization')?.replace('Bearer ', '');
      
      if (!token) {
        return new Response(
          JSON.stringify({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'No token provided' }
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
      
      // Add user to request context
      (request as any).user = decoded;

      return handler(request);
    } catch (error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Invalid token' }
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
  };
}

/**
 * Password validation utility
 */
export function validatePassword(password: string): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Email validation utility
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}