"use client"

import { ColumnDef, createColumnHelper } from "@tanstack/react-table"
import { format } from "date-fns"
import { Badge } from "@/components/tremor"

interface ContactInfo {
  id: string
  name: string
  channel: string
  customerLifecycle: string
  phone: string
  email: string
  tags: string[]
  conversationStatus: string
  dateAdded: string
}

const columnHelper = createColumnHelper<ContactInfo>()

const getLifecycleVariant = (lifecycle: string): "default" | "neutral" | "success" | "error" | "warning" => {
  switch (lifecycle.toLowerCase()) {
    case "new lead":
      return "warning"
    case "hot lead":
      return "error"
    case "payment":
      return "success"
    case "customer":
      return "success"
    case "cold lead":
      return "neutral"
    default:
      return "neutral"
  }
}

const getStatusVariant = (status: string): "default" | "neutral" | "success" | "error" | "warning" => {
  switch (status.toLowerCase()) {
    case "active":
      return "success"
    case "inactive":
      return "error"
    case "pending":
      return "warning"
    case "closed":
      return "neutral"
    default:
      return "neutral"
  }
}

export const getColumns = () =>
  [
    columnHelper.accessor("name", {
      header: "Nama",
      cell: ({ getValue }) => (
        <div className="font-medium text-gray-900 dark:text-gray-50">
          {getValue()}
        </div>
      ),
      enableSorting: true,
      meta: {
        className: "text-left",
        displayName: "Nama",
      },
    }),
    columnHelper.accessor("channel", {
      header: "Saluran",
      enableSorting: false,
      meta: {
        className: "text-left",
        displayName: "Saluran",
      },
    }),
    columnHelper.accessor("customerLifecycle", {
      header: "Customer Lifecycle",
      enableSorting: true,
      meta: {
        className: "text-left",
        displayName: "Customer Lifecycle",
      },
      cell: ({ getValue }) => {
        const lifecycle = getValue()
        return (
          <Badge variant={getLifecycleVariant(lifecycle)}>
            {lifecycle}
          </Badge>
        )
      },
    }),
    columnHelper.accessor("phone", {
      header: "Telepon",
      enableSorting: false,
      meta: {
        className: "text-left",
        displayName: "Telepon",
      },
    }),
    columnHelper.accessor("email", {
      header: "Email",
      enableSorting: false,
      meta: {
        className: "text-left",
        displayName: "Email",
      },
    }),
    columnHelper.accessor("tags", {
      header: "Tag",
      enableSorting: false,
      meta: {
        className: "text-left",
        displayName: "Tag",
      },
      cell: ({ getValue }) => {
        const tags = getValue()
        return (
          <div className="flex gap-1 flex-wrap">
            {tags.map((tag, index) => (
              <Badge key={index} variant="default">
                {tag}
              </Badge>
            ))}
          </div>
        )
      },
    }),
    columnHelper.accessor("conversationStatus", {
      header: "Status Percakapan",
      enableSorting: true,
      meta: {
        className: "text-left",
        displayName: "Status Percakapan",
      },
      cell: ({ getValue }) => {
        const status = getValue()
        return (
          <Badge variant={getStatusVariant(status)}>
            {status}
          </Badge>
        )
      },
    }),
    columnHelper.accessor("dateAdded", {
      header: "Tanggal Ditambahkan",
      cell: ({ getValue }) => {
        const date = getValue()
        return format(new Date(date), "dd MMM yyyy")
      },
      enableSorting: true,
      meta: {
        className: "text-left",
        displayName: "Tanggal Ditambahkan",
      },
    }),
  ] as ColumnDef<ContactInfo>[]