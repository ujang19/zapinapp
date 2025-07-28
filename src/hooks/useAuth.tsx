'use client';

import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { AuthClient, AuthUser } from '../lib/auth';

export interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (userData: {
    email: string;
    password: string;
    name: string;
    tenantName: string;
    tenantSlug?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function useAuthState() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize auth state
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (AuthClient.isAuthenticated()) {
          const userData = AuthClient.getUser();
          if (userData) {
            setUser(userData);
          } else {
            // Token exists but no user data, try to fetch from server
            await refreshUser();
          }
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        AuthClient.clearAuth();
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      const userData = await AuthClient.login(email, password);
      setUser(userData);
    } catch (error) {
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (userData: {
    email: string;
    password: string;
    name: string;
    tenantName: string;
    tenantSlug?: string;
  }) => {
    setLoading(true);
    try {
      const user = await AuthClient.register(userData);
      setUser(user);
    } catch (error) {
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setLoading(true);
    try {
      await AuthClient.logout();
      setUser(null);
    } catch (error) {
      console.error('Logout error:', error);
      // Clear local state even if server logout fails
      AuthClient.clearAuth();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const response = await AuthClient.apiRequest('/auth/me');
      if (response.success) {
        setUser(response.data.user);
      } else {
        throw new Error('Failed to fetch user data');
      }
    } catch (error) {
      console.error('Refresh user error:', error);
      AuthClient.clearAuth();
      setUser(null);
    }
  }, []);

  return {
    user,
    loading,
    login,
    register,
    logout,
    refreshUser,
    isAuthenticated: !!user && AuthClient.isAuthenticated()
  };
}

// Provider component
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuthState();

  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  );
}

// Hook for API requests with automatic token refresh
export function useApiRequest() {
  const { logout } = useAuth();

  const apiRequest = useCallback(async <T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> => {
    try {
      return await AuthClient.apiRequest<T>(endpoint, options);
    } catch (error) {
      // If authentication fails, logout user
      if (error instanceof Error && error.message.includes('Authentication failed')) {
        await logout();
      }
      throw error;
    }
  }, [logout]);

  return { apiRequest };
}

// Hook for managing API keys
export function useApiKeys() {
  const { apiRequest } = useApiRequest();
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchApiKeys = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiRequest('/auth/api-keys');
      if (response.success) {
        setApiKeys(response.data.apiKeys);
      }
    } catch (error) {
      console.error('Failed to fetch API keys:', error);
    } finally {
      setLoading(false);
    }
  }, [apiRequest]);

  const createApiKey = useCallback(async (data: {
    name: string;
    scopes: string[];
    expiresAt?: string;
  }) => {
    try {
      const response = await apiRequest('/auth/api-keys', {
        method: 'POST',
        body: JSON.stringify(data)
      });

      if (response.success) {
        await fetchApiKeys(); // Refresh the list
        return response.data;
      } else {
        throw new Error(response.error?.message || 'Failed to create API key');
      }
    } catch (error) {
      throw error;
    }
  }, [apiRequest, fetchApiKeys]);

  const revokeApiKey = useCallback(async (keyId: string) => {
    try {
      const response = await apiRequest(`/auth/api-keys/${keyId}`, {
        method: 'DELETE'
      });

      if (response.success) {
        await fetchApiKeys(); // Refresh the list
      } else {
        throw new Error(response.error?.message || 'Failed to revoke API key');
      }
    } catch (error) {
      throw error;
    }
  }, [apiRequest, fetchApiKeys]);

  useEffect(() => {
    fetchApiKeys();
  }, [fetchApiKeys]);

  return {
    apiKeys,
    loading,
    createApiKey,
    revokeApiKey,
    refreshApiKeys: fetchApiKeys
  };
}

// Hook for password management
export function usePasswordManagement() {
  const { apiRequest } = useApiRequest();
  const [loading, setLoading] = useState(false);

  const changePassword = useCallback(async (
    currentPassword: string,
    newPassword: string
  ) => {
    setLoading(true);
    try {
      const response = await apiRequest('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword,
          newPassword
        })
      });

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to change password');
      }

      return response.data;
    } catch (error) {
      throw error;
    } finally {
      setLoading(false);
    }
  }, [apiRequest]);

  return {
    changePassword,
    loading
  };
}

// Hook for form validation
export function useFormValidation() {
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const validateField = useCallback((field: string, value: string, rules: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    email?: boolean;
    password?: boolean;
    match?: string;
  }, formData?: Record<string, string>) => {
    const fieldErrors: string[] = [];

    if (rules.required && !value.trim()) {
      fieldErrors.push(`${field} is required`);
    }

    if (value && rules.minLength && value.length < rules.minLength) {
      fieldErrors.push(`${field} must be at least ${rules.minLength} characters`);
    }

    if (value && rules.maxLength && value.length > rules.maxLength) {
      fieldErrors.push(`${field} must be no more than ${rules.maxLength} characters`);
    }

    if (value && rules.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        fieldErrors.push('Please enter a valid email address');
      }
    }

    if (value && rules.password) {
      if (value.length < 8) {
        fieldErrors.push('Password must be at least 8 characters');
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
    }

    if (value && rules.match && formData && value !== formData[rules.match]) {
      fieldErrors.push('Passwords do not match');
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

  const hasErrors = useCallback((field?: string) => {
    if (field) {
      return errors[field] && errors[field].length > 0;
    }
    return Object.keys(errors).some(key => errors[key].length > 0);
  }, [errors]);

  return {
    errors,
    validateField,
    clearErrors,
    hasErrors
  };
}