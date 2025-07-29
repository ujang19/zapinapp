"use client"
import { cx, focusRing } from "@/lib/utils"
import {
  BarChartBig,
  Bot,
  Menu,
  MessageSquare,
  Settings2,
  Table2,
  Users,
  X,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: BarChartBig },
  {
    name: "Bots",
    href: "/dashboard/bots",
    icon: Bot,
  },
  {
    name: "Messages",
    href: "/dashboard/messages",
    icon: MessageSquare,
  },
  {
    name: "Contact",
    href: "/dashboard/contact",
    icon: Users,
  },
  {
    name: "Analytics",
    href: "/dashboard/analytics",
    icon: Table2,
  },
  {
    name: "Settings",
    href: "/dashboard/settings",
    icon: Settings2,
  },
] as const

export default function MobileSidebar() {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()

  const isActive = (itemHref: string) => {
    if (itemHref === "/dashboard/settings") {
      return pathname.startsWith("/dashboard/settings")
    }
    return pathname === itemHref || pathname.startsWith(itemHref)
  }

  return (
    <>
      <button
        className={cx(
          "inline-flex items-center rounded-md p-2 text-sm font-medium transition hover:bg-gray-200/50 hover:dark:bg-gray-900",
          "text-gray-700 dark:text-gray-300",
          focusRing,
        )}
        onClick={() => setIsOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile menu overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-gray-600 bg-opacity-75"
            onClick={() => setIsOpen(false)}
          />

          {/* Sidebar */}
          <div className="fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg dark:bg-gray-950">
            <div className="flex h-full flex-col">
              {/* Header */}
              <div className="flex h-16 items-center justify-between px-4 border-b border-gray-200 dark:border-gray-800">
                <span className="text-lg font-semibold text-gray-900 dark:text-gray-50">
                  Zapin
                </span>
                <button
                  className={cx(
                    "inline-flex items-center rounded-md p-2 text-sm font-medium transition hover:bg-gray-200/50 hover:dark:bg-gray-900",
                    "text-gray-700 dark:text-gray-300",
                    focusRing,
                  )}
                  onClick={() => setIsOpen(false)}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Navigation */}
              <nav className="flex-1 px-4 py-6">
                <div>
                  <span className="block text-xs font-medium leading-6 text-gray-500 dark:text-gray-400">
                    Platform
                  </span>
                  <ul role="list" className="mt-2 space-y-1">
                    {navigation.map((item) => (
                      <li key={item.name}>
                        <Link
                          href={item.href}
                          className={cx(
                            isActive(item.href)
                              ? "text-blue-600 dark:text-blue-500 bg-blue-50 dark:bg-blue-950/50"
                              : "text-gray-700 dark:text-gray-300",
                            "flex items-center gap-x-2.5 rounded-md p-2 text-sm font-medium transition hover:bg-gray-200/50 hover:dark:bg-gray-900",
                            focusRing,
                          )}
                          onClick={() => setIsOpen(false)}
                        >
                          <item.icon
                            className="h-5 w-5 shrink-0"
                            aria-hidden="true"
                          />
                          {item.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </nav>
            </div>
          </div>
        </div>
      )}
    </>
  )
}