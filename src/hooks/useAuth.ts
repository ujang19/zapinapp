'use client';

import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { AuthClient, AuthUser } from '../lib/auth';
import type { ReactNode } from 'react';

// Auth Context
interface UseAuthReturn {
  user: AuthUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  register: (data: { email: string; password: string; name: string; tenantName: string; tenantSlug?: string; }) => Promise<void>;
}

const AuthContext = createContext<UseAuthReturn | undefined>(undefined);

function useAuthContext(): UseAuthReturn {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

function useAuthState() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const register = useCallback(async (data: { email: string; password: string; name: string; tenantName: string; tenantSlug?: string; }): Promise<void> => {
    setLoading(true);
    try {
      const userData = await AuthClient.register(data);
      setUser(userData);
      setIsAuthenticated(true);
    } catch (error) {
      setUser(null);
      setIsAuthenticated(false);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string): Promise<void> => {
    setLoading(true);
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...AuthClient.getAuthHeader()
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to change password');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Initialize auth state
  useEffect(() => {
    const initAuth = async () => {
      try {
        const storedUser = AuthClient.getUser();
        const authenticated = AuthClient.isAuthenticated();
        
        if (storedUser && authenticated) {
          setUser(storedUser);
          setIsAuthenticated(true);
        } else {
          setUser(null);
          setIsAuthenticated(false);
          AuthClient.clearAuth();
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        setUser(null);
        setIsAuthenticated(false);
        AuthClient.clearAuth();
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    setLoading(true);
    try {
      const userData = await AuthClient.login(email, password);
      setUser(userData);
      setIsAuthenticated(true);
    } catch (error) {
      setUser(null);
      setIsAuthenticated(false);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      await AuthClient.logout();
      setUser(null);
      setIsAuthenticated(false);
    } catch (error) {
      console.error('Logout error:', error);
      // Clear local state even if server logout fails
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshUser = useCallback(async (): Promise<void> => {
    try {
      const storedUser = AuthClient.getUser();
      const authenticated = AuthClient.isAuthenticated();
      
      if (storedUser && authenticated) {
        setUser(storedUser);
        setIsAuthenticated(true);
      } else {
        setUser(null);
        setIsAuthenticated(false);
        AuthClient.clearAuth();
      }
    } catch (error) {
      console.error('Refresh user error:', error);
      setUser(null);
      setIsAuthenticated(false);
      AuthClient.clearAuth();
    }
  }, []);

  return {
    user,
    loading,
    isAuthenticated,
    login,
    logout,
    refreshUser,
    changePassword,
    register
  };
}

// Provider component
function AuthProviderComponent({ children }: { children: ReactNode }) {
  const auth = useAuthState();

  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  );
}

// Form validation hook
interface ValidationRule {
  required?: boolean;
  email?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  password?: boolean;
  match?: string;
}

interface UseFormValidationReturn {
  errors: Record<string, string[]>;
  validateField: (field: string, value: string, rules: ValidationRule, formData?: Record<string, string>) => boolean;
  clearErrors: (field?: string) => void;
  hasErrors: (field?: string) => boolean;
}

function useFormValidation(): UseFormValidationReturn {
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const validateField = useCallback((field: string, value: string, rules: ValidationRule, formData?: Record<string, string>): boolean => {
    const fieldErrors: string[] = [];

    if (rules.required && (!value || value.trim() === '')) {
      fieldErrors.push(`${field} is required`);
    }

    if (value && rules.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        fieldErrors.push('Please enter a valid email address');
      }
    }

    if (value && rules.password) {
      if (value.length < 8) {
        fieldErrors.push('Password must be at least 8 characters long');
      }
      if (!/[A-Z]/.test(value)) {
        fieldErrors.push('Password must contain at least one uppercase letter');
      }
      if (!/[a-z]/.test(value)) {
        fieldErrors.push('Password must contain at least one lowercase letter');
      }
      if (!/\d/.test(value)) {
        fieldErrors.push('Password must contain at least one number');
      }
      if (!/[!@#$%^&*(),.?":{}|<>]/.test(value)) {
        fieldErrors.push('Password must contain at least one special character');
      }
    }

    if (value && rules.match && formData) {
      if (value !== formData[rules.match]) {
        fieldErrors.push(`${field} must match ${rules.match}`);
      }
    }

    if (value && rules.minLength && value.length < rules.minLength) {
      fieldErrors.push(`${field} must be at least ${rules.minLength} characters long`);
    }

    if (value && rules.maxLength && value.length > rules.maxLength) {
      fieldErrors.push(`${field} must be no more than ${rules.maxLength} characters long`);
    }

    if (value && rules.pattern && !rules.pattern.test(value)) {
      fieldErrors.push(`${field} format is invalid`);
    }

    setErrors(prev => ({
      ...prev,
      [field]: fieldErrors
    }));

    return fieldErrors.length === 0;
  }, []);

  const clearErrors = useCallback((field?: string) => {
    if (field) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    } else {
      setErrors({});
    }
  }, []);

  const hasErrors = useCallback((field?: string): boolean => {
    if (field) {
      return Boolean(errors[field]?.length);
    }
    return Object.values(errors).some(fieldErrors => fieldErrors.length > 0);
  }, [errors]);

  return {
    errors,
    validateField,
    clearErrors,
    hasErrors
  };
}

export { AuthProviderComponent as AuthProvider, useAuthContext as useAuth, useFormValidation };