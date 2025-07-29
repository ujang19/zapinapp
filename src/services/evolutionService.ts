import { ZapinError, ErrorCodes } from '@/types';

// Evolution API Types
export interface EvolutionInstance {
  instanceName: string;
  status: 'open' | 'connecting' | 'close';
  serverUrl: string;
  apikey: string;
  owner: string;
  profileName?: string;
  profilePictureUrl?: string;
  integration: string;
  webhookUrl?: string;
  webhookByEvents?: boolean;
  webhookBase64?: boolean;
  webhookEvents?: string[];
  chatwootAccountId?: number;
  chatwootToken?: string;
  chatwootUrl?: string;
  chatwootSignMsg?: boolean;
  chatwootReopenConversation?: boolean;
  chatwootConversationPending?: boolean;
}

export interface CreateInstancePayload {
  instanceName: string;
  integration?: 'WHATSAPP-BAILEYS';
  qrcode?: boolean;
  webhook?: {
    url: string;
    byEvents: boolean;
    base64: boolean;
    events: string[];
  };
  chatwoot?: {
    enabled: boolean;
    accountId?: number;
    token?: string;
    url?: string;
    signMsg?: boolean;
    reopenConversation?: boolean;
    conversationPending?: boolean;
  };
  settings?: {
    rejectCall?: boolean;
    msgCall?: string;
    groupsIgnore?: boolean;
    alwaysOnline?: boolean;
    readMessages?: boolean;
    readStatus?: boolean;
    syncFullHistory?: boolean;
  };
}

export interface InstanceConnectionState {
  instance: {
    instanceName: string;
    status: 'open' | 'connecting' | 'close';
  };
  qrcode?: {
    base64: string;
    code: string;
  };
}

export interface SendMessagePayload {
  number: string;
  text?: string;
  media?: {
    mediatype: 'image' | 'video' | 'audio' | 'document';
    media: string; // base64 or URL
    caption?: string;
    fileName?: string;
  };
  delay?: number;
  quoted?: {
    key: {
      id: string;
    };
  };
  mentionsEveryOne?: boolean;
  mentioned?: string[];
}

export interface GroupInfo {
  id: string;
  subject: string;
  subjectOwner: string;
  subjectTime: number;
  creation: number;
  owner: string;
  desc?: string;
  descId?: string;
  restrict: boolean;
  announce: boolean;
  participants: Array<{
    id: string;
    admin?: 'admin' | 'superadmin';
  }>;
}

export interface ContactInfo {
  id: string;
  name?: string;
  notify?: string;
  verifiedName?: string;
  imgUrl?: string;
  status?: string;
}

export interface BotPayload {
  enabled: boolean;
  description?: string;
  url?: string;
  urlToken?: string;
  typebot?: {
    url: string;
    typebot: string;
    expire?: number;
    keywordFinish?: string;
    delayMessage?: number;
    unknownMessage?: string;
    listeningFromMe?: boolean;
    stopBotFromMe?: boolean;
    keepOpen?: boolean;
    debounceTime?: number;
  };
  openaibot?: {
    enabled: boolean;
    description?: string;
    botType: 'assistant' | 'chatCompletion';
    assistantId?: string;
    functionUrl?: string;
    model?: string;
    systemMessages?: Array<{ role: string; content: string }>;
    assistantMessages?: Array<{ role: string; content: string }>;
    userMessages?: Array<{ role: string; content: string }>;
    maxTokens?: number;
    expire?: number;
    keywordFinish?: string;
    delayMessage?: number;
    unknownMessage?: string;
    listeningFromMe?: boolean;
    stopBotFromMe?: boolean;
    keepOpen?: boolean;
    debounceTime?: number;
    openaiCredsId?: string;
  };
}

export interface WebhookPayload {
  url: string;
  byEvents: boolean;
  base64: boolean;
  events: string[];
}

export class EvolutionService {
  private baseUrl: string;
  private globalApiKey: string;
  private timeout: number = 30000;
  private retryAttempts: number = 3;
  private retryDelay: number = 1000;

  constructor() {
    this.baseUrl = process.env.EVOLUTION_API_BASE_URL || 'https://core.zapin.tech';
    this.globalApiKey = process.env.EVOLUTION_GLOBAL_API_KEY || '';
    
    if (!this.globalApiKey) {
      throw new Error('EVOLUTION_GLOBAL_API_KEY is required');
    }
  }

