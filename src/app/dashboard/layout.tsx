"use client"

import React from "react"
import { SharedLayout } from "@/components/layout/SharedLayout"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SharedLayout variant="dashboard">
      {children}
    </SharedLayout>
  );
}