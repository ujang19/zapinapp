"use client"

import React from "react"
import { useAuth } from "@/hooks/useAuth"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { cx } from "@/lib/utils"
import { Sidebar } from "@/components/ui/navigation/Sidebar"

interface SharedLayoutProps {
  children: React.ReactNode;
  variant?: 'dashboard' | 'main';
}

export function SharedLayout({ children, variant = 'dashboard' }: SharedLayoutProps) {
  const { user, loading, isAuthenticated } = useAuth();
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = React.useState(true);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      // Only access window on client side
      if (typeof window !== 'undefined') {
        const currentPath = window.location.pathname;
        // Use window.location for hard navigation
        window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`;
      }
      return;
    }
  }, [loading, isAuthenticated]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect to login
  }

  const toggleSidebar = () => {
    setIsCollapsed(!isCollapsed);
  };

  // Content wrapper styling based on variant
  const contentWrapperClass = variant === 'dashboard' 
    ? "min-h-[calc(100vh-1.5rem)] bg-white p-4 sm:p-6 lg:rounded-lg lg:border lg:border-gray-200 dark:bg-gray-925 lg:dark:border-gray-900"
    : "h-full rounded-lg bg-white p-6 shadow-sm dark:bg-gray-900 lg:bg-white lg:p-8 lg:shadow-sm";

  return (
    <div className="min-h-screen mx-auto max-w-screen-2xl">
      <Sidebar isCollapsed={isCollapsed} toggleSidebar={toggleSidebar} />
      <main
        className={cx(
          isCollapsed ? "lg:pl-[60px]" : "lg:pl-64",
          "min-h-screen ease transform-gpu transition-all duration-100 will-change-transform lg:bg-gray-50 lg:py-3 lg:pr-3 lg:dark:bg-gray-950",
        )}
      >
        <div className={contentWrapperClass}>
          {children}
        </div>
      </main>
    </div>
  );
}