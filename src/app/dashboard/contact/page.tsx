"use client";

import { useState, useMemo } from "react";
import { Title, Text, Button, Flex, Badge, TextInput, Select, SelectItem } from "@tremor/react";
import { Card } from "@/components/tremor/Card";
import { Search, Plus, X } from "lucide-react";
import { DataTable } from "./components/DataTable";
import { getColumns } from "./components/Columns";
import { Row } from "@tanstack/react-table";

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
    case "new lead":
      return "blue";
    case "hot lead":
      return "red";
    case "payment":
      return "yellow";
    case "customer":
      return "emerald";
    case "cold lead":
      return "gray";
    default:
      return "gray";
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case "active":
      return "emerald";
    case "pending":
      return "yellow";
    case "inactive":
      return "gray";
    default:
      return "gray";
  }
};

export default function ContactPage() {
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [lifecycleFilter, setLifecycleFilter] = useState("all");
  const [segmentFilter, setSegmentFilter] = useState("all");
  const [formData, setFormData] = useState<ContactForm>({
    name: "",
    channel: "",
    customerLifecycle: "",
    phone: "",
    email: "",
    tags: "",
    conversationStatus: ""
  });

  const columns = getColumns();

  const filteredContacts = useMemo(() => {
    return mockContacts.filter(contact => {
      const matchesSearch = contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           contact.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           contact.phone.includes(searchTerm);
      
      const matchesLifecycle = lifecycleFilter === "all" || contact.customerLifecycle === lifecycleFilter;
      
      const matchesSegment = segmentFilter === "all" || 
                            contact.tags.some(tag => tag.toLowerCase().includes(segmentFilter.toLowerCase()));
      
      return matchesSearch && matchesLifecycle && matchesSegment;
    });
  }, [searchTerm, lifecycleFilter, segmentFilter]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Handle form submission here
    console.log("Form submitted:", formData);
    setShowForm(false);
    setFormData({
      name: "",
      channel: "",
      customerLifecycle: "",
      phone: "",
      email: "",
      tags: "",
      conversationStatus: ""
    });
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <Title>Contact Management</Title>
        <Text className="mt-2">Kelola kontak dan komunikasi dengan pelanggan</Text>
      </div>

      {/* Filters and Search */}
      <Card className="mb-6">
        <div className="space-y-4">
          <Flex justifyContent="between" alignItems="center">
            <div className="flex-1 max-w-md">
              <TextInput
                icon={Search}
                placeholder="Cari kontak..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Button 
              variant="primary" 
              onClick={() => setShowForm(true)}
              className="ml-4"
            >
              <Plus className="h-4 w-4 mr-2" />
              Tambah Kontak
            </Button>
          </Flex>
          
          <Flex className="gap-4">
            <div className="flex-1">
              <Text className="text-sm font-medium mb-2">Customer Lifecycle</Text>
              <Select value={lifecycleFilter} onValueChange={setLifecycleFilter}>
                <SelectItem value="all">Semua Lifecycle</SelectItem>
                <SelectItem value="new lead">New Lead</SelectItem>
                <SelectItem value="hot lead">Hot Lead</SelectItem>
                <SelectItem value="payment">Payment</SelectItem>
                <SelectItem value="customer">Customer</SelectItem>
                <SelectItem value="cold lead">Cold Lead</SelectItem>
              </Select>
            </div>
            
            <div className="flex-1">
              <Text className="text-sm font-medium mb-2">Segment</Text>
              <Select value={segmentFilter} onValueChange={setSegmentFilter}>
                <SelectItem value="all">Semua Segment</SelectItem>
                <SelectItem value="vip">VIP</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
                <SelectItem value="premium">Premium</SelectItem>
                <SelectItem value="startup">Startup</SelectItem>
                <SelectItem value="regular">Regular</SelectItem>
              </Select>
            </div>
          </Flex>
        </div>
      </Card>

      {/* Contact Table */}
      <DataTable 
        columns={columns} 
        data={filteredContacts}
      />

      {/* Add Contact Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md">
            <Flex justifyContent="between" alignItems="center" className="mb-4">
              <Title>Tambah Kontak Baru</Title>
              <Button 
                 variant="light" 
                 onClick={() => setShowForm(false)}
                 className="p-1"
               >
                 <X className="h-4 w-4" />
               </Button>
            </Flex>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Nama</label>
                <TextInput
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <TextInput
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Phone</label>
                <TextInput
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Saluran</label>
                <Select value={formData.channel} onValueChange={(value) => setFormData({ ...formData, channel: value })}>
                  <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                  <SelectItem value="Telegram">Telegram</SelectItem>
                  <SelectItem value="Email">Email</SelectItem>
                  <SelectItem value="SMS">SMS</SelectItem>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Customer Lifecycle</label>
                <Select value={formData.customerLifecycle} onValueChange={(value) => setFormData({ ...formData, customerLifecycle: value })}>
                  <SelectItem value="new lead">New Lead</SelectItem>
                  <SelectItem value="hot lead">Hot Lead</SelectItem>
                  <SelectItem value="payment">Payment</SelectItem>
                  <SelectItem value="customer">Customer</SelectItem>
                  <SelectItem value="cold lead">Cold Lead</SelectItem>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Tags (pisahkan dengan koma)</label>
                <TextInput
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  placeholder="VIP, Enterprise, Premium"
                />
              </div>
              <Flex className="gap-3 pt-4">
                <Button type="submit" variant="primary" className="flex-1">
                  Simpan Kontak
                </Button>
                <Button 
                  type="button" 
                  variant="secondary" 
                  onClick={() => setShowForm(false)}
                  className="flex-1"
                >
                  Batal
                </Button>
              </Flex>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}