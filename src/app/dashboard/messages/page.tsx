"use client"

import React, { useState } from "react"
import { Card, Badge, TabGroup, TabList, Tab, TabPanels, TabPanel } from "@tremor/react"
import { 
  Search, 
  Phone, 
  Mail, 
  Paperclip, 
  Send, 
  Smile, 
  MoreVertical,
  MapPin,
  Clock,
  FileText,
  StickyNote,
  Calendar,
  CheckSquare,
  DollarSign
} from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/input"

interface User {
  id: string
  name: string
  avatar: string
  lastSeen: string
  unreadCount: number
  isOnline: boolean
  location?: string
  phone?: string
  email?: string
}

interface Message {
  id: string
  content: string
  timestamp: string
  isAgent: boolean
  attachment?: {
    type: 'pdf' | 'image'
    name: string
    size: string
    url: string
  }
}

interface Attachment {
  id: string
  name: string
  size: string
  type: 'pdf' | 'image'
  url: string
}

const mockUsers: User[] = [
  {
    id: "1",
    name: "Mohammad Ali",
    avatar: "/api/placeholder/40/40",
    lastSeen: "2 minutes ago",
    unreadCount: 3,
    isOnline: true,
    location: "California, USA",
    phone: "(888) 456-789",
    email: "mohammad@example.com"
  },
  {
    id: "2",
    name: "Ronald Richards",
    avatar: "/api/placeholder/40/40",
    lastSeen: "5 minutes ago",
    unreadCount: 0,
    isOnline: true,
    location: "New York, USA",
    phone: "(555) 123-456",
    email: "ronald@example.com"
  },
  {
    id: "3",
    name: "Jane Cooper",
    avatar: "/api/placeholder/40/40",
    lastSeen: "1 hour ago",
    unreadCount: 1,
    isOnline: false,
    location: "Texas, USA",
    phone: "(777) 987-654",
    email: "jane@example.com"
  },
  {
    id: "4",
    name: "Wade Warren",
    avatar: "/api/placeholder/40/40",
    lastSeen: "3 hours ago",
    unreadCount: 0,
    isOnline: false,
    location: "Florida, USA",
    phone: "(999) 111-222",
    email: "wade@example.com"
  }
]

const mockMessages: Message[] = [
  {
    id: "1",
    content: "Hi there! I'm having some issues with my account. Can you help me with that?",
    timestamp: "10:41 pm",
    isAgent: false
  },
  {
    id: "2",
    content: "Of course! I'd be happy to help you with your account. Can you please provide me with your account details so I can look up your account details?",
    timestamp: "10:42 pm",
    isAgent: true
  },
  {
    id: "3",
    content: "That's frustrating, but I appreciate your quick response. Do you have an estimated time for when it will be fixed?",
    timestamp: "51 minutes ago",
    isAgent: false
  },
  {
    id: "4",
    content: "I understand your frustration and I apologize for any inconvenience this may cause. Unfortunately, I don't have an exact time frame for the resolution yet. However, I can create a support ticket for you and ensure that you receive updates as soon as we have more information. Can I look up your account details in pdf?",
    timestamp: "16 minutes ago",
    isAgent: true
  },
  {
    id: "5",
    content: "Here is my attachment",
    timestamp: "8 minutes ago",
    isAgent: false,
    attachment: {
      type: 'pdf',
      name: 'problem-statement.pdf',
      size: '2.3 MB',
      url: '#'
    }
  },
  {
    id: "6",
    content: "Thank you for submitting your issue with pdf file, I will be back within short time. Please wait, we will let know what to do.",
    timestamp: "8 minutes ago",
    isAgent: true
  }
]

const mockAttachments: Attachment[] = [
  {
    id: "1",
    name: "problem-statement.pdf",
    size: "2.3 MB",
    type: "pdf",
    url: "#"
  },
  {
    id: "2",
    name: "passport.pdf",
    size: "1.8 MB",
    type: "pdf",
    url: "#"
  },
  {
    id: "3",
    name: "passport-scans.pdf",
    size: "3.2 MB",
    type: "pdf",
    url: "#"
  },
  {
    id: "4",
    name: "how-to-edit.pdf",
    size: "1.1 MB",
    type: "pdf",
    url: "#"
  }
]

export default function MessagesPage() {
  const [selectedUser, setSelectedUser] = useState<User>(mockUsers[0])
  const [searchQuery, setSearchQuery] = useState("")
  const [messageInput, setMessageInput] = useState("")
  const [conversationSearch, setConversationSearch] = useState("")

  const filteredUsers = mockUsers.filter(user => 
    user.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleSendMessage = () => {
    if (messageInput.trim()) {
      // Handle sending message
      setMessageInput("")
    }
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Left Column - Conversation List */}
      <div className="w-1/4 bg-white border-r border-gray-200 flex flex-col">
        {/* Search Bar */}
        <div className="p-4 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              type="text"
              placeholder="Search user or messages"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 w-full"
            />
          </div>
        </div>

        {/* User List */}
        <div className="flex-1 overflow-y-auto">
          {filteredUsers.map((user) => (
            <div
              key={user.id}
              onClick={() => setSelectedUser(user)}
              className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
                selectedUser.id === user.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                  {user.isOnline && (
                    <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-gray-900 truncate">{user.name}</h3>
                    {user.unreadCount > 0 && (
                      <Badge color="blue" size="xs">
                        {user.unreadCount}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 truncate">{user.lastSeen}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Middle Column - Chat Content */}
      <div className="w-2/4 flex flex-col">
        {/* Chat Header */}
        <div className="bg-white border-b border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <img
                  src={selectedUser.avatar}
                  alt={selectedUser.name}
                  className="w-10 h-10 rounded-full object-cover"
                />
                {selectedUser.isOnline && (
                  <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                )}
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">{selectedUser.name}</h2>
                <p className="text-sm text-gray-500">
                  {selectedUser.isOnline ? 'Online' : `Last seen ${selectedUser.lastSeen}`}
                </p>
              </div>
            </div>
            <Button variant="ghost">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {mockMessages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.isAgent ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl ${
                message.isAgent 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-white border border-gray-200 text-gray-900'
              }`}>
                <p className="text-sm">{message.content}</p>
                {message.attachment && (
                  <Card className="mt-2 p-3">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-red-500" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{message.attachment.name}</p>
                        <p className="text-xs text-gray-500">{message.attachment.size}</p>
                      </div>
                    </div>
                  </Card>
                )}
                <p className={`text-xs mt-1 ${
                  message.isAgent ? 'text-blue-100' : 'text-gray-500'
                }`}>
                  {message.timestamp}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Message Input */}
        <div className="bg-white border-t border-gray-200 p-4">
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Input
                type="text"
                placeholder="Type a message..."
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                className="pr-20"
              />
              <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
                <Button variant="ghost">
                  <Smile className="w-4 h-4" />
                </Button>
                <Button variant="ghost">
                  <Paperclip className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <Button onClick={handleSendMessage} className="px-4">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Right Column - User Info & Attachments */}
      <div className="w-1/4 bg-white border-l border-gray-200 flex flex-col">
        {/* User Profile Card */}
        <div className="p-4 border-b border-gray-200">
          <Card>
            <div className="text-center">
              <img
                src={selectedUser.avatar}
                alt={selectedUser.name}
                className="w-16 h-16 rounded-full mx-auto mb-3 object-cover"
              />
              <h3 className="font-semibold text-gray-900">{selectedUser.name}</h3>
              <div className="flex items-center justify-center gap-1 text-sm text-gray-500 mt-1">
                <MapPin className="w-3 h-3" />
                <span>{selectedUser.location}</span>
              </div>
              <div className="flex items-center justify-center gap-1 text-sm text-gray-500 mt-1">
                <Phone className="w-3 h-3" />
                <span>{selectedUser.phone}</span>
              </div>
              
              <div className="flex justify-center gap-2 mt-4">
                <Button variant="secondary">
                  <Phone className="w-4 h-4" />
                </Button>
                <Button variant="secondary">
                  <Mail className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* Search in Conversation */}
        <div className="p-4 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              type="text"
              placeholder="Search in conversation"
              value={conversationSearch}
              onChange={(e) => setConversationSearch(e.target.value)}
              className="pl-10 w-full"
            />
          </div>
        </div>

        {/* Tabs/Sections */}
        <div className="flex-1 overflow-y-auto">
          <TabGroup>
            <TabList className="p-4">
              <Tab>Attachments</Tab>
              <Tab>Notes</Tab>
              <Tab>Tasks</Tab>
              <Tab>Meetings</Tab>
              <Tab>Deals</Tab>
            </TabList>
            
            <TabPanels>
            <TabPanel className="p-4">
              <div className="space-y-3">
                {mockAttachments.map((attachment) => (
                  <Card key={attachment.id} className="p-3">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-red-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{attachment.name}</p>
                        <p className="text-xs text-gray-500">{attachment.size}</p>
                      </div>
                      <Button variant="ghost">
                        <MoreVertical className="w-3 h-3" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </TabPanel>
            
            <TabPanel className="p-4">
              <div className="text-center text-gray-500 py-8">
                <StickyNote className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No notes yet</p>
              </div>
            </TabPanel>
            
            <TabPanel className="p-4">
              <div className="text-center text-gray-500 py-8">
                <CheckSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No tasks yet</p>
              </div>
            </TabPanel>
            
            <TabPanel className="p-4">
              <div className="text-center text-gray-500 py-8">
                <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No meetings scheduled</p>
              </div>
            </TabPanel>
            
            <TabPanel className="p-4">
              <div className="text-center text-gray-500 py-8">
                <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No deals yet</p>
              </div>
            </TabPanel>
            </TabPanels>
          </TabGroup>
        </div>
      </div>
    </div>
  )
}