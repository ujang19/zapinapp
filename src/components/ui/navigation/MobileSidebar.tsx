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
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Logo } from "@/components/ui/Logo"
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/Drawer"

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
  const pathname = usePathname()

  const isActive = (itemHref: string) => {
    if (itemHref === "/dashboard/settings") {
      return pathname.startsWith("/dashboard/settings")
    }
    return pathname === itemHref || pathname.startsWith(itemHref)
  }

  return (
    <>
      <Drawer>
        <DrawerTrigger asChild>
          <button
            className={cx(
              "inline-flex items-center rounded-md p-2 text-sm font-medium transition hover:bg-gray-200/50 hover:dark:bg-gray-900",
              "text-gray-700 dark:text-gray-300",
              focusRing,
            )}
            aria-label="open sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>
        </DrawerTrigger>
        <DrawerContent className="sm:max-w-lg">
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2">
              <Logo width={32} height={32} />
              <span className="text-lg font-semibold text-gray-900 dark:text-gray-50">
                Zapin
              </span>
            </DrawerTitle>
          </DrawerHeader>
          <DrawerBody>
            <nav
              aria-label="core mobile navigation links"
              className="flex flex-1 flex-col space-y-10"
            >
              <div>
                <span
                  className={cx(
                    "block h-6 text-xs font-medium leading-6 text-gray-500 transition-opacity dark:text-gray-400",
                  )}
                >
                  Platform
                </span>
                <ul role="list" className="mt-1 space-y-1.5">
                  {navigation.map((item) => (
                    <li key={item.name}>
                      <DrawerClose asChild>
                        <Link
                          href={item.href}
                          className={cx(
                            isActive(item.href)
                              ? "text-blue-600 dark:text-blue-500"
                              : "text-gray-600 hover:text-gray-900 dark:text-gray-400 hover:dark:text-gray-50",
                            "flex items-center gap-x-2.5 rounded-md px-2 py-1.5 text-base font-medium transition hover:bg-gray-100 sm:text-sm hover:dark:bg-gray-900",
                            focusRing,
                          )}
                        >
                          <item.icon
                            className="size-5 shrink-0"
                            aria-hidden="true"
                          />
                          {item.name}
                        </Link>
                      </DrawerClose>
                    </li>
                  ))}
                </ul>
              </div>
            </nav>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </>
  )
}