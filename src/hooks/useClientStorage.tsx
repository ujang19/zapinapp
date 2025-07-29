'use client';

import { useState, useEffect } from 'react';

/**
 * Custom hook to safely access localStorage/sessionStorage on client side
 * Prevents hydration mismatches by only accessing storage after component mounts
 */
export function useLocalStorage(key: string, defaultValue: string | null = null) {
  const [value, setValue] = useState<string | null>(defaultValue);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    if (typeof window !== 'undefined') {
      const storedValue = localStorage.getItem(key);
      setValue(storedValue);
    }
  }, [key]);

  const setStorageValue = (newValue: string | null) => {
    if (typeof window !== 'undefined') {
      if (newValue === null) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, newValue);
      }
      setValue(newValue);
    }
  };

  return [value, setStorageValue, isClient] as const;
}

/**
 * Hook to safely get auth token from localStorage
 */
export function useAuthToken() {
  const [token, setToken, isClient] = useLocalStorage('token');
  return { token, setToken, isClient };
}