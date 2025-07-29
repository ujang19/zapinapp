"use client"
import { DropdownUserProfile } from "./DropdownUserProfile"

interface UserProfileProps {
  isCollapsed: boolean
}

export function UserProfileDesktop({ isCollapsed }: UserProfileProps) {
  return <DropdownUserProfile isCollapsed={isCollapsed} />
}

export function UserProfileMobile() {
  return <DropdownUserProfile isCollapsed={false} />
}