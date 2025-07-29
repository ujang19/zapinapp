"use client";

import { useState, useMemo } from "react";
import { Title, Text, Button, Flex, Badge, TextInput, Select, SelectItem, Card } from "@tremor/react";
import { Search, Plus, X } from "lucide-react";
import { DataTable } from "./components/DataTable";
import { getColumns } from "./components/Columns";
import { Row } from "@tanstack/react-table";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";


interface ContactInfo {
  id: string;
  name: string;
  channel: string;
  customerLifecycle: string;
  phone: string;
  email: string;
  tags: string[];
  conversationStatus: string;
  dateAdded: string;
}

interface ContactForm {
  name: string;
  channel: string;
  customerLifecycle: string;
  phone: string;
  email: string;
  tags: string;
  conversationStatus: string;
}

const mockContacts: ContactInfo[] = [
  {
    id: "1",
    name: "John Doe",
    channel: "WhatsApp",
    customerLifecycle: "New Lead",
    phone: "+62812345678",
    email: "john@example.com",
    tags: ["VIP", "Urgent"],
    conversationStatus: "Active",
    dateAdded: "2024-01-15"
  },
  {
    id: "2",
    name: "Jane Smith",
    channel: "Telegram",
    customerLifecycle: "Hot Lead",
    phone: "+62823456789",
    email: "jane@example.com",
    tags: ["Follow-up"],
    conversationStatus: "Pending",
    dateAdded: "2024-01-14"
  },
  {
    id: "3",
    name: "Bob Wilson",
    channel: "WhatsApp",
    customerLifecycle: "Customer",
    phone: "+62834567890",
    email: "bob@example.com",
    tags: ["Regular"],
    conversationStatus: "Closed",
    dateAdded: "2024-01-13"
  }
];

const getLifecycleColor = (lifecycle: string) => {
  switch (lifecycle) {
    case "New Lead":
      return "blue";
    case "Hot Lead":
      return "red";
    case "Warm Lead":
      return "orange";
    case "Customer":
      return "green";
    case "Lost":
      return "gray";
    default:
      return "gray";
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case "Active":
      return "green";
    case "Pending":
      return "yellow";
    case "Closed":
      return "gray";
    default:
      return "gray";
  }
};

