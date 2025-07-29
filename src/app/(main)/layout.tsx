"use client"

import React from "react"
import { SharedLayout } from "@/components/layout/SharedLayout"

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <React.Suspense fallback={<div>Loading...</div>}>
      <SharedLayout variant="main">{children}</SharedLayout>
    </React.Suspense>
  );
}