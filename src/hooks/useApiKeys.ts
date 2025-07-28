'use client';

import { useState, useCallback } from 'react';
import { useAuth } from './useAuth';

interface ApiKey {
  id: string;
  name: string;
  key: string;
  createdAt: Date;
  lastUsed?: Date;
  scopes: string[];
  expiresAt?: string;
}

export function useApiKeys() {
  const { isAuthenticated } = useAuth();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchApiKeys = useCallback(async () => {
    if (!isAuthenticated) return;
    
    setLoading(true);
    try {
      const response = await fetch('/api/api-keys');
      const data = await response.json();
      setApiKeys(data);
    } catch (error) {
      console.error('Error fetching API keys:', error);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const createApiKey = useCallback(async (data: { name: string; scopes: string[]; expiresAt?: string }) => {
    if (!isAuthenticated) return null;

    setLoading(true);
    try {
      const response = await fetch('/api/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      const newKey = await response.json();
      setApiKeys(prev => [...prev, newKey]);
      return newKey;
    } catch (error) {
      console.error('Error creating API key:', error);
      return null;
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const deleteApiKey = useCallback(async (id: string) => {
    if (!isAuthenticated) return false;

    setLoading(true);
    try {
      await fetch(`/api/api-keys/${id}`, {
        method: 'DELETE',
      });
      setApiKeys(prev => prev.filter(key => key.id !== id));
      return true;
    } catch (error) {
      console.error('Error deleting API key:', error);
      return false;
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  return {
    apiKeys,
    loading,
    fetchApiKeys,
    createApiKey,
    deleteApiKey,
  };
}