export default function ContactPage() {
  const { user, loading, isAuthenticated } = useAuth();
  const router = useRouter();
  const [contacts, setContacts] = useState<ContactInfo[]>(mockContacts);
  const [searchTerm, setSearchTerm] = useState("");
  const [channelFilter, setChannelFilter] = useState("all");
  const [lifecycleFilter, setLifecycleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState<ContactForm>({
    name: "",
    channel: "WhatsApp",
    customerLifecycle: "New Lead",
    phone: "",
    email: "",
    tags: "",
    conversationStatus: "Active"
  });

  // Authentication check
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      if (typeof window !== 'undefined') {
        const currentPath = window.location.pathname;
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
    return null;
  }

  const filteredContacts = useMemo(() => {
    return contacts.filter(contact => {
      const matchesSearch = contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           contact.phone.includes(searchTerm) ||
                           contact.email.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesChannel = channelFilter === "all" || contact.channel === channelFilter;
      const matchesLifecycle = lifecycleFilter === "all" || contact.customerLifecycle === lifecycleFilter;
      const matchesStatus = statusFilter === "all" || contact.conversationStatus === statusFilter;
      
      return matchesSearch && matchesChannel && matchesLifecycle && matchesStatus;
    });
  }, [contacts, searchTerm, channelFilter, lifecycleFilter, statusFilter]);

  const handleAddContact = () => {
    if (!formData.name || !formData.phone) {
      alert("Name and phone are required!");
      return;
    }

    const newContact: ContactInfo = {
      id: (contacts.length + 1).toString(),
      name: formData.name,
      channel: formData.channel,
      customerLifecycle: formData.customerLifecycle,
      phone: formData.phone,
      email: formData.email,
      tags: formData.tags ? formData.tags.split(",").map(tag => tag.trim()) : [],
      conversationStatus: formData.conversationStatus,
      dateAdded: new Date().toISOString().split('T')[0]
    };

    setContacts([...contacts, newContact]);
    setFormData({
      name: "",
      channel: "WhatsApp",
      customerLifecycle: "New Lead",
      phone: "",
      email: "",
      tags: "",
      conversationStatus: "Active"
    });
    setShowAddForm(false);
  };

  const handleDeleteContact = (contactId: string) => {
    setContacts(contacts.filter(contact => contact.id !== contactId));
  };

  const handleRowClick = (row: Row<ContactInfo>) => {
    console.log("Contact clicked:", row.original);
  };

  const columns = getColumns({
    onDelete: handleDeleteContact,
    getLifecycleColor,
    getStatusColor
  });

  return (
    <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <Title className="text-2xl font-bold text-gray-900">Contact Management</Title>
          <Text className="text-gray-600 mt-1">Manage your customer contacts and conversations</Text>
        </div>

        {/* Filters and Search */}
        <Card className="mb-6">
          <div className="space-y-4">
            <Flex className="gap-4 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <TextInput
                  icon={Search}
                  placeholder="Search contacts..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              
              <Select value={channelFilter} onValueChange={setChannelFilter}>
                <SelectItem value="all">All Channels</SelectItem>
                <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                <SelectItem value="Telegram">Telegram</SelectItem>
                <SelectItem value="SMS">SMS</SelectItem>
              </Select>
              
              <Select value={lifecycleFilter} onValueChange={setLifecycleFilter}>
                <SelectItem value="all">All Lifecycle</SelectItem>
                <SelectItem value="New Lead">New Lead</SelectItem>
                <SelectItem value="Hot Lead">Hot Lead</SelectItem>
                <SelectItem value="Warm Lead">Warm Lead</SelectItem>
                <SelectItem value="Customer">Customer</SelectItem>
                <SelectItem value="Lost">Lost</SelectItem>
              </Select>
              
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Closed">Closed</SelectItem>
              </Select>
              
              <Button
                icon={Plus}
                onClick={() => setShowAddForm(true)}
                className="whitespace-nowrap"
              >
                Add Contact
              </Button>
            </Flex>
          </div>
        </Card>

        {/* Add Contact Form */}
        {showAddForm && (
          <Card className="mb-6">
            <div className="space-y-4">
              <Flex className="justify-between items-center">
                <Title>Add New Contact</Title>
                <Button
                  variant="light"
                  icon={X}
                  onClick={() => setShowAddForm(false)}
                >
                  Close
                </Button>
              </Flex>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TextInput
                  placeholder="Contact Name"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                />
                
                <TextInput
                  placeholder="Phone Number"
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                />
                
                <TextInput
                  placeholder="Email Address"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                />
                
                <Select value={formData.channel} onValueChange={(value) => setFormData({...formData, channel: value})}>
                  <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                  <SelectItem value="Telegram">Telegram</SelectItem>
                  <SelectItem value="SMS">SMS</SelectItem>
                </Select>
                
                <Select value={formData.customerLifecycle} onValueChange={(value) => setFormData({...formData, customerLifecycle: value})}>
                  <SelectItem value="New Lead">New Lead</SelectItem>
                  <SelectItem value="Hot Lead">Hot Lead</SelectItem>
                  <SelectItem value="Warm Lead">Warm Lead</SelectItem>
                  <SelectItem value="Customer">Customer</SelectItem>
                  <SelectItem value="Lost">Lost</SelectItem>
                </Select>
                
                <Select value={formData.conversationStatus} onValueChange={(value) => setFormData({...formData, conversationStatus: value})}>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Closed">Closed</SelectItem>
                </Select>
                
                <TextInput
                  placeholder="Tags (comma separated)"
                  value={formData.tags}
                  onChange={(e) => setFormData({...formData, tags: e.target.value})}
                  className="md:col-span-2"
                />
              </div>
              
              <Flex className="justify-end gap-2">
                <Button variant="secondary" onClick={() => setShowAddForm(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddContact}>
                  Add Contact
                </Button>
              </Flex>
            </div>
          </Card>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <Text>Total Contacts</Text>
            <Title className="text-2xl">{contacts.length}</Title>
          </Card>
          <Card>
            <Text>Active Conversations</Text>
            <Title className="text-2xl">{contacts.filter(c => c.conversationStatus === "Active").length}</Title>
          </Card>
          <Card>
            <Text>New Leads</Text>
            <Title className="text-2xl">{contacts.filter(c => c.customerLifecycle === "New Lead").length}</Title>
          </Card>
          <Card>
            <Text>Customers</Text>
            <Title className="text-2xl">{contacts.filter(c => c.customerLifecycle === "Customer").length}</Title>
          </Card>
        </div>

        {/* Data Table */}
        <Card>
          <DataTable
            columns={columns}
            data={filteredContacts}
            onRowClick={handleRowClick}
          />
        </Card>
    </div>
  );
}