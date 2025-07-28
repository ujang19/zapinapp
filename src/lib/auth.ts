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
  private static readonly USER_KEY = 'zapin_user';

  /**
   * Store authentication data
   */
  static setAuth(user: AuthUser): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
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
    localStorage.removeItem(this.USER_KEY);
  }

  /**
   * Check if user is authenticated
   */
  static isAuthenticated(): boolean {
    return !!this.getUser();
  }

  /**
   * Login user
   */
  static async login(email: string, password: string): Promise<AuthUser> {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Login failed');
    }

    // Ensure user data has the expected structure
    const user: AuthUser = {
      id: data.user.id,
      email: data.user.email,
      name: data.user.name,
      role: data.user.role,
      avatar: data.user.avatar || null,
      tenant: {
        id: data.user.tenant.id,
        name: data.user.tenant.name,
        slug: data.user.tenant.slug,
        plan: data.user.tenant.plan || 'FREE',
        status: data.user.tenant.status || 'ACTIVE'
      }
    };

    // Store user data
    this.setAuth(user);

    return user;
  }

  /**
   * Logout user
   */
  static async logout(): Promise<void> {
    try {
      // Call logout API first
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include' // Important: include credentials to handle cookies
      });

      if (!response.ok) {
        throw new Error('Logout failed');
      }

      // Only clear local storage after successful server logout
      this.clearAuth();
    } catch (error) {
      console.error('Logout error:', error);
      // Still clear local storage on error to prevent stuck states
      this.clearAuth();
      throw error;
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