  private async makeRequest<T>(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      body?: any;
      headers?: Record<string, string>;
      instanceKey?: string;
    } = {}
  ): Promise<T> {
    const { method = 'GET', body, headers = {}, instanceKey } = options;
    
    const url = `${this.baseUrl}${endpoint}`;
    const requestHeaders = {
      'Content-Type': 'application/json',
      'apikey': instanceKey || this.globalApiKey,
      ...headers,
    };

    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(url, {
          method,
          headers: requestHeaders,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new ZapinError(
            ErrorCodes.EVOLUTION_API_ERROR,
            `Evolution API error: ${response.status} - ${errorData.message || response.statusText}`,
            response.status,
            errorData
          );
        }

        const data = await response.json();
        return data;
      } catch (error) {
        lastError = error as Error;
        
        if (error instanceof ZapinError) {
          throw error;
        }

        if (error instanceof Error && error.name === 'AbortError') {
          throw new ZapinError(
            ErrorCodes.EVOLUTION_API_TIMEOUT,
            'Evolution API request timeout',
            408
          );
        }

        if (attempt === this.retryAttempts) {
          throw new ZapinError(
            ErrorCodes.EVOLUTION_API_UNAVAILABLE,
            `Evolution API unavailable after ${this.retryAttempts} attempts: ${lastError.message}`,
            503
          );
        }

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
      }
    }

    throw lastError!;
  }

  // Instance Management
  async createInstance(payload: CreateInstancePayload): Promise<EvolutionInstance> {
    return this.makeRequest<EvolutionInstance>('/instance/create', {
      method: 'POST',
      body: payload,
    });
  }

  async getInstance(instanceName: string): Promise<EvolutionInstance> {
    return this.makeRequest<EvolutionInstance>(`/instance/fetchInstances?instanceName=${instanceName}`);
  }

  async getAllInstances(): Promise<EvolutionInstance[]> {
    return this.makeRequest<EvolutionInstance[]>('/instance/fetchInstances');
  }

  async deleteInstance(instanceName: string): Promise<{ status: string; message: string }> {
    return this.makeRequest(`/instance/delete/${instanceName}`, {
      method: 'DELETE',
    });
  }

  async restartInstance(instanceName: string): Promise<{ status: string; message: string }> {
    return this.makeRequest(`/instance/restart/${instanceName}`, {
      method: 'PUT',
    });
  }

  async logoutInstance(instanceName: string): Promise<{ status: string; message: string }> {
    return this.makeRequest(`/instance/logout/${instanceName}`, {
      method: 'DELETE',
    });
  }

  // Connection Management
  async getConnectionState(instanceName: string): Promise<InstanceConnectionState> {
    return this.makeRequest<InstanceConnectionState>(`/instance/connectionState/${instanceName}`);
  }

  async connectInstance(instanceName: string): Promise<InstanceConnectionState> {
    return this.makeRequest<InstanceConnectionState>(`/instance/connect/${instanceName}`, {
      method: 'GET',
    });
  }

  // Settings Management
  async updateInstanceSettings(
    instanceName: string,
    settings: {
      rejectCall?: boolean;
      msgCall?: string;
      groupsIgnore?: boolean;
      alwaysOnline?: boolean;
      readMessages?: boolean;
      readStatus?: boolean;
      syncFullHistory?: boolean;
    }
  ): Promise<{ status: string; message: string }> {
    return this.makeRequest(`/instance/settings/${instanceName}`, {
      method: 'PUT',
      body: settings,
    });
  }

  async getInstanceSettings(instanceName: string): Promise<any> {
    return this.makeRequest(`/instance/settings/${instanceName}`);
  }

  // Webhook Management
  async setWebhook(instanceName: string, webhook: WebhookPayload): Promise<{ status: string; message: string }> {
    return this.makeRequest(`/webhook/set/${instanceName}`, {
      method: 'POST',
      body: webhook,
    });
  }

  async getWebhook(instanceName: string): Promise<WebhookPayload> {
    return this.makeRequest<WebhookPayload>(`/webhook/find/${instanceName}`);
  }

  // Message Operations
  async sendTextMessage(
    instanceName: string,
    payload: { number: string; text: string; delay?: number; quoted?: any; mentionsEveryOne?: boolean; mentioned?: string[] }
  ): Promise<{ key: { id: string } }> {
    return this.makeRequest(`/message/sendText/${instanceName}`, {
      method: 'POST',
      body: payload,
    });
  }

  async sendMediaMessage(
    instanceName: string,
    payload: {
      number: string;
      mediatype: 'image' | 'video' | 'audio' | 'document';
      media: string;
      caption?: string;
      fileName?: string;
      delay?: number;
    }
  ): Promise<{ key: { id: string } }> {
    return this.makeRequest(`/message/sendMedia/${instanceName}`, {
      method: 'POST',
      body: payload,
    });
  }

  async sendLocationMessage(
    instanceName: string,
    payload: {
      number: string;
      latitude: number;
      longitude: number;
      name?: string;
      address?: string;
    }
  ): Promise<{ key: { id: string } }> {
    return this.makeRequest(`/message/sendLocation/${instanceName}`, {
      method: 'POST',
      body: payload,
    });
  }

  async sendContactMessage(
    instanceName: string,
    payload: {
      number: string;
      contact: {
        fullName: string;
        wuid: string;
        phoneNumber: string;
        organization?: string;
        email?: string;
        url?: string;
      };
    }
  ): Promise<{ key: { id: string } }> {
    return this.makeRequest(`/message/sendContact/${instanceName}`, {
      method: 'POST',
      body: payload,
    });
  }

  async sendReaction(
    instanceName: string,
    payload: {
      reactionMessage: {
        key: { id: string };
        reaction: string;
      };
    }
  ): Promise<{ key: { id: string } }> {
    return this.makeRequest(`/message/sendReaction/${instanceName}`, {
      method: 'POST',
      body: payload,
    });
  }

  // Chat Operations
  async fetchChats(instanceName: string): Promise<any[]> {
    return this.makeRequest(`/chat/fetchChats/${instanceName}`);
  }

  async fetchMessages(
    instanceName: string,
    remoteJid: string,
    limit: number = 20
  ): Promise<any[]> {
    return this.makeRequest(`/chat/fetchMessages/${instanceName}?remoteJid=${remoteJid}&limit=${limit}`);
  }

  async markMessageAsRead(
    instanceName: string,
    payload: {
      readMessages: Array<{
        id: string;
        fromMe: boolean;
        remoteJid: string;
      }>;
    }
  ): Promise<{ status: string; message: string }> {
    return this.makeRequest(`/chat/markMessageAsRead/${instanceName}`, {
      method: 'PUT',
      body: payload,
    });
  }

  async archiveChat(
    instanceName: string,
    payload: { chat: string; archive: boolean }
  ): Promise<{ status: string; message: string }> {
    return this.makeRequest(`/chat/archiveChat/${instanceName}`, {
      method: 'PUT',
      body: payload,
    });
  }

  async deleteMessage(
    instanceName: string,
    payload: {
      id: string;
      fromMe: boolean;
      remoteJid: string;
    }
  ): Promise<{ status: string; message: string }> {
    return this.makeRequest(`/chat/deleteMessage/${instanceName}`, {
      method: 'DELETE',
      body: payload,
    });
  }

  // Group Operations
  async createGroup(
    instanceName: string,
    payload: {
      subject: string;
      description?: string;
      participants: string[];
    }
  ): Promise<{ groupId: string }> {
    return this.makeRequest(`/group/create/${instanceName}`, {
      method: 'POST',
      body: payload,
    });
  }

  async getGroupInfo(instanceName: string, groupId: string): Promise<GroupInfo> {
    return this.makeRequest<GroupInfo>(`/group/fetchGroupInfo/${instanceName}?groupId=${groupId}`);
  }

  async updateGroupSubject(
    instanceName: string,
    payload: { groupId: string; subject: string }
  ): Promise<{ status: string; message: string }> {
    return this.makeRequest(`/group/updateGroupSubject/${instanceName}`, {
      method: 'PUT',
      body: payload,
    });
  }

  async updateGroupDescription(
    instanceName: string,
    payload: { groupId: string; description: string }
  ): Promise<{ status: string; message: string }> {
    return this.makeRequest(`/group/updateGroupDescription/${instanceName}`, {
      method: 'PUT',
      body: payload,
    });
  }

  async addParticipants(
    instanceName: string,
    payload: { groupId: string; participants: string[] }
  ): Promise<{ status: string; message: string }> {
    return this.makeRequest(`/group/addParticipant/${instanceName}`, {
      method: 'PUT',
      body: payload,
    });
  }

  async removeParticipants(
    instanceName: string,
    payload: { groupId: string; participants: string[] }
  ): Promise<{ status: string; message: string }> {
    return this.makeRequest(`/group/removeParticipant/${instanceName}`, {
      method: 'PUT',
      body: payload,
    });
  }

  async promoteParticipants(
    instanceName: string,
    payload: { groupId: string; participants: string[] }
  ): Promise<{ status: string; message: string }> {
    return this.makeRequest(`/group/promoteParticipant/${instanceName}`, {
      method: 'PUT',
      body: payload,
    });
  }

  async demoteParticipants(
    instanceName: string,
    payload: { groupId: string; participants: string[] }
  ): Promise<{ status: string; message: string }> {
    return this.makeRequest(`/group/demoteParticipant/${instanceName}`, {
      method: 'PUT',
      body: payload,
    });
  }

  async leaveGroup(
    instanceName: string,
    payload: { groupId: string }
  ): Promise<{ status: string; message: string }> {
    return this.makeRequest(`/group/leaveGroup/${instanceName}`, {
      method: 'DELETE',
      body: payload,
    });
  }

  // Contact Operations
  async fetchContacts(instanceName: string): Promise<ContactInfo[]> {
    return this.makeRequest<ContactInfo[]>(`/chat/fetchContacts/${instanceName}`);
  }

  async getContactInfo(instanceName: string, number: string): Promise<ContactInfo> {
    return this.makeRequest<ContactInfo>(`/chat/fetchProfile/${instanceName}?number=${number}`);
  }

  async checkNumberExists(instanceName: string, numbers: string[]): Promise<Array<{ exists: boolean; jid: string }>> {
    return this.makeRequest(`/chat/whatsappNumbers/${instanceName}`, {
      method: 'POST',
      body: { numbers },
    });
  }

  // Bot Management
  async setTypebot(instanceName: string, payload: BotPayload): Promise<{ status: string; message: string }> {
    return this.makeRequest(`/typebot/set/${instanceName}`, {
      method: 'POST',
      body: payload,
    });
  }

  async getTypebot(instanceName: string): Promise<BotPayload> {
    return this.makeRequest<BotPayload>(`/typebot/find/${instanceName}`);
  }

  async setOpenAIBot(instanceName: string, payload: BotPayload): Promise<{ status: string; message: string }> {
    return this.makeRequest(`/openaibot/set/${instanceName}`, {
      method: 'POST',
      body: payload,
    });
  }

  async getOpenAIBot(instanceName: string): Promise<BotPayload> {
    return this.makeRequest<BotPayload>(`/openaibot/find/${instanceName}`);
  }

  // Profile Operations
  async updateProfileName(
    instanceName: string,
    payload: { name: string }
  ): Promise<{ status: string; message: string }> {
    return this.makeRequest(`/chat/updateProfileName/${instanceName}`, {
      method: 'PUT',
      body: payload,
    });
  }

  async updateProfileStatus(
    instanceName: string,
    payload: { status: string }
  ): Promise<{ status: string; message: string }> {
    return this.makeRequest(`/chat/updateProfileStatus/${instanceName}`, {
      method: 'PUT',
      body: payload,
    });
  }

  async updateProfilePicture(
    instanceName: string,
    payload: { picture: string }
  ): Promise<{ status: string; message: string }> {
    return this.makeRequest(`/chat/updateProfilePicture/${instanceName}`, {
      method: 'PUT',
      body: payload,
    });
  }

  async removeProfilePicture(instanceName: string): Promise<{ status: string; message: string }> {
    return this.makeRequest(`/chat/removeProfilePicture/${instanceName}`, {
      method: 'DELETE',
    });
  }

  async fetchProfilePicture(instanceName: string, number: string): Promise<{ profilePictureUrl: string }> {
    return this.makeRequest<{ profilePictureUrl: string }>(`/chat/fetchProfilePicture/${instanceName}?number=${number}`);
  }

  // Privacy Settings
  async updatePrivacySettings(
    instanceName: string,
    payload: {
      readreceipts?: 'all' | 'none';
      profile?: 'all' | 'contacts' | 'contact_blacklist' | 'none';
      status?: 'all' | 'contacts' | 'contact_blacklist' | 'none';
      online?: 'all' | 'match_last_seen';
      last?: 'all' | 'contacts' | 'contact_blacklist' | 'none';
      groupadd?: 'all' | 'contacts' | 'contact_blacklist' | 'none';
    }
  ): Promise<{ status: string; message: string }> {
    return this.makeRequest(`/chat/updatePrivacySettings/${instanceName}`, {
      method: 'PUT',
      body: payload,
    });
  }

  async fetchPrivacySettings(instanceName: string): Promise<any> {
    return this.makeRequest(`/chat/fetchPrivacySettings/${instanceName}`);
  }

  // Business Profile
  async updateBusinessProfile(
    instanceName: string,
    payload: {
      description?: string;
      category?: string;
      email?: string;
      websites?: string[];
      address?: {
        street?: string;
        city?: string;
        state?: string;
        zip?: string;
        country?: string;
      };
    }
  ): Promise<{ status: string; message: string }> {
    return this.makeRequest(`/chat/updateBusinessProfile/${instanceName}`, {
      method: 'PUT',
      body: payload,
    });
  }

  async fetchBusinessProfile(instanceName: string): Promise<any> {
    return this.makeRequest(`/chat/fetchBusinessProfile/${instanceName}`);
  }
}

// Singleton instance
export const evolutionService = new EvolutionService();