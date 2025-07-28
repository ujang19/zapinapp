Understood. I’ll create a comprehensive AI-readable Markdown and YAML-formatted dataset that explains all Evolution API v2.2.2 endpoints with a focus on implementation for your Zapin WhatsApp gateway use case. This will include endpoint structure, payloads, parameter meanings, and example use for proxying and message tracking per device.

I’ll let you know as soon as it’s ready for your review.


# Evolution API v2.2.2 – Zapin Proxy Integration Guide

This documentation provides a comprehensive overview of the **Evolution API v2.2.2** for use within the Zapin proxy architecture. Zapin proxies client requests from `api.zapin` to the Evolution API backend at `core.zapin`, allowing centralized **rate limiting**, per-device authentication, and activity monitoring. All endpoints documented here pertain to WhatsApp messaging integration. Each section details the HTTP method, path, headers, request/response schema (in YAML for clarity), parameter explanations, and usage notes for proxy enforcement and monitoring.

**Authentication:** Every request must include the API key in the header (e.g. `apikey: <your-api-key>`). Use the global API key for instance creation and management, and (optionally) instance-specific keys for messaging if provided. The proxy should validate API keys and enforce per-instance access controls.

**Base URL:** In examples, `{{baseUrl}}` represents the Evolution API base URL (e.g. `https://core.zapin/api`). The `{instance}` path parameter refers to the unique instance identifier (obtained on creation).

**Event Monitoring:** The Evolution API can emit events for various actions (new message, status update, etc.) via **Webhooks**, **WebSocket**, **RabbitMQ**, or **SQS** integrations. The Zapin proxy can configure these to monitor messaging activity in real-time and enforce business rules.

Below, API endpoints are grouped by functionality. YAML schemas illustrate request and response structures. Comments (`# ...`) are provided for optional fields and usage guidance.

## Instance Management

Manage WhatsApp instances (each representing a WhatsApp connection tied to a device). The proxy uses these endpoints to create or manage device instances, and can impose limits on the number of instances per user or control their lifecycle.

### Create Instance

**Method:** `POST`
**Path:** `/instance/create`
**Headers:** `Content-Type: application/json`, `apikey: <global-api-key>`

Create a new WhatsApp instance (device session). On success, returns an `instanceId` and an instance-specific API key (“hash”) for subsequent calls. The instance will initially be in a "created" or connecting state.

```yaml
# Request Body
instanceName: <string>        # Friendly name for the instance (required)
token: <string> (optional)    # Reuse an existing session token (if restoring)
number: <string> (optional)   # Specific WhatsApp number (if linking an existing account)
qrcode: <boolean> (optional)  # If true, include a QR code for login (base64 in response)
integration: <string>         # Integration mode: "WHATSAPP-BAILEYS" | "WHATSAPP-BUSINESS" | "EVOLUTION"
# Optional Settings (initial instance behavior):
rejectCall: <boolean>         # If true, auto-reject incoming calls (default false)
msgCall: <string>             # Auto-reply message when call is rejected (if rejectCall true)
groupsIgnore: <boolean>       # If true, ignore group messages (default false)
alwaysOnline: <boolean>       # If true, keep session online (prevent battery saver, default false)
readMessages: <boolean>       # Auto-mark incoming messages as read (default false)
readStatus: <boolean>         # Auto-mark status updates as viewed (default false)
syncFullHistory: <boolean>    # If true, sync full chat history on connect (may be heavy)
# Optional Proxy configuration for this instance:
proxyHost: <string>           # Proxy server host to route this instance’s traffic (if needed)
proxyPort: <string>           # Proxy server port
proxyProtocol: <string>       # "http", "https", etc.
proxyUsername: <string>       # Proxy auth username (if required)
proxyPassword: <string>       # Proxy auth password (if required)
# Optional Webhook configuration for event callbacks:
webhook:
  url: <string>               # Endpoint to receive events (e.g. messages, status)
  byEvents: <boolean>         # If true, only send events specified in "events" list
  base64: <boolean>           # If true, include media as base64 in callbacks
  headers:                    # Custom headers to include in webhook callbacks
    Authorization: "Bearer <token>" 
    Content-Type: "application/json"
  events:                     # List of event types to subscribe to (if byEvents=true)
    - "APPLICATION_STARTUP"
    - "QRCODE_UPDATED"
    - "MESSAGES_UPSERT"
    - ...                     # (See Webhook section for full list of event types)
# Optional RabbitMQ integration (see RabbitMQ section):
rabbitmq:
  enabled: <boolean>
  events: [ "MESSAGES_UPSERT", "CHATS_UPDATE", ... ] 
# Optional SQS integration (see SQS section):
sqs:
  enabled: <boolean>
  events: [ "MESSAGES_UPSERT", "CHATS_UPDATE", ... ]
```

**Response:** On success (HTTP 201), returns the new instance details, API key, and applied settings. For example:

```yaml
instance:
  instanceId: "af6c5b7c-ee27-4f94-9ea8-192393746ddd"   # Unique ID of the instance
  instanceName: "MyInstance"
  status: "created"                                    # Current status (e.g. created, connected)
  webhook_wa_business: null
  access_token_wa_business: "" 
hash:
  apikey: "123456"            # Instance-specific API key for subsequent requests
settings:
  reject_call: false
  msg_call: ""
  groups_ignore: false
  always_online: false
  read_messages: false
  read_status: false
  sync_full_history: false
```

> **Proxy Note:** The proxy should capture the `instanceId` and `hash.apikey` from this response. It can store the instance’s API key and enforce using it for all future calls related to this instance (for enhanced security). The QR code (if `qrcode: true`) is returned as `qrcode.base64` in the response (not shown above) and can be relayed to clients for scanning. Rate limiting can be applied here to restrict how frequently users can create instances.

### Fetch Instances

**Method:** `GET`
**Path:** `/instance/fetchInstances`
**Headers:** `apikey: <global-api-key>`

Retrieve a list of instances or query a specific instance. Supports optional query parameters for filtering.

* Query Parameters (optional):

  * `instanceName` – filter by the instance name
  * `instanceId` – filter by the instance UUID

```yaml
# Request Example (no body, just query params if needed)
GET /instance/fetchInstances?instanceId=<id>&instanceName=<name>
```

**Response:** Returns an array of instances (or a single instance if filtered by ID). Each instance object typically includes its `instanceId`, `instanceName`, status, and possibly connection info (like phone number). For example:

```yaml
instances:
  - instanceId: "af6c5b7c-ee27-4f94-9ea8-192393746ddd"
    instanceName: "MyInstance"
    status: "connected"
    phoneNumber: "+15551234567"
  - instanceId: "123e4567-e89b-12d3-a456-426614174000"
    instanceName: "TestInstance"
    status: "created"
    phoneNumber: null
# ...additional instances...
```

> **Proxy Note:** Useful for the proxy’s admin interface to list active instances or verify an instance’s status. The proxy should ensure only authorized users can list instances (e.g., filter by owner if multi-tenant).

### Instance Connect

**Method:** `GET`
**Path:** `/instance/connect/{instance}`
**Headers:** `apikey: <global-api-key>` (or instance API key)

Manually initiate a connection for the given instance (e.g., if it’s created but not yet connected). The `{instance}` path parameter is the `instanceId`.

If the instance is in "created" state and a QR code was returned, the actual connection happens when the QR code is scanned. This endpoint can trigger a reconnection attempt if the instance was disconnected.

```yaml
# No request body for this endpoint.
```

**Response:** Returns a status object indicating connection attempt initiated. It may include fields like `instanceId`, and a connection state (e.g. "connecting"). If the instance is already connected, it may return its current state.

> **Proxy Note:** The proxy can call this endpoint after instance creation if needed or expose it for clients to manually reconnect. Rate limiting reconnection attempts can prevent abuse.

### Restart Instance

**Method:** `PUT`
**Path:** `/instance/restart/{instance}`
**Headers:** `apikey: <global-api-key>` (or instance API key)

Restart a running instance. This will disconnect and immediately attempt to reconnect the WhatsApp session for the given instance.

```yaml
# No body required for restart.
```

**Response:** Returns a result indicating the restart command was accepted (often just a success message or the new status).

> **Proxy Note:** Use this to recover stuck sessions. The proxy might automatically call this if it detects via events that an instance is unresponsive. Limit the frequency of restarts for a given instance.

### Set Presence

**Method:** `POST`
**Path:** `/instance/setPresence/{instance}`
**Headers:** `apikey: <global-api-key>` (or instance API key)

Manually set the “presence” (online status) of the WhatsApp instance user. This controls whether the account appears online/typing to others.

```yaml
# Request Body
presence: <string>   # "available" (online/active) or "unavailable" (offline)
```

**Response:** A confirmation of presence state update (e.g., `{"presence": "available"}`).

> **Proxy Note:** If `alwaysOnline` was set to true in settings, the instance tries to stay available. The proxy can still use this endpoint to override presence (e.g., to appear offline for maintenance).

### Connection State

**Method:** `GET`
**Path:** `/instance/connectionState/{instance}`
**Headers:** `apikey: <global-api-key>` (or instance API key)

Check the current connection status of the instance. Returns information such as whether the instance is connected, connecting, or disconnected, and possibly the last QR code (if waiting for scan).

```yaml
# Example Response
state: "CONNECTED"        # or "DISCONNECTED", "QR_SCAN_WAIT", etc.
online: true              # true if WhatsApp is currently online
pushName: "John Doe"      # WhatsApp account name
platform: "Web"           # Client platform
```

> **Proxy Note:** The proxy can poll or use this endpoint to update clients about the instance status (for example, whether the QR code scan is still pending, or connection was lost). However, using event callbacks (webhook or websocket) is more efficient for real-time updates.

### Logout Instance

**Method:** `DELETE`
**Path:** `/instance/logout/{instance}`
**Headers:** `apikey: <global-api-key>` (or instance API key)

Logs out the WhatsApp session for the instance, but keeps the instance configuration. After calling logout, the instance will require scanning a new QR code to reconnect (if using WhatsApp Web sessions).

```yaml
# No body required. The instanceId in path identifies which session to log out.
```

**Response:** Success message (e.g., `{"status":"logged out"}`) or the instance state indicating it’s logged out.

> **Proxy Note:** Use this to remotely log a device out (for example, if a user requests disconnection). The proxy should ensure only the instance owner triggers a logout. An automatic logout could be triggered if a security issue is detected.

### Delete Instance

**Method:** `DELETE`
**Path:** `/instance/delete/{instance}`
**Headers:** `apikey: <global-api-key>`

Permanently delete an instance configuration. This stops the session (if running) and removes all associated data for that instance on the server (e.g., message history, contacts, etc., if stored).

```yaml
# No body required. Only the instanceId in the path is needed.
```

**Response:** Confirmation of deletion (e.g., `{"deleted": true, "instanceId": "..."} `).

> **Proxy Note:** After deletion, any cached keys or data in the proxy for that instance should be cleared. The proxy should restrict this action to authorized users and possibly implement a cooldown or confirmation step (because it is irreversible).

## Proxy Configuration

These endpoints allow configuring an upstream proxy for WhatsApp connectivity on a per-instance basis. This is separate from the Zapin proxy; it refers to a networking proxy (e.g., if you need to route WhatsApp traffic through a proxy server).

### Set Proxy

**Method:** `POST`
**Path:** `/proxy/set/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <global-api-key>` (or instance API key)

Enable or update the network proxy settings for an instance. Use this if the WhatsApp connection should go through a specific proxy (for instance, to control IP or region).

```yaml
# Request Body
enabled: <boolean>    # Enable or disable usage of a proxy
host: "<proxy-host>"  # Proxy server hostname or IP
port: "8080"          # Proxy server port (string to preserve leading zeros if any)
protocol: "http"      # Protocol ("http", "https", "socks", etc.)
username: "<user>"    # (Optional) Username for proxy auth 
password: "<pass>"    # (Optional) Password for proxy auth
```

**Response:** Reflects the configured proxy settings (for example, returning the saved config or a success status). A typical success response might echo `{ "enabled": true, "host": "0.0.0.0", "port": "8000", ... }` which matches the request data.

> **Proxy Note:** This is usually set at instance creation (via optional fields), but this endpoint allows changing it on the fly. The Zapin proxy can expose this to clients who need to update their networking proxy. The proxy (Zapin) itself might not often call this, since it’s more about the Evolution API’s connection, but it could enforce that only allowed proxy addresses are used.

### Find Proxy

**Method:** `GET`
**Path:** `/proxy/find/{instance}`
**Headers:** `apikey: <global-api-key>` (or instance API key)

Retrieve the current proxy settings for the instance.

```yaml
# No request body.
```

**Response:** The stored proxy configuration for the instance, e.g.:

```yaml
enabled: true
host: "0.0.0.0"
port: "8000"
protocol: "http"
username: "user"
password: "pass"
```

> **Proxy Note:** Zapin can use this to audit or display an instance’s network proxy settings. It could be part of a diagnostic check if an instance is failing to connect.

## Instance Settings

Global behavior settings per instance. These mirror the optional fields in **Create Instance**, but can be updated at runtime.

### Set Settings

**Method:** `POST`
**Path:** `/settings/set/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <global-api-key>` (or instance API key)

Update the settings for an instance. Only include the fields you want to change; unspecified fields remain unchanged.

```yaml
# Request Body (all fields optional; omit to keep current value)
rejectCall: <boolean>      # Whether to auto-reject incoming voice/video calls
msgCall: <string>          # Message to send when rejecting a call
groupsIgnore: <boolean>    # Whether to ignore all group chats/messages
alwaysOnline: <boolean>    # Keep connection alive (prevent going offline)
readMessages: <boolean>    # Auto-mark incoming messages as read
readStatus: <boolean>      # Auto-mark status (stories) as seen
syncFullHistory: <boolean> # On reconnect, sync the full chat history
```

**Response:** The updated settings, or success status. For example:

```yaml
settings:
  reject_call: true
  msg_call: "I do not accept calls"
  groups_ignore: false
  always_online: true
  read_messages: false
  read_status: false
  sync_full_history: false
```

> **Proxy Note:** The proxy could enforce certain settings for compliance. For instance, a business policy might require `alwaysOnline = true`. The proxy can override or validate settings changes through this endpoint.

### Find Settings

**Method:** `GET`
**Path:** `/settings/find/{instance}`
**Headers:** `apikey: <global-api-key>` (or instance API key)

Fetch the current settings for the instance.

```yaml
# No body required.
```

**Response:** Returns the settings object for the instance (same format as in **Set Settings** response):

```yaml
settings:
  reject_call: true
  msg_call: "I do not accept calls"
  groups_ignore: false
  always_online: true
  read_messages: false
  read_status: false
  sync_full_history: false
```

> **Proxy Note:** Use this to verify an instance’s configuration. The proxy’s monitoring could also compare these settings with defaults or policy requirements and alert if something is off (for example, if `groupsIgnore` should be true for certain accounts).

## Messaging Endpoints

These endpoints allow sending various types of WhatsApp messages through an instance. The proxy will receive API calls (from client applications) to `api.zapin`, and should forward them to these endpoints on `core.zapin` after authenticating and applying rate limits.

All message-sending endpoints expect an `{instance}` path parameter and require the instance to be connected. They generally respond with a message ID or a status indicating the message was sent or queued.

Common request fields across many send endpoints:

* `number`: The recipient’s WhatsApp number (international format, without `@s.whatsapp.net` – the API will infer the JID) or in some cases the full JID. In our examples we use `{{remoteJid}}` to indicate the number.
* `delay`: (Optional) Milliseconds to delay sending (e.g., for scheduled sending).
* `quoted`: (Optional) An object to quote/reply to an existing message. Provide either the full message payload or at least the `key.id` of a message stored in the database.
* `mentioned`: (Optional) A list of contacts to mention in the message (use phone numbers or JIDs).
* `mentionsEveryOne`: (Optional boolean) If true, and the message is in a group, tag all participants (equivalent to @everyone).

Below we detail each message type:

### Send Text

**Method:** `POST`
**Path:** `/message/sendText/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>` (or global key)

Send a plain text message to a user or group.

```yaml
# Request Body
number: "<recipient-number>"   # recipient's WhatsApp number in international format
text: "Hello, this is a test message"   # message text content

# Optional message send options:
delay: 1200               # (ms) delay before sending
quoted:                   # reply/quote an existing message
  key: 
    id: "<message-id>"    # ID of the message to quote (from DB or cache)
  message: 
    conversation: "<original message text>"
mentionsEveryOne: false   # If true and this is a group, mention all
mentioned:                # Specific mentioned JIDs in the message text
  - "<some-number>@s.whatsapp.net"
```

**Response:** Typically returns a message send result, e.g. an object containing the new `messageId` and maybe an internal status:

```yaml
messageId: "ABCD1234...",
timestamp: 1694012345,
queued: true 
```

> **Proxy Note:** This is the simplest send endpoint. The proxy should throttle these calls per instance (e.g., to X messages per second) to avoid WhatsApp rate limits. It should also verify the `number` format and perhaps restrict messaging to allowed numbers or groups as per business rules.

### Send Media (URL)

**Method:** `POST`
**Path:** `/message/sendMedia/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Send a media message by URL or base64 content. This endpoint covers **images**, **videos**, and **documents** by providing a direct URL or base64 string of the file.

```yaml
# Request Body
number: "<recipient-number>"
mediatype: "<type>"        # "image", "video", or "document"
mimetype: "<mime-type>"    # e.g. "image/png", "video/mp4", "application/pdf"
caption: "Caption text"    # Caption for the media (optional, for images/videos)
media: "<url-or-base64>"   # Either a public URL to the file, or a base64 data URI
fileName: "file.pdf"       # File name (especially for documents, to show to user)

# Optional send options (same as in Send Text):
delay: 1000
quoted: { ... } 
mentionsEveryOne: false
mentioned: [ "<number>@s.whatsapp.net" ]
```

**Response:** Returns a structure similar to send text (with message ID, etc.), possibly with additional info like WhatsApp’s media message ID.

> **Proxy Note:** The proxy should ensure the media URL is accessible or the base64 isn’t excessively large (to avoid timeouts). If the media is user-uploaded to the proxy, the proxy might first obtain a permanent URL or convert to base64 then call this endpoint. Rate limiting large media sends is important, as they consume more bandwidth.

### Send Media (File Upload)

**Method:** `POST`
**Path:** `/message/sendMedia/{instance}`
**Headers:** `Content-Type: multipart/form-data`, `apikey: <instance-api-key>`

This variant allows uploading a media file directly as form-data. Use this when the file is local rather than hosted.

**Request (Multipart Form-Data):**
Fields:

* `number`: recipient’s number (text field)
* `file`: the binary file (file field)

No example YAML given here due to binary content, but this is a standard file upload form.

**Response:** Similar to send media via URL.

> **Proxy Note:** The proxy can accept a file upload from a client and forward it to this endpoint. Ensure the proxy streams the file to avoid loading it entirely in memory. Also, apply file size/type restrictions for security.

### Send PTV (Video URL/Base64)

**Method:** `POST`
**Path:** `/message/sendPtv/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

PTV stands for **Picture to Video** message, commonly a one-time view or streaming video. This endpoint sends a video message by URL or base64 (similar to Send Media, but specifically for videos intended as view-once perhaps).

```yaml
# Request Body
number: "<recipient-number>"
video: "<url-or-base64>"   # Video content location (URL or base64 data)
# (A caption field is not explicitly used here; PTV is usually a direct video)
delay: 1200               # optional delay
quoted: { ... }           # optional reply context
mentionsEveryOne: false
mentioned: [ ... ]
```

**Response:** Contains message ID of the sent video message.

> **Proxy Note:** Use this for sending videos. If a video needs conversion or size check, the proxy should handle that prior to calling. The endpoint might handle large files differently, so test with various sizes. Rate limit video sends more strictly as they are bandwidth heavy.

### Send PTV (File Upload)

**Method:** `POST`
**Path:** `/message/sendPtv/{instance}`
**Headers:** `Content-Type: multipart/form-data`, `apikey: <instance-api-key>`

Upload a video file directly for sending, similar to **Send Media (File)** but dedicated to videos.

**Request:** Form-data with `number` and `file` fields (where `file` is the video to send).

**Response:** Message send confirmation (with message ID).

> **Proxy Note:** Ensure clients use the correct endpoint; if they attempt to send a video via the generic sendMedia file upload, it should also work by specifying mediatype, but having a dedicated endpoint may handle certain video-specific processing.

### Send Narrated Audio (Voice Message)

**Method:** `POST`
**Path:** `/message/sendWhatsAppAudio/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Send an audio file as a WhatsApp voice message. The audio can be provided via URL or base64. This is intended for sending `.ogg` voice notes or any audio file.

```yaml
# Request Body
number: "<recipient-number>"
audio: "<url-or-base64>"   # Link or base64 data for the audio file
# options:
delay: 1200
quoted: { ... }
mentionsEveryOne: false
mentioned: [ ... ]
encoding: true            # (Optional) If true, the server might re-encode audio to WhatsApp-compatible format
```

**Response:** Contains the message ID of the voice message and status.

> **Proxy Note:** This endpoint ensures the audio is sent in a format WhatsApp accepts as a voice note. If `encoding` is true, Evolution API might attempt to convert the audio (for example, MP3 to OGG). The proxy should allow some extra time for this processing. Monitoring events can confirm when the message is actually sent (via `SEND_MESSAGE` events).

### Send Status (Stories)

**Method:** `POST`
**Path:** `/message/sendStatus/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Post a Status (WhatsApp Story) on the connected WhatsApp account. You can post text status or media (image/video/audio) status.

```yaml
# Request Body
type: "<type>"          # "text", "image", "video", or "audio" – the type of status
content: "<content>"    # The text content for text status, or URL for media status
caption: "Caption..."   # (Optional) Caption for image or video status
backgroundColor: "#008000"  # (For text status) background color (hex)
font: 1                 # (For text status) font style index (1=SERIF, 2=NORICAN, 3=BRYNDAN_WRITE, 4=BEBASNEUE, 5=OSWALD):contentReference[oaicite:5]{index=5}
allContacts: false      # true to share with all contacts, false to share with specific
statusJidList:          # list of specific contact JIDs to share status with (if allContacts=false)
  - "{{remoteJid}}@s.whatsapp.net"
```

**Response:** A result indicating the status post was successful, possibly including an ID for the status.

> **Proxy Note:** This allows automation of posting statuses. The proxy could, for example, schedule status posts via this endpoint. If `allContacts` is true, it posts to everyone; otherwise only to specified contacts – the proxy might manage who should see statuses. Use-case: a business could broadcast announcements via status. Monitor via events like `MESSAGES_UPSERT` which might include status posts.

### Send Sticker

**Method:** `POST`
**Path:** `/message/sendSticker/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Send an image as a WhatsApp sticker. The image must be in a format and size supported by WhatsApp stickers (generally a small PNG, 512x512).

```yaml
# Request Body
number: "<recipient-number>"
sticker: "<url-or-base64>"   # URL or base64 of the image to send as sticker
# options (similar to others):
delay: 1200
quoted: { ... }
mentionsEveryOne: false
mentioned: [ ... ]
```

**Response:** Contains message ID of the sticker message.

> **Proxy Note:** The proxy might verify the image size/format (to ensure it's a valid sticker) before sending. This could also be rate-limited as stickers count as media messages.

### Send Location

**Method:** `POST`
**Path:** `/message/sendLocation/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Send a location pin (latitude/longitude with name/address).

```yaml
# Request Body
number: "<recipient-number>"
name: "Bora Bora"                        # Name of the location (title)
address: "French Polynesia"              # Address or descriptive text
latitude: -16.505538233564373            # Latitude coordinate
longitude: -151.7422770494996            # Longitude coordinate
# options:
delay: 1200
quoted: { ... }
mentionsEveryOne: false
mentioned: [ ... ]
```

**Response:** Message ID of the location message and status.

> **Proxy Note:** Useful for chatbots sending store locations, etc. The proxy likely doesn’t need special handling here beyond validating that latitude/longitude are present and numeric.

### Send Contact

**Method:** `POST`
**Path:** `/message/sendContact/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Send one or multiple contacts (vCard) to a user or group.

```yaml
# Request Body
number: "<recipient-number>"
contact:                      # An array of contacts to send
  - fullName: "Alice Smith" 
    wuid: "5511999999999"     # WhatsApp UID (phone number without formatting)
    phoneNumber: "+55 11 99999-9999"
    organization: "Company Name"    # Optional fields for vCard
    email: "alice@example.com"
    url: "https://example.com"
  - fullName: "Bob Jones"
    wuid: "5511888888888"
    phoneNumber: "+55 11 88888-8888"
    organization: "Company Name"
    email: "bob@example.com"
    url: "https://example.com"
# (You can include multiple contacts in one send)
```

**Response:** A status and possibly an array of message IDs if multiple contacts are sent (often combined into one message though).

> **Proxy Note:** Ensure the array of contacts is not empty. The proxy might merge multiple contacts into one message automatically (the API does accept an array as shown). This is convenient for transferring contact info. Minimal rate limiting since usually not high volume.

### Send Reaction

**Method:** `POST`
**Path:** `/message/sendReaction/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Send a reaction emoji to a specific message (a feature in WhatsApp that lets you react with an emoji instead of sending a separate message).

```yaml
# Request Body
key:                      # The key of the message to react to (must specify the message ID and chat)
  remoteJid: "{{remoteJid}}@s.whatsapp.net"   # JID of the message's chat (user or group)
  fromMe: true                             # Whether the original message was sent from us
  id: "BAE5A75CB0F39712"                   # The message ID to react to (as provided by WhatsApp events or findMessages)
reaction: "��"            # The emoji reaction to send
```

**Response:** Usually just a success/acknowledgement (no new message ID since it’s a metadata action).

> **Proxy Note:** The proxy can allow or block certain reaction emojis if needed (for example, filtering inappropriate reactions). Reactions are low-impact but should still be monitored via events (`MESSAGES_UPDATE` events may show reactions).

### Send Poll

**Method:** `POST`
**Path:** `/message/sendPoll/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Send a poll message with multiple options.

```yaml
# Request Body
number: "<recipient-number>"
name: "Main text of the poll"    # The question or prompt for the poll
selectableCount: 1              # How many options can be selected (e.g., 1 for single-choice poll)
values:                         # Array of poll options (strings)
  - "Option 1"
  - "Option 2"
  - "Option 3"
# options:
delay: 1200
quoted: { ... }
mentionsEveryOne: false
mentioned: [ ... ]
```

**Response:** Returns a message ID for the poll message and status. The poll results can be fetched via events or other API not covered here.

> **Proxy Note:** Polls are a newer WhatsApp feature. The proxy might use them for quick surveys. Ensure `selectableCount` is <= number of options. Monitor the poll votes via webhook events (`MESSAGES_UPDATE` events with poll updates, if provided by Evolution API).

### Send List

**Method:** `POST`
**Path:** `/message/sendList/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Send an interactive list message (a message with a menu of options, where each option is a row that the user can tap).

```yaml
# Request Body
number: "<recipient-number>"
title: "List Title"
description: "List description"
buttonText: "Click Here"         # The text on the list-opening button in WhatsApp UI
footerText: "Footer text\nhttps://examplelink.com"  # Footer message (can include a link as shown)
sections:                       # The list is divided into sections, each with a title and rows
  - title: "Section 1"
    rows:
      - title: "Option 1"
        description: "Description for option 1"
        rowId: "row1"           # ID returned when this option is selected
      - title: "Option 2"
        description: "Description for option 2"
        rowId: "row2"
  - title: "Section 2"
    rows:
      - title: "Option A"
        description: "Description for option A"
        rowId: "rowA"
      - title: "Option B"
        description: "Description for option B"
        rowId: "rowB"
# options:
delay: 1200
quoted: { ... }
mentionsEveryOne: false
mentioned: [ ... ]
```

**Response:** Returns a message ID for the list message. When the user selects an item, an event will be generated (the selection can be caught via webhook events with the `rowId` of the choice).

> **Proxy Note:** Interactive list messages are great for bots (like showing a menu). The proxy should ensure the structure (sections and rows) doesn’t exceed WhatsApp limits (currently max 10 rows per section, max 10 sections typically). Monitoring user selections requires the webhook or event integration – the proxy should listen for `MESSAGES_UPSERT` events that contain the **selected row ID** when a user responds.

### Send Buttons

**Method:** `POST`
**Path:** `/message/sendButton/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Send an interactive button message. You can include up to 3 reply buttons or a single button with other actions (like call or URL).

```yaml
# Request Body
number: "<recipient-number>"
title: "Title Button"               # Title text above the buttons (optional)
description: "Description Button"   # Message text content (body of the message)
footer: "Footer Button"             # Footer text (small text below buttons, optional)
buttons:                           # List of button objects (max 3 for quick reply buttons)
  - type: "reply" 
    displayText: "Yes"
    id: "btn_yes"                   # ID to identify which button was pressed
  - type: "reply"
    displayText: "No"
    id: "btn_no"
# Alternative button types (can only be one of these types per message):
# - type: "copy": a button that copies a code (for payments or reference)
#    displayText: "Copy Code"
#    copyCode: "ZXN0ZSB1bSBjw7NkaWdvIGRlIHRleHRvIGNvcGnDoXZlbC4="
# - type: "url": open a URL
#    displayText: "Visit Site"
#    url: "https://example.com"
# - type: "call": call a phone number when pressed
#    displayText: "Call Me"
#    phoneNumber: "+15551234567"
# - type: "pix": (Brazil-specific) share a PIX payment QR code
#    displayText: "Pay with PIX"
#    currency: "BRL"
#    name: "John Doe"
#    keyType: "random"   # or phone, email, cpf, cnpj
#    key: "<PIX-key-uuid>"
# You may combine one alternative action button with reply buttons if needed (depending on WhatsApp rules).
delay: 1200
quoted: { ... }
mentionsEveryOne: false
mentioned: [ ... ]
```

**Response:** Message ID of the buttons message. When a button is clicked by the recipient, a reply is sent back to the webhook with the button `id` or relevant payload.

> **Proxy Note:** Buttons are useful for quick replies. The proxy should track which buttons were sent (especially if they have meaningful IDs) to correlate responses. It should also ensure only allowed actions (for instance, maybe disallow `call` type if not needed). Use webhook events (`MESSAGES_UPSERT` or `BUTTON_REPLY`) to detect user clicks.

## Chat Management

These endpoints allow management of chats, messages, and contacts on the instance. The proxy can use these for backend tasks (like marking read) or expose them to clients for advanced control. They are grouped as "Chat" or "Chat Controller" features.

### Check WhatsApp Numbers

**Method:** `POST`
**Path:** `/chat/whatsappNumbers/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Check which of a list of phone numbers are registered on WhatsApp. This is useful for contact list filtering.

```yaml
# Request Body
numbers:
  - "55911111111"
  - "55922222222"
  - "55933333333"
  - "55944444444"
  - "55955555555"
```

**Response:** A list of results for each number, indicating whether it’s a valid WhatsApp user. For example:

```yaml
results:
  - number: "55911111111"
    whatsapp: true
    waUserJid: "55911111111@s.whatsapp.net"
  - number: "55922222222"
    whatsapp: false
  # ... for each input number
```

> **Proxy Note:** The proxy could cache these results to avoid repeated checks. For example, when a user uploads contacts, the proxy can call this to verify which contacts are on WhatsApp, and then store that info.

### Mark Messages As Read

**Method:** `POST`
**Path:** `/chat/markMessageAsRead/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Mark one or multiple messages as read (i.e., send the read receipt). This can mark messages in individual or group chats as seen by the user.

```yaml
# Request Body
readMessages:
  - remoteJid: "123@s.whatsapp.net"            # chat ID (user JID or group JID)
    fromMe: false                              # whether the message was sent by us
    id: "80C4CE9B72F797DBC6ECD8D19B247FC9"     # the message ID to mark as read
  - remoteJid: "123-456@g.us"
    fromMe: false
    id: "AAAAAAAAAAAAAAAA"
```

**Response:** A status (e.g., `{"updated": 2}` for two messages marked). After this, WhatsApp will show those messages as read (blue ticks) to the sender.

> **Proxy Note:** The proxy can use this for auto-read if `readMessages` setting is false but at some point wants to mark messages as read. Also, if integrating with a CRM, an agent reading the message via a dashboard might trigger this. Ensure the proxy only marks messages read when appropriate (to not break user expectations).

### Archive Chat

**Method:** `POST`
**Path:** `/chat/archiveChat/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Archive or unarchive a chat. Archiving a chat in WhatsApp hides it from the main list until a new message arrives (unless “keep chats archived” is enabled on phone).

```yaml
# Request Body
lastMessage:
  key:
    remoteJid: "123@s.whatsapp.net"
    fromMe: false
    id: "80C4CE9B72F797DBC6ECD8D19B247FC9"
chat: "123@s.whatsapp.net"   # The JID of the chat to (un)archive
archive: false              # false to unarchive, true to archive
```

**Response:** Success status (e.g., `{"archived": true}` or the updated archive state).

> **Proxy Note:** To archive a chat, the Evolution API requires reference to the last message (`lastMessage.key`). If the chat has no messages, this might fail. The proxy should catch errors (400 Bad Request if message not found). In a multi-device scenario, archiving on server might not sync to phone if phone is active, but for WhatsApp Web sessions it should. The proxy can expose an “archive” action in a UI that calls this.

### Mark Chat as Unread

**Method:** `POST`
**Path:** `/chat/markChatUnread/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Mark an entire chat as unread (the opposite of marking messages read – this will add the blue dot in WhatsApp UI as if new messages are unread).

```yaml
# Request Body
lastMessage:
  key:
    remoteJid: "123@s.whatsapp.net"
    fromMe: false
    id: "80C4CE9B72F797DBC6ECD8D19B247FC9"
chat: "123@s.whatsapp.net"   # JID of the chat to mark unread
```

**Response:** Success or error if not possible. (WhatsApp typically allows marking a chat unread for UI purposes; since Evolution API is headless, this just toggles a flag internally.)

> **Proxy Note:** This could be used if an agent wants to mark a conversation as pending/unread again for follow-up. The proxy could integrate this with a "mark as unread" button in a dashboard.

### Delete Message for Everyone

**Method:** `DELETE`
**Path:** `/chat/deleteMessageForEveryone/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Delete a message from the chat **for all participants** (this is the “Delete for everyone” feature, which must be done within WhatsApp’s allowed time window after sending).

```yaml
# Request Body
id: "<message-id>"                  # ID of the message to delete
remoteJid: "<chat-jid>"             # JID of the chat containing the message
fromMe: true                        # true if the message was sent by our instance (we can only delete our own messages for everyone)
participant: "<participant-jid>"    # (Optional) If in a group and the message is from another participant, their JID
```

**Response:** Success status if deletion is initiated. The message will be removed and replaced with “This message was deleted” in the chat for all who hadn’t seen it yet.

> **Proxy Note:** The proxy should only allow this for messages that the instance user actually sent (`fromMe:true`). Possibly also enforce WhatsApp’s time limit (around 1 hour after sending) by checking the timestamp if available – though the Evolution API likely handles that and will return an error if too late. This is a sensitive action; consider logging these events via the monitoring system.

### Fetch Profile Picture URL

**Method:** `POST`
**Path:** `/chat/fetchProfilePictureUrl/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Get the URL of the profile picture of a WhatsApp contact. This fetches the avatar image link for the given number (contact or group).

```yaml
# Request Body
number: "<contact-number>"   # phone number of the contact (or group ID in some cases) to fetch picture for
```

**Response:** Returns the URL of the profile picture if available, or a default/empty if the contact has no profile photo or privacy disallows it. For example:

```yaml
profilePicture: "https://pps.whatsapp.net/v/t61.24694-24/...</path>?oe=...,oh=..."
```

This URL can be used to download the image. It might be a WhatsApp CDN link that requires being logged in to WhatsApp (Evolution API likely handles the auth).

> **Proxy Note:** Use this to display contact avatars in a UI. The proxy might call this whenever a new contact is added or periodically to update avatars. The returned URL may expire, so it’s best to fetch and cache the image. Also note privacy settings: if our instance is not allowed to see someone’s profile photo, the API might return an error or a generic image.

### Get Base64 From Media Message

**Method:** `POST`
**Path:** `/chat/getBase64FromMediaMessage/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Download a media message from WhatsApp and get its content as a Base64 string. This is used to retrieve images, videos, audio, or documents that were received.

**Important:** The message must exist in the instance’s message store (either in the database or as a cached file).

```yaml
# Request Body
message:
  key:
    id: "<message-id>"   # ID of the media message to fetch (unique message ID)
    # (You can also provide the full message payload with 'message' field instead of just key)
convertToMp4: false      # If true and the media is audio (OGG opus), attempt to convert to MP4 format (useful for some clients).
```

**Response:** Returns the file content in Base64 encoding along with metadata:

```yaml
mimetype: "image/jpeg"
data: "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4M..."   # (very long base64 string)
```

If the media was not found or not downloadable, a 400 error is returned.

> **Proxy Note:** This is how the proxy can obtain media files that were sent to the WhatsApp instance (images, voice notes, etc.) for processing or storage. For example, if a user sends a photo and the proxy needs to forward it to another service, call this to get the content. Be mindful of large base64 size; consider using RabbitMQ/SQS or direct file writing for heavy media instead of funneling through the API if possible. The `convertToMp4` option can help unify audio format.

### Update Message (Edit)

**Method:** `POST`
**Path:** `/chat/updateMessage/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Edit a message that was sent by our instance (a new WhatsApp feature allowing message edits within 15 minutes of sending).

```yaml
# Request Body
number: "<recipient-number>"
key:
  remoteJid: "123@s.whatsapp.net"
  fromMe: true
  id: "3EB04DC69D97835D7CC6F12776D25766FBC224E2"   # ID of the message to edit (must be fromMe:true and recent)
text: "new message"   # The updated text content for the message
```

**Response:** Success if the edit was applied. The message in the chat will update to the new text (with an "edited" label on WhatsApp UI).

> **Proxy Note:** Only messages sent by our instance can be edited, and only for a short window (approx 15 mins) after sending. The proxy might allow a client UI to edit a sent message (e.g., fix a typo). The proxy should handle failures (if time elapsed or message not found) gracefully. Monitor via events: an edited message might show up as a `MESSAGES_UPDATE` event.

### Send Presence (Typing/Recording)

**Method:** `POST`
**Path:** `/chat/sendPresence/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Indicate typing or recording status to a chat. This makes the instance show as "typing..." or "recording audio..." on the other person's WhatsApp screen.

```yaml
# Request Body
number: "<recipient-number or group-id>"
delay: 1200            # duration in milliseconds to show the action (optional)
presence: "composing"  # or "recording" or "paused"
```

Valid `presence` values include:

* `"composing"` – show as typing a message
* `"recording"` – show as recording a voice note
* `"paused"` – stop showing any action (e.g., after finishing typing)

**Response:** A success acknowledgment. The effect on WhatsApp is transient and not a message.

> **Proxy Note:** If the proxy is relaying user input (like from a chatbot or human agent), it can use this to show the user that the bot/agent is "typing" a response. For example, when the LLM is formulating an answer, send `composing` status. Use the `delay` to keep it on; you may need to call it periodically or with a certain delay until the message is ready to send, then call with `paused` or simply send the message.

### Update Block Status

**Method:** `POST`
**Path:** `/message/updateBlockStatus/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Block or unblock a contact on WhatsApp. **Note:** This endpoint resides under the `/message` path in the API, but logically it is a chat/contact action.

```yaml
# Request Body
number: "<contact-number>"
status: "block"   # either "block" to block the contact, or "unblock" to remove them from block list
```

**Response:** Confirmation of the action, e.g. `{"blocked": true}` or the new block status.

> **Proxy Note:** The proxy might expose a "Block user" function if building a client interface. It should ensure users don’t accidentally block important contacts. Also, consider logging these actions as they affect who can message the instance. Unblocking likewise should be controlled.

### Find Contacts

**Method:** `POST`
**Path:** `/chat/findContacts/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Retrieve contacts from the instance’s contact list (WhatsApp contacts the user has). This can list all contacts or filter by certain criteria.

```yaml
# Request Body (all fields optional)
where:
  id: "{{remoteJid}}"   # (Optional) Specify a particular contact JID to find
# If 'where' is empty or not provided, it will return all contacts.
```

**Response:** List of contacts (or a specific contact if filtered). Each contact may have fields like `id` (JID), `name` (profile name), `notify` (short name), etc. Example:

```yaml
contacts:
  - id: "123@s.whatsapp.net"
    name: "Alice"
    notify: "Alice S."
    verifiedName: null
    status: "Hey there! I am using WhatsApp."
  - id: "555123456789@s.whatsapp.net"
    name: "Bob"
    notify: "Bob"
    verifiedName: "Bob from Company"   # e.g., if it's a WhatsApp Business verified name
    status: "Available"
```

> **Proxy Note:** This essentially reads the phone’s contact list as known to WhatsApp. The proxy can use this to display contacts in a UI or to sync with an external address book. Keep in mind privacy: contacts appear here typically after the instance has interacted with them or if they are in the phone’s contacts (for WhatsApp Business API, contacts might need explicit addition).

### Find Messages

**Method:** `POST`
**Path:** `/chat/findMessages/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Query the stored message history on the server. You can filter by chat and paginate.

```yaml
# Request Body (all fields optional, but usually you'll filter by remoteJid)
where:
  key:
    remoteJid: "{{remoteJid}}@s.whatsapp.net"   # Filter messages in this chat (user or group)
# Other optional filters under 'where' could include:
#   key.id: specific message ID
#   message.conversation: message text contains something (if using text search, not sure if supported)
#   status: message status etc.
page: 1      # (Optional) Page number for pagination
offset: 10   # (Optional) Number of messages per page (like page size)
```

**Response:** A list of message objects that match the query. Example (simplified):

```yaml
messages:
  - key:
      remoteJid: "123@s.whatsapp.net"
      fromMe: false
      id: "ABCDE12345..."
    message:
      conversation: "Hello"
    timestamp: "1694000000"
    status: "READ"
  - key:
      remoteJid: "123@s.whatsapp.net"
      fromMe: true
      id: "FGHIJ67890..."
    message:
      conversation: "Hi, how are you?"
    timestamp: "1694000050"
    status: "DELIVERED"
# ... up to 'offset' messages
```

If `mongodb` is disabled in the Evolution API, only messages currently in memory or in a file are searchable; historical messages might not be stored (the comment in the Postman collection notes that when no DB, only key.id filtering works).

> **Proxy Note:** This is powerful for implementing chat history in a client or for analytics. The proxy should secure this endpoint – possibly not exposing it directly to end users unless they have proper authentication, since it can retrieve content of messages. Also, if using pagination, the proxy might need to iterate until no more messages to get full history. In a monitoring scenario, this could be used to pull transcripts for compliance checks.

### Find Status Message

**Method:** `POST`
**Path:** `/chat/findStatusMessage/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Query the statuses (stories) that the instance user has posted or seen. This is less common, but can retrieve specific status messages by ID or contact.

```yaml
# Request Body (all optional)
where:
  remoteJid: "123@s.whatsapp.net"   # The contact whose status messages we are querying (their JID for statuses)
  id: "BAE5959535174C7E"            # A specific status message ID to find (if known)
page: 1
offset: 10
```

**Response:** List of status messages (either posted by the instance or by contacts, depending on what is stored). Each entry could include the media or text content, timestamp, etc.

Example:

```yaml
statusMessages:
  - id: "BAE5959535174C7E"
    from: "123@s.whatsapp.net"
    timestamp: 1694010000
    mediaType: "image"
    content: "<base64-image-data>"   # Possibly base64 if stored, or a path
    seen: true
```

(The exact structure depends on how Evolution API stores status views. This is a niche endpoint.)

> **Proxy Note:** Use-case might be to retrieve the instance’s own posted statuses or to see which statuses of others the instance has. Most proxies may not need to use this often. If implementing a full client, it could fetch statuses to display in a UI.

### Find Chats

**Method:** `POST`
**Path:** `/chat/findChats/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

List the chats (conversations) for the instance, optionally filtering. Without filters, it lists all chat threads.

```yaml
# Request Body
# (No fields required to list all chats; you could potentially filter by unread status or name if supported)
```

**Response:** Array of chat objects. Each chat object may contain: chat JID, chat name (for groups, or contact name), whether it’s read, last message time, etc. Example:

```yaml
chats:
  - id: "123@s.whatsapp.net"
    name: "Alice"
    unreadCount: 0
    lastMessage:
      id: "ABC123..."
      timestamp: 1694001000
      message: "See you soon"
      fromMe: false
  - id: "123-456@g.us"
    name: "Family Group"
    unreadCount: 5
    lastMessage:
      id: "XYZ789..."
      timestamp: 1694100000
      message: "Image"
      fromMe: false
```

> **Proxy Note:** This is akin to the chat list on a phone. The proxy can use this to display all conversations and summary info. It should be called sparingly or cached, as listing all chats frequently could be heavy. Better to rely on events (like `CHATS_SET` and `CHATS_UPDATE` events) to maintain an updated list client-side. The proxy could also implement push updates to clients when new chats or messages arrive, rather than polling this endpoint repeatedly.

## Label Management

WhatsApp allows labeling chats (commonly in WhatsApp Business). The Evolution API exposes label retrieval and assignment.

### Find Labels

**Method:** `GET`
**Path:** `/label/findLabels/{instance}`
**Headers:** `apikey: <instance-api-key>`

Fetch all labels defined in the instance (labels are typically user-defined tags for chats in WhatsApp).

**Response:** List of labels with their metadata:

```yaml
labels:
  - id: "1" 
    name: "New Customer" 
    color: "#FF0000"
  - id: "2"
    name: "VIP"
    color: "#0000FF"
```

Each label has an `id` (likely numeric or string), a `name`, and possibly a `color` code assigned.

> **Proxy Note:** The proxy can use this to present available labels in a UI, or to decide how to tag conversations.

### Handle Label (Add/Remove)

**Method:** `POST`
**Path:** `/label/handleLabel/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Assign or remove a label to/from a particular chat (contact or group).

```yaml
# Request Body
number: "<contact-or-group-number>"   # The WhatsApp number (or group ID) of the chat to label
labelId: "<label-id>"                # The ID of the label (from Find Labels)
action: "add"                        # Action to perform: "add" to apply the label, or "remove" to remove it
```

**Response:** Confirmation, e.g., `{"labeled": true}` or the updated label list for that chat.

> **Proxy Note:** If using WhatsApp Business features, labeling chats can integrate with CRM workflows. The proxy can automatically label certain chats (e.g., mark a chat as "VIP" if certain criteria met). It should ensure the labelId is valid and the chat exists. Monitor via events: label changes might emit `LABELS_EDIT` or `LABELS_ASSOCIATION` events.

## Profile Settings

These endpoints manage the profile of the WhatsApp account (for personal accounts) or business profile for WhatsApp Business. This includes profile name, status, picture, and privacy settings. The proxy might use these during instance setup or allow users to tweak their profile via an interface.

### Fetch Business Profile

**Method:** `POST`
**Path:** `/chat/fetchBusinessProfile/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Retrieve the WhatsApp Business profile info of a given contact. (If our instance is a business, this might fetch our profile by our number; if we provide someone else’s number, it fetches their business profile.)

```yaml
# Request Body
number: "<contact-number>"
```

**Response:** Business profile details if available, e.g.:

```yaml
businessProfile:
  wid: "12345678912@c.us"
  businessName: "ACME Corp"
  description: "Leading provider of widgets"
  email: "support@acme.com"
  website: "https://acme.com"
  categories: ["Retail", "E-commerce"]
  profilePictureUrl: "https://.../profile.jpg"
```

If the number is not a business account, result may be empty or an error.

> **Proxy Note:** Useful if the instance interacts with known businesses and we want to display their info (like verified name, category). For the proxy’s own instance (if business), this might not be the correct endpoint to get *our* profile – that might be a separate call. Usually, this is for viewing others. Ensure to handle case where profile is not public.

### Fetch Profile

**Method:** `POST`
**Path:** `/chat/fetchProfile/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Fetch the basic profile info of a WhatsApp user (non-business). This often includes just their “about” text (status message).

```yaml
# Request Body
number: "<contact-number>"
```

**Response:** Profile info such as:

```yaml
profile:
  status: "Hey there! I am using WhatsApp."   # The text status (about)
  name: "John Doe"                            # Their push name as saved or provided
```

If the contact’s privacy settings disallow status viewing, `status` might be empty or an error returned.

> **Proxy Note:** Use this to retrieve a contact’s about/status text if needed in a UI. This is typically low priority in an integration, but can enrich contact info.

### Update Profile Name

**Method:** `POST`
**Path:** `/chat/updateProfileName/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Change the profile name of our WhatsApp account (this is the name that appears in other users’ contact lists or notifications).

```yaml
# Request Body
name: "New Profile Name"
```

**Response:** Success if the name was changed (no content or updated name echoed).

> **Proxy Note:** The proxy could allow a user to set their display name when setting up the instance. Good to do once at creation. Monitor: a `CONTACTS_UPDATE` event might fire for our own contact info change.

### Update Profile Status

**Method:** `POST`
**Path:** `/chat/updateProfileStatus/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Update the “About” status text of our WhatsApp account.

```yaml
# Request Body
status: "Unavailable for calls"
```

**Response:** Success (no content or a confirmation message).

> **Proxy Note:** Like profile name, this can be set via proxy UI. Perhaps reflect certain states (e.g., “Out of Office”). Not to be confused with online/offline presence – this is the static text status.

### Update Profile Picture

**Method:** `POST`
**Path:** `/chat/updateProfilePicture/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Set or change the WhatsApp account’s profile picture. Provide a URL to an image (or possibly base64).

```yaml
# Request Body
picture: "<url-to-new-profile-image>"
```

**Response:** Success if updated. After this, the profile picture of the account is changed for everyone who can see it.

> **Proxy Note:** The proxy might let users upload an image which the proxy then hosts or converts to base64 and calls this. Ensure the image is square and reasonable size (WhatsApp profile pictures are typically cropped to a circle). A `CONTACTS_UPDATE` (for our own contact) or `PROFILE_PIC_CHANGE` event might occur.

### Remove Profile Picture

**Method:** `DELETE`
**Path:** `/chat/removeProfilePicture/{instance}`
**Headers:** `apikey: <instance-api-key>`

Remove the current profile picture (revert to no picture).

**Response:** Success if removed.

> **Proxy Note:** This will make the profile photo blank (everyone will see the gray silhouette). Use carefully.

### Fetch Privacy Settings

**Method:** `GET`
**Path:** `/chat/fetchPrivacySettings/{instance}`
**Headers:** `apikey: <instance-api-key>`

Retrieve the account’s privacy settings (who can see last seen, profile photo, status, etc.).

**Response:** An object with privacy settings:

```yaml
privacy:
  readreceipts: "all"       # Who can send read receipts: "all" or "none"
  profile: "all"            # Who can see profile photo: "all", "contacts", "contact_blacklist", or "none"
  status: "contacts"        # Who can see status posts: "all", "contacts", "contact_blacklist", or "none"
  last: "contacts"          # Who can see last seen: "all", "contacts", "contact_blacklist", or "none"
  online: "all"             # Who can see if you're online: "all" or "match_last_seen"
  groupadd: "none"          # Who can add you to groups: "all", "contacts", or "contact_blacklist"
```

These correspond to WhatsApp privacy options.

> **Proxy Note:** Likely used to display current privacy settings in a UI or to audit them. If the proxy’s user base requires certain privacy (for example, always hide last seen), the proxy could check these and alert or enforce via next endpoint.

### Update Privacy Settings

**Method:** `POST`
**Path:** `/chat/updatePrivacySettings/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Change the account’s privacy settings. Provide the fields to change; unspecified fields remain unchanged.

```yaml
# Request Body (all fields optional; set as needed)
readreceipts: "all"        # "all" to send read receipts, "none" to disable (others won't get blue ticks)
profile: "contacts"        # Who can see profile photo
status: "contacts"         # Who can see status posts
last: "none"               # Who can see last seen timestamp
online: "match_last_seen"  # If set to "match_last_seen", only people who see last seen see online status
groupadd: "contacts"       # Who can add you to group chats
```

**Response:** Success (the new settings may or may not be echoed).

> **Proxy Note:** If the proxy is used for business accounts, certain privacy settings might be recommended (e.g., readreceipts = all for businesses to know message status). The proxy could set defaults via this after instance creation. Changes here should be rare; each change might trigger a `CONNECTION_UPDATE` or similar event about privacy (or none, since it’s a setting not widely broadcast).

## Group Management

Manage WhatsApp groups: creating groups, updating group info, invites, and participants. The proxy might enable clients to programmatically create and control groups (common in business scenarios to create support or marketing groups on the fly). Monitoring group events (joins, leaves, etc.) is crucial – those come via events like `GROUPS_UPSERT`, `GROUP_UPDATE`, `GROUP_PARTICIPANTS_UPDATE`.

**Note:** All group-related endpoints require the instance user to be an admin of the target group (for updates) or at least a participant (for querying).

### Create Group

**Method:** `POST`
**Path:** `/group/create/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Create a new WhatsApp group chat and add initial participants.

```yaml
# Request Body
subject: "Test Group 02"         # The group name/title
description: "optional"          # (Optional) Group description
participants:                    # List of participant phone numbers to add (must include at least one other number)
  - "5531900000000"
  - "5531988888888"
```

**Response:** If successful, returns the new group’s ID (JID) and details:

```yaml
groupJid: "5531900000000-1623456789@g.us"   # The WhatsApp group JID
subject: "Test Group 02"
participantsAdded:
  - "5531900000000@s.whatsapp.net"
  - "5531988888888@s.whatsapp.net"
```

The instance user is automatically the admin/creator.

> **Proxy Note:** Group creation can be restricted by WhatsApp if done too frequently. The proxy should limit how often a user can create groups. Also, adding participants requires them to be in contacts or not blocked. Monitor `GROUPS_UPSERT` events which should show the new group details on creation. The proxy might store the group JID for future operations.

### Update Group Picture

**Method:** `POST`
**Path:** `/group/updateGroupPicture/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Change the group’s profile picture. Requires admin privileges in the group.

* **Query Param:** `groupJid` – *required*, the target group’s JID.

```yaml
# Request Body
image: "<url-or-base64-of-new-picture>"
```

**Response:** Success if updated (no content or a simple acknowledgment).

> **Proxy Note:** Similar to profile picture update, ensure the image meets requirements. The proxy might call this after creating a group to set an icon. There's usually an event like `GROUP_UPDATE` indicating group picture change that may be broadcast to participants.

### Update Group Subject (Name)

**Method:** `POST`
**Path:** `/group/updateGroupSubject/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Change the group’s name/title. Admin only.

* **Query Param:** `groupJid` – the group’s JID.

```yaml
# Request Body
subject: "Group Name or Subject"
```

**Response:** Success (the new subject may be returned).

> **Proxy Note:** WhatsApp rate-limits frequent subject changes. Use sparingly. A `GROUP_UPDATE` event will notify of the new subject to all group participants.

### Update Group Description

**Method:** `POST`
**Path:** `/group/updateGroupDescription/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Set or change the group’s description (the text that appears in “Group info”). Admin only.

* **Query Param:** `groupJid` – the group’s JID.

```yaml
# Request Body
description: "Group Description or Rules"
```

**Response:** Success status.

> **Proxy Note:** Group descriptions can be long; keep under WhatsApp’s limit (about 500 chars). Changing description triggers a system message in chat “<user> changed the group description”. The proxy might want to capture that via events if needed.

### Fetch Invite Code

**Method:** `GET`
**Path:** `/group/inviteCode/{instance}`
**Headers:** `apikey: <instance-api-key>`

Get the invite link (code) for the group. Must be admin to retrieve.

* **Query Param:** `groupJid` – the group’s JID.

**Response:** The invite code or full invite link:

```yaml
inviteCode: "AbCdEfGhIjk123456" 
inviteUrl: "https://chat.whatsapp.com/AbCdEfGhIjk123456"
```

> **Proxy Note:** This allows the proxy to share group invite links programmatically. For example, after creating a group, you might fetch the invite link and send it to others via message or display it. Ensure not to expose the link publicly if it’s a private group.

### Revoke Invite Code

**Method:** `POST`
**Path:** `/group/revokeInviteCode/{instance}`
**Headers:** `apikey: <instance-api-key>`

Invalidate the current invite link and generate a new one. Admin only.

* **Query Param:** `groupJid` – the group’s JID.

**Response:** Returns the new invite code/link similar to *Fetch Invite Code*.

> **Proxy Note:** If a link was leaked or an unwanted person has it, revoking will stop new joins from that link. The proxy might call this on user request or automatically if suspicious activity (like too many joins) is detected.

### Send Group Invite (Add via Invite Link)

**Method:** `POST`
**Path:** `/group/sendInvite/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Privately send a group invite link to specified phone numbers via WhatsApp message. Essentially, it crafts a message with the group’s invite.

```yaml
# Request Body
groupJid: "<group-id>"          # Group to invite people to
description: "Access this link to join my WhatsApp group:"   # A message that accompanies the link
numbers:
  - "559999999999"             # Phone numbers to send the invite link to
  - "551111111111"
```

**Response:** Likely returns message IDs for the invite message(s) sent to those numbers.

> **Proxy Note:** This is a way to proactively invite users: the instance sends each a direct message with the group link. Use carefully to avoid looking like spam. The proxy should perhaps throttle the number of invites sent. If integrated with a CRM, you might use this to invite specific users to a group chat.

### Find Group by Invite Code

**Method:** `GET`
**Path:** `/group/inviteInfo/{instance}`
**Headers:** `apikey: <instance-api-key>`

Check the group details associated with an invite code (does not join, just peek info).

* **Query Param:** `inviteCode` – the group invite code.

**Response:** Information about the group that the invite link corresponds to, e.g.:

```yaml
group:
  groupJid: "123456789@g.us"
  subject: "Group Name"
  creator: "552199999999@s.whatsapp.net"
  creationTime: 1690000000
  size: 25              # current number of participants
  participantsCount: 25
```

If code is invalid or revoked, likely an error or empty result.

> **Proxy Note:** Before distributing an invite code, the proxy could verify it (or show info in UI). Also, if a user inputs an invite link to join, the proxy could fetch info to confirm this is the intended group before proceeding to join.

### Find Group by JID

**Method:** `GET`
**Path:** `/group/findGroupInfos/{instance}`
**Headers:** `apikey: <instance-api-key>`

Get detailed information about a group by its JID.

* **Query Param:** `groupJid` – the group’s JID.

**Response:** Similar structure to inviteInfo, but likely more detail since we’re presumably a member/admin of the group. It may include the full participant list and their roles.

```yaml
group:
  groupJid: "123456789@g.us"
  subject: "Group Name"
  description: "Group Description"
  participants:
    - id: "552199999999@s.whatsapp.net"
      isAdmin: true
      isSuperAdmin: true
    - id: "551199999998@s.whatsapp.net"
      isAdmin: false
      isSuperAdmin: false
  size: 2
  creationTime: 1680000000
  creator: "552199999999@s.whatsapp.net"
```

> **Proxy Note:** This can be used to refresh group info (like after changes). If the proxy maintains an internal database of groups, calling this ensures you have the latest membership list. Keep in mind large groups can have hundreds of members, so avoid frequent polling; rely on `GROUP_PARTICIPANTS_UPDATE` events to track changes in membership in real-time.

### Fetch All Groups

**Method:** `GET`
**Path:** `/group/fetchAllGroups/{instance}`
**Headers:** `apikey: <instance-api-key>`

Get a list of all group chats the instance is currently in. Optionally include participant details.

* **Query Param:** `getParticipants` – if `"true"`, include the full list of participants for each group; if `"false"` (default), just list group IDs and names.

**Response:** An array of group info (similar to findGroupInfos but potentially summarized). Example when `getParticipants=false`:

```yaml
groups:
  - groupJid: "552199999999-1600000000@g.us"
    subject: "Group 1"
    size: 10
  - groupJid: "551188888888-1700000000@g.us"
    subject: "Group 2"
    size: 23
```

If `getParticipants=true`, each entry also contains a `participants` list with each member’s JID and admin status.

> **Proxy Note:** Useful to display all groups on a dashboard. However, if an instance is in many groups, this could be heavy. The proxy should maybe call this at login and then maintain state with events. The `getParticipants` flag should be used judiciously (only when needed, since it significantly increases payload size).

### Find Group Members

**Method:** `GET`
**Path:** `/group/participants/{instance}`
**Headers:** `apikey: <instance-api-key>`

Fetch the list of participants of a specific group.

* **Query Param:** `groupJid` – the group’s JID.

**Response:** The participants list (similar to what's returned inside findGroupInfos if that included participants):

```yaml
participants:
  - id: "552199999999@s.whatsapp.net"
    isAdmin: true
    isSuperAdmin: true
  - id: "551199999998@s.whatsapp.net"
    isAdmin: false
    isSuperAdmin: false
  # ... all members
```

> **Proxy Note:** This is essentially **Find Group Members**. Use it to get the latest membership if needed. The proxy should track admin roles if it plans to use the updateParticipant endpoint next.

### Update Group Members (Add/Remove/Promote/Demote)

**Method:** `POST`
**Path:** `/group/updateParticipant/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Add or remove participants, or change their admin status. Admin only.

* **Query Param:** `groupJid` – the group’s JID.

```yaml
# Request Body
action: "add"        # Action to perform:
                     # "add" – add new members
                     # "remove" – remove members
                     # "promote" – make members admins
                     # "demote" – remove admin rights
participants:
  - "5531900000000"   # Phone numbers of participants to affect (international format, no @s.whatsapp.net needed here)
  - "5531911111111"
  - "5531922222222"
```

**Response:** Outcome for each number (success or failure). For example:

```yaml
added: 
  - "5531900000000@s.whatsapp.net"
failed:
  - "5531922222222@s.whatsapp.net"   # (if one of the adds failed, say due to privacy settings)
```

For remove, it might list removed vs not in group, etc. Promote/demote likely just success booleans.

> **Proxy Note:** This is critical for group management automation. The proxy can automate adding users to support groups, or removing users who left a subscription, etc. It should ensure the instance is admin. If adding many users, be cautious—WhatsApp might temporarily block the ability to add if done in rapid succession. Spread out adds if possible. Monitor via `GROUP_PARTICIPANTS_UPDATE` events which will indicate members added or removed.

### Update Group Setting (Admins-Only Permissions)

**Method:** `POST`
**Path:** `/group/updateSetting/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Control group settings like who can send messages or edit info. Admin only.

* **Query Param:** `groupJid` – the group’s JID.

```yaml
# Request Body
action: "not_announcement"
# Allowed actions:
# "announcement" – set group to admins-only can send messages (others read-only)
# "not_announcement" – allow all members to send messages
# "locked" – only admins can edit group info (name, picture, description)
# "unlocked" – all members can edit info
```

**Response:** Success if setting changed.

> **Proxy Note:** This corresponds to WhatsApp group settings toggles (“Only admins can send messages” and “Only admins can edit group info”). Use to enforce rules (e.g., a broadcast group should be announcement-only). The proxy could automatically set new groups to announcement mode if they are meant for one-way communication. Changes generate a system message in the group (like “Group settings changed to allow all participants to send messages”), which should be caught by events for record.

### Toggle Ephemeral (Disappearing Messages Timer)

**Method:** `POST`
**Path:** `/group/toggleEphemeral/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Set the disappearing messages timer for a group or individual chat. Admin only for groups.

* **Query Param:** `groupJid` – the group’s JID (for group) or could potentially work with a 1-1 chat JID.

```yaml
# Request Body
expiration: 0    # Duration for disappearing messages:
                 # 0 = Off (disappearing messages disabled)
                 # 86400 = 24 hours
                 # 604800 = 7 days
                 # 7776000 = 90 days
```

**Response:** Success if updated. WhatsApp will show a system message “Disappearing messages set to X”.

> **Proxy Note:** Some organizations might want ephemeral chats (for privacy). The proxy can allow toggling this. It should be cautious: turning it on means messages will vanish after the set period – which could interfere with record-keeping. If the proxy or backend DB is storing messages, ephemeral mode might conflict with retention policies.

### Leave Group

**Method:** `DELETE`
**Path:** `/group/leaveGroup/{instance}`
**Headers:** `apikey: <instance-api-key>`

Leave (exit) the group chat for the instance user. If the user is the only admin, it’s recommended to promote someone else before leaving to avoid a group with no admin.

* **Query Param:** `groupJid` – the group’s JID.

**Response:** Success if left. After this, the instance will no longer receive messages from that group (and that group will be removed from chat list).

> **Proxy Note:** The proxy can trigger this if, say, a user wants to dissolve their connection to a group via the app. If the instance was the creator, leaving doesn’t delete the group; it just leaves it empty or with remaining members. The proxy might warn users accordingly. Monitor via events (`GROUP_PARTICIPANTS_UPDATE` showing our user left, and `CHATS_DELETE` removing the chat from list).

## Integrations and Event Subscriptions

Evolution API supports various integrations to stream events and integrate with external bots or systems. This is crucial for the proxy’s **monitoring** capability. By enabling events via WebSocket, Webhook, RabbitMQ, SQS, etc., the proxy can receive real-time updates on messages, contacts, and connection status.

Below, **Events** refers to the categories of updates (e.g., new messages, message delivered, contacts updated, etc.). Common event types include (non-exhaustive list):

* `APPLICATION_STARTUP` – the instance has started
* `QRCODE_UPDATED` – a new QR code (for login) is available
* `MESSAGES_SET`, `MESSAGES_UPSERT`, `MESSAGES_UPDATE`, `MESSAGES_DELETE` – various message events (initial sync, new incoming, message edited, message deleted)
* `SEND_MESSAGE` – when an outgoing send is performed (possibly an acknowledgment event)
* `CONTACTS_SET`, `CONTACTS_UPSERT`, `CONTACTS_UPDATE` – contact sync or updates
* `PRESENCE_UPDATE` – a contact’s presence (online/offline) changed
* `CHATS_SET`, `CHATS_UPSERT`, `CHATS_UPDATE`, `CHATS_DELETE` – chat list events
* `GROUPS_UPSERT`, `GROUP_UPDATE`, `GROUP_PARTICIPANTS_UPDATE` – group events (creation/update, participants join/leave/promote)
* `LABELS_EDIT`, `LABELS_ASSOCIATION` – label created/edited, label assigned to chat
* `CALL` – incoming call events
* `TYPEBOT_START`, `TYPEBOT_CHANGE_STATUS` – events related to Typebot integration (see Typebot section)
* etc.

You can select which events to subscribe to for each integration, or choose to get all events.

### WebSocket Integration

The Evolution API can open a persistent WebSocket connection to stream events to the client. Use this if the proxy wants to receive all events in real-time without polling or managing queue services. The Zapin proxy could connect to this WebSocket to gather events for all instances or one per instance.

#### Set WebSocket

**Method:** `POST`
**Path:** `/websocket/set/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Enable and configure the WebSocket event stream for an instance.

```yaml
# Request Body
websocket:
  enabled: true
  events:              # List of events to receive. If not provided or empty, likely all events are sent.
    - "APPLICATION_STARTUP"
    - "QRCODE_UPDATED"
    - "MESSAGES_SET"
    - "MESSAGES_UPSERT"
    - "MESSAGES_UPDATE"
    - "MESSAGES_DELETE"
    - "SEND_MESSAGE"
    - "CONTACTS_SET"
    - "CONTACTS_UPSERT"
    - "CONTACTS_UPDATE"
    - "PRESENCE_UPDATE"
    - "CHATS_SET"
    - "CHATS_UPSERT"
    - "CHATS_UPDATE"
    - "CHATS_DELETE"
    - "GROUPS_UPSERT"
    - "GROUP_UPDATE"
    - "GROUP_PARTICIPANTS_UPDATE"
    - "CONNECTION_UPDATE"
    - "LABELS_EDIT"
    - "LABELS_ASSOCIATION"
    - "CALL"
    - "TYPEBOT_START"
    - "TYPEBOT_CHANGE_STATUS"
```

**Response:** Success means the instance will start a WebSocket server (or client connection). Typically, the Evolution API might act as a WebSocket server you can connect to. It might provide a URL like `wss://.../instance/<id>/events` – the exact connection method would be described in Evolution API docs (not shown in Postman, but by enabling, likely the API is ready to stream).

> **Proxy Note:** Using WebSocket, the proxy (or the client application) can subscribe to events without using webhook/queue infrastructure. For Zapin, a design might be: each instance’s events come to the proxy over WS, the proxy consolidates or forwards them to appropriate user sessions. Ensure to handle reconnection and authentication on the WebSocket. Only use either WebSocket or Webhook/RabbitMQ/SQS at a time to avoid duplicate processing (though it’s possible to enable multiple).

#### Find WebSocket

**Method:** `GET`
**Path:** `/websocket/find/{instance}`
**Headers:** `apikey: <instance-api-key>`

Check the current WebSocket configuration/status for the instance.

**Response:** The stored configuration, e.g.:

```yaml
websocket:
  enabled: true
  events:
    - "APPLICATION_STARTUP"
    - "QRCODE_UPDATED"
    # ... (list of events enabled)
```

> **Proxy Note:** Use this to verify if WebSocket streaming is on. If a client complains about not receiving live updates, the proxy could call this to ensure `enabled` is true.

### RabbitMQ Integration

Evolution API can publish events to a RabbitMQ exchange, which is useful for scalable, durable processing of events. The proxy can consume from RabbitMQ to monitor activities.

#### Set RabbitMQ

**Method:** `POST`
**Path:** `/rabbitmq/set/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Enable RabbitMQ event publishing for the instance. **Precondition:** The Evolution API server must be configured with RabbitMQ connection details (likely via environment variables).

```yaml
# Request Body
rabbitmq:
  enabled: true
  events:
    - "APPLICATION_STARTUP"
    - "QRCODE_UPDATED"
    - "MESSAGES_SET"
    - "MESSAGES_UPSERT"
    - "MESSAGES_UPDATE"
    - "MESSAGES_DELETE"
    - "SEND_MESSAGE"
    - "CONTACTS_SET"
    - "CONTACTS_UPSERT"
    - "CONTACTS_UPDATE"
    - "PRESENCE_UPDATE"
    - "CHATS_SET"
    - "CHATS_UPSERT"
    - "CHATS_UPDATE"
    - "CHATS_DELETE"
    - "GROUPS_UPSERT"
    - "GROUP_UPDATE"
    - "GROUP_PARTICIPANTS_UPDATE"
    - "CONNECTION_UPDATE"
    - "LABELS_EDIT"
    - "LABELS_ASSOCIATION"
    - "CALL"
    - "TYPEBOT_START"
    - "TYPEBOT_CHANGE_STATUS"
```

**Response:** Confirms RabbitMQ integration is set.

> **Proxy Note:** When enabled, the Evolution API will likely send messages to a RabbitMQ exchange (perhaps named per instance or a common one with routing keys). The proxy must have a RabbitMQ consumer set up to receive these. This is excellent for central monitoring: even if the proxy or instance restarts, events in the queue can be processed later. Ensure the RabbitMQ server address and credentials are properly configured on the Evolution API side (via config, not via this call).

#### Find RabbitMQ

**Method:** `GET`
**Path:** `/rabbitmq/find/{instance}`
**Headers:** `apikey: <instance-api-key>`

Check RabbitMQ event config for the instance.

**Response:** The stored config:

```yaml
rabbitmq:
  enabled: true
  events: [ "MESSAGES_UPSERT", "CHATS_UPDATE", ... ]
```

### SQS Integration

Similar to RabbitMQ, but for AWS SQS queue integration – events will be sent as messages to an SQS queue.

#### Set SQS

**Method:** `POST`
**Path:** `/sqs/set/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Enable SQS event sending for the instance. **Precondition:** Evolution API configured with AWS credentials and target SQS queue.

```yaml
# Request Body
sqs:
  enabled: true
  events:
    - "APPLICATION_STARTUP"
    - "QRCODE_UPDATED"
    - ... (same list of events as above)
```

**Response:** Confirms SQS integration is enabled.

> **Proxy Note:** The Evolution API will push events to the configured SQS queue. The proxy (or any consumer service) should poll or subscribe to that SQS. SQS is durable and scales well, but has cost and latency (short delay) considerations. Use this if cloud-native architecture is needed.

#### Find SQS

**Method:** `GET`
**Path:** `/sqs/find/{instance}`
**Headers:** `apikey: <instance-api-key>`

Check SQS config for the instance.

**Response:**

```yaml
sqs:
  enabled: true
  events: [ "MESSAGES_UPSERT", "CHATS_UPDATE", ... ]
```

### Webhook Integration

The Evolution API can hit a specified HTTP(S) endpoint with event data (POST requests) as events occur. This is convenient for simpler setups where you want push events without managing sockets or queues, but ensure your webhook endpoint can handle the load.

#### Set Webhook

**Method:** `POST`
**Path:** `/webhook/set/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Configure the webhook URL and event subscription.

```yaml
# Request Body
webhook:
  enabled: true
  url: "https://yourserver.com/webhook-endpoint"
  headers:
    authorization: "Bearer TOKEN"   # Note: spelled "autorization" in JSON, ensure correct spelling as needed
    Content-Type: "application/json"
  byEvents: false       # If false, all events are sent. If true, only those in "events" list are sent.
  base64: false         # If true, media content in events (like images) will be base64 encoded in the payload.
  events:
    - "APPLICATION_STARTUP"
    - "QRCODE_UPDATED"
    - "MESSAGES_SET"
    - ... etc.
```

**Response:** Confirmation of webhook setup.

> **Proxy Note:** The proxy can use this to direct events to itself (e.g., to a specific endpoint handling instance events). If Zapin proxy is a web service, it might prefer this method: Evolution API will POST events, and the proxy can process and broadcast to front-end clients or log them. Be cautious with `base64:true` – that can make payloads huge for media events. If the proxy is receiving base64 media via webhook, it might need to quickly store or forward it, not keep it in memory. Also, secure the endpoint (the `authorization` header helps). Rate limits: ensure the receiving end can handle bursts (if many messages come in at once).

#### Find Webhook

**Method:** `GET`
**Path:** `/webhook/find/{instance}`
**Headers:** `apikey: <instance-api-key>`

Retrieve the current webhook config.

**Response:** The webhook config as set:

```yaml
webhook:
  enabled: true
  url: "https://yourserver.com/webhook-endpoint"
  headers:
    authorization: "Bearer TOKEN"
    Content-Type: "application/json"
  byEvents: false
  base64: false
  events: [ ... list if byEvents=true ... ]
```

> **Proxy Note:** Use this for verification or debugging (e.g., to check if the webhook URL is correct). If events aren’t being received, verify `enabled` is true and the URL is reachable.

### Typebot Integration

Typebot refers to an integration with an external chatbot or dialog agent (perhaps a specific service named Typebot). It allows automating conversations by handing off messages to a Typebot and then returning responses to WhatsApp. The Evolution API provides endpoints to configure and manage Typebot behavior per instance.

**Use-case:** When enabled, incoming messages can be forwarded to a Typebot workflow, and the bot’s responses can be sent back to WhatsApp via the instance. This is useful for FAQ bots or guided flows. The proxy might help manage when the bot is active vs when a human takes over.

Key concepts:

* **Typebot Session:** Represents an active user session with the Typebot. We can close or pause these sessions.
* **Default Typebot Settings:** Global settings controlling bot behavior (like response delays, fallback, etc.).
* **Typebot Instance (Bot)**: You can configure multiple Typebot flows (bots) per instance, each with triggers (keywords or all messages).
* **Typebot Status:** The integration might have statuses like “bot started” or “bot stopped” which are reflected in events (TYPEBOT\_START, TYPEBOT\_CHANGE\_STATUS).

#### Change Session Status

**Method:** `POST`
**Path:** `/typebot/changeStatus/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Change the status of a Typebot session with a specific user (e.g., open, pause, or close the bot session for that user).

```yaml
# Request Body
remoteJid: "5511912345678@s.whatsapp.net"   # The WhatsApp JID of the user (contact) whose bot session to control
status: "closed"                            # Set the session status: "opened", "paused", or "closed"
```

**Response:** Confirmation (or possibly the session state). Setting to "closed" might signal that the bot conversation with that user has ended (perhaps handing off to human).

> **Proxy Note:** This is critical for bot-human handoff. For example, if a user requests a human agent, the proxy can `changeStatus` to "closed" for the bot, so it stops responding. Conversely, if the user goes idle, maybe "paused". Monitor via `TYPEBOT_CHANGE_STATUS` events to confirm state changes.

#### Fetch Sessions

**Method:** `GET`
**Path:** `/typebot/fetchSessions/:typebotId/{instance}`
**Headers:** `apikey: <instance-api-key>`

Fetch active sessions for a given Typebot integration (typebotId corresponds to a configured bot flow).

* **Path Param:** `:typebotId` – the ID of the Typebot whose sessions to fetch.

**Response:** List of sessions (probably user JIDs and their session state):

```yaml
sessions:
  - remoteJid: "5511912345678@s.whatsapp.net"
    status: "opened"
    lastActivity: 1694020000
  - remoteJid: "5511987654321@s.whatsapp.net"
    status: "paused"
    lastActivity: 1694010000
```

If no typebotId specified or not found, likely an error. This requires knowing the Typebot ID (see Create Typebot).

> **Proxy Note:** The proxy can use this to see which users are currently engaged with the bot. Perhaps for an admin dashboard: “here are all users currently in a bot flow, and their status.” Only sessions for the specified Typebot flow are returned.

#### Set Default Typebot Settings

**Method:** `POST`
**Path:** `/typebot/settings/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Configure default behavior of the Typebot integration for the instance. These settings apply unless overridden per bot.

```yaml
# Request Body
expire: 20                 # Session expiration time (in minutes perhaps) after last message to auto-close bot
keywordFinish: "#SAIR"     # The keyword a user can send to manually end the bot session (e.g., "#SAIR" means "#EXIT" in Portuguese)
delayMessage: 1000         # Delay (ms) before the bot sends each message (simulate typing delay)
unknownMessage: "Mensagem não reconhecida"  # Bot reply if it receives an input it doesn't understand (fallback message)
listeningFromMe: false     # Whether the bot should also listen to messages from the instance user (likely false, only user messages trigger bot)
stopBotFromMe: false       # If true, the instance user (agent) can send a command to stop the bot
keepOpen: false            # If false, bot session will close after completing flow; if true, keep session open for reuse
debounceTime: 10           # Minimum seconds between user messages that the bot will process (to avoid spamming the bot with rapid messages)
ignoreJids: []             # List of contact JIDs to ignore (not start bot for them)
typebotIdFallback: "clyja4oys0a3uqpy7k3bd7swe"  # A fallback Typebot flow ID to use if the primary bot fails or is not triggered
```

**Response:** The saved settings (or success message).

> **Proxy Note:** These settings heavily influence how the bot interacts. The proxy might set sensible defaults for these upon enabling a bot. For example, define a `keywordFinish` like "#HUMAN" to let users exit bot. `typebotIdFallback` could point to a default flow if no other triggers match. The proxy should coordinate with these settings – e.g., if a user sends the finish keyword, the proxy could also take action (like notify a human agent).

#### Fetch Default Settings

**Method:** `GET`
**Path:** `/typebot/fetchSettings/{instance}`
**Headers:** `apikey: <instance-api-key>`

Retrieve the current default Typebot settings.

**Response:** Same structure as set:

```yaml
expire: 20
keywordFinish: "#SAIR"
delayMessage: 1000
unknownMessage: "Mensagem não reconhecida"
listeningFromMe: false
stopBotFromMe: false
keepOpen: false
debounceTime: 10
ignoreJids: []
typebotIdFallback: "clyja4oys0a3uqpy7k3bd7swe"
```

This allows verifying the config.

#### Create Typebot (Integration)

**Method:** `POST`
**Path:** `/typebot/create/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Set up a new Typebot integration (link a Typebot flow to this instance with specified triggers).

```yaml
# Request Body
enabled: true                   # Whether this bot is active
url: "https://bot.dgcode.com.br"  # Base URL of the Typebot service (where the flows are hosted)
typebot: "my-typebot-uoz1rg9"    # Identifier of the specific bot flow to use (provided by Typebot platform)
triggerType: "keyword"           # How to trigger this bot: "all" (all messages go to bot) or "keyword" (only some messages)
triggerOperator: "regex"         # If triggerType is keyword, how to match: "contains", "equals", "startsWith", "endsWith", or "regex"
triggerValue: "^atend.*"         # The keyword or pattern to listen for (in this case, any message starting with "atend")
expire: 20                      # (Optional override) session expire minutes for this bot (if different from default)
keywordFinish: "#SAIR"          # (Optional override) finish keyword for this bot
delayMessage: 1000              # (Optional override) typing delay
unknownMessage: "Mensagem não reconhecida"  # override unknown message reply
listeningFromMe: false          # override
stopBotFromMe: false            # override
keepOpen: false                 # override
debounceTime: 10                # override
# (It uses the default settings unless overridden as above.)
```

**Response:** Details of the created bot integration, including a generated `typebotId` (not the same as the external Typebot’s id). For example:

```yaml
typebotId: "clx6niurm0001lzrhhqqe72yq"
enabled: true
triggerType: "keyword"
triggerOperator: "regex"
triggerValue: "^atend.*"
... (other settings)
```

This `typebotId` is what you'll use in other endpoints (like fetchSessions, fetch, update, delete).

> **Proxy Note:** The proxy might expose a UI for configuring bots. When user configures a new Typebot (provides the external Typebot URL or ID and triggers), the proxy calls this. Only one Typebot can have triggerType "all" (since that would catch everything); keyword type can have multiple with different keywords. It's important to avoid overlapping triggers. The proxy could validate that (e.g., don’t create two bots both listening to ".\*" regex).

#### Find Typebots

**Method:** `GET`
**Path:** `/typebot/find/{instance}`
**Headers:** `apikey: <instance-api-key>`

List all Typebot integrations configured for the instance.

**Response:** Array of Typebot configs (each similar to what create returns, including their `typebotId`, triggers, etc.).

```yaml
typebots:
  - typebotId: "clx6niurm0001lzrhhqqe72yq"
    enabled: true
    triggerType: "keyword"
    triggerOperator: "regex"
    triggerValue: "^atend.*"
    typebot: "my-typebot-uoz1rg9"
    url: "https://bot.dgcode.com.br"
    # ... other settings
  - typebotId: "clx6niurm0002abcdefffghij"
    enabled: true
    triggerType: "all"
    typebot: "another-bot-123abc"
    url: "https://bot.dgcode.com.br"
    # ... etc.
```

> **Proxy Note:** Shows what bots are active. Proxy could use this to ensure only one "all" type is enabled at a time. Also, if a user disables a bot, you'd call update to set enabled false (see below).

#### Fetch Typebot

**Method:** `GET`
**Path:** `/typebot/fetch/:typebotId/{instance}`
**Headers:** `apikey: <instance-api-key>`

Get details of a specific Typebot integration by its ID.

* **Path Param:** `:typebotId` – the ID of the Typebot config (internal Evolution API ID, from create/find list).

**Response:** The Typebot config object (same format as in find, but just the one).

For example:

```yaml
typebotId: "clx6niurm0001lzrhhqqe72yq"
enabled: true
url: "https://bot.dgcode.com.br"
typebot: "my-typebot-uoz1rg9"
triggerType: "keyword"
triggerOperator: "regex"
triggerValue: "^atend.*"
expire: 20
keywordFinish: "#SAIR"
delayMessage: 1000
unknownMessage: "Mensagem não reconhecida"
...
```

> **Proxy Note:** Useful if you know the ID and want to retrieve the config (perhaps to show in an edit form). Typically find gives all, but fetch gives one (maybe including secure info if any, though likely not needed as Typebot config is mostly public fields).

#### Update Typebot

**Method:** `PUT`
**Path:** `/typebot/update/:typebotId/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Modify an existing Typebot integration’s settings. Provide only fields that need change.

* **Path Param:** `:typebotId` – the bot config to update.

```yaml
# Request Body (example updating some fields)
enabled: true
url: "https://bot.dgcode.com.br"
typebot: "my-typebot-uoz1rg9"
expire: 20
keywordFinish: "#SAIR"
delayMessage: 1000
unknownMessage: "Mensagem não reconhecida"
listeningFromMe: false
stopBotFromMe: false
keepOpen: false
debounceTime: 10
triggerType: "keyword"
triggerOperator: "contains"
triggerValue: "evolution"
```

In this example, we changed `triggerOperator` to "contains" and `triggerValue` to "evolution" (perhaps broadening or altering the trigger).

**Response:** The updated config or success message.

> **Proxy Note:** Use this when a user edits the bot config. For example, disable the bot (`enabled:false`) to pause it, or change the trigger keyword. The proxy should check if changes conflict with other bots. After update, monitor `TYPEBOT_CHANGE_STATUS` events if enabling/disabling results in immediate start/stop of sessions.

#### Delete Typebot

**Method:** `DELETE`
**Path:** `/typebot/delete/:typebotId/{instance}`
**Headers:** `apikey: <instance-api-key>`

Remove a Typebot integration configuration entirely.

* **Path Param:** `:typebotId` – the bot config to delete.

**Response:** Success if deleted.

> **Proxy Note:** Once deleted, that bot will no longer intercept any messages. The proxy might call this if a user removes a bot integration from their settings. Ensure no sessions are left hanging (though presumably they end when config is gone). The `TYPEBOT_CHANGE_STATUS` events might not directly fire for deletion; but if the bot was running, you might consider manually closing sessions via the changeStatus endpoint first.

#### Start Typebot

**Method:** `POST`
**Path:** `/typebot/start/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Manually initiate a Typebot flow by sending a start request. This allows proactively triggering the bot to message a user, rather than waiting for user input.

```yaml
# Request Body
url: "https://bot.dgcode.com.br"           # Base URL of the Typebot service
typebot: "fluxo-unico-3uuso28"             # The specific Typebot flow ID to start
remoteJid: "557499879409@s.whatsapp.net"   # The WhatsApp JID of the user to start the bot with
startSession: false        # If false, it might run the bot without creating a persistent session (one-off interaction)
variables:                 # Initial variables to pass to the bot (if the bot flow accepts context variables)
  - name: "pushName"
    value: "Davidson Gomes"
```

**Response:** Likely triggers the bot to send its opening message to the user. The response might just be an acknowledgment that the bot was triggered.

> **Proxy Note:** Use this to push a bot-initiated message. For example, at a certain time or event, the system can start a bot conversation with a user (perhaps a survey or proactive outreach). If `startSession:false`, the integration might treat it not as a full session. This is a somewhat advanced use; ensure the user expects a bot message. Monitor via events (a `TYPEBOT_START` event might fire, and `SEND_MESSAGE` for the outgoing bot message).

## OpenAI Integration

OpenAI integration allows the Evolution API to leverage OpenAI’s models (like GPT-3.5/4) to respond to messages. This is typically for building an AI assistant within WhatsApp. The integration involves storing OpenAI API credentials and creating “OpenAI Bots” similar to Typebot, but powered by OpenAI’s models.

Concepts:

* **OpenAI Session:** Like Typebot session, an active conversation context with a user.
* **Default OpenAI Settings:** Similar to Typebot default settings, controlling the behavior of the AI (like system prompt etc., though here broken out differently).
* **OpenAI Creds:** Store API keys for OpenAI usage.
* **OpenAI Bot:** Configuration of an AI bot instance (which model to use, prompts, etc.) with triggers similar to Typebot.

#### Change Session Status (OpenAI)

**Method:** `POST`
**Path:** `/openai/changeStatus/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

OpenAI session management analog to Typebot’s. Likely pause/close a conversation with the AI for a user.

```yaml
# Request Body
remoteJid: "5511912345678@s.whatsapp.net"
status: "closed"   # or "opened", "paused"
```

**Response:** Confirmation of status change.

> **Proxy Note:** Use when handing over from AI to human or vice versa. For example, if user says "agent", close the AI session so it stops replying.

#### Fetch Sessions (OpenAI)

**Method:** `GET`
**Path:** `/openai/fetchSessions/:openaiBotId/{instance}`
**Headers:** `apikey: <instance-api-key>`

Get active sessions for a particular OpenAI bot (by its ID, similar to Typebot’s).

* **Path Param:** `:openaiBotId` – the ID of the OpenAI bot config.

**Response:** List of sessions with status for that bot:

```yaml
sessions:
  - remoteJid: "5511912345678@s.whatsapp.net"
    status: "opened"
    lastActivity: 1694030000
  # ... etc.
```

If no ID or invalid ID, likely error.

#### Set Default OpenAI Settings

**Method:** `POST`
**Path:** `/openai/settings/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Configure global default parameters for OpenAI bot behavior.

```yaml
# Request Body
openaiCredsId: "clyja4oys0a3uqpy7k3bd7swe"   # The ID of the OpenAI credentials to use by default (see OpenAI Creds)
expire: 20                   # Session expiration (minutes)
keywordFinish: "#SAIR"       # Keyword to finish/stop AI
delayMessage: 1000           # Typing delay for AI responses
unknownMessage: "Mensagem não reconhecida"
listeningFromMe: false
stopBotFromMe: false
keepOpen: false
debounceTime: 0
ignoreJids: []
openaiIdFallback: "clyja4oys0a3uqpy7k3bd7swe"  # Fallback OpenAI Creds ID or bot ID if primary fails?
```

**Response:** Saved settings confirmation.

> **Proxy Note:** These mirror Typebot defaults, but `openaiCredsId` and `openaiIdFallback` stand out. `openaiCredsId` ties to which API key to use (you might have multiple OpenAI keys with different limits or costs). If multiple bots, possibly you could have fallback credentials or flows. The proxy likely sets this up when enabling AI for the instance (after storing an OpenAI API key via creds).

#### Fetch Default Settings (OpenAI)

**Method:** `GET`
**Path:** `/openai/fetchSettings/{instance}`
**Headers:** `apikey: <instance-api-key>`

Get the current default OpenAI settings.

**Response:** JSON of those settings, e.g.:

```yaml
openaiCredsId: "clyja4oys0a3uqpy7k3bd7swe"
expire: 20
keywordFinish: "#SAIR"
delayMessage: 1000
unknownMessage: "Mensagem não reconhecida"
listeningFromMe: false
stopBotFromMe: false
keepOpen: false
debounceTime: 0
ignoreJids: []
openaiIdFallback: "clyja4oys0a3uqpy7k3bd7swe"
```

#### OpenAI Creds (API Keys Management)

Before using OpenAI in bots, you must store your OpenAI API key in the system. You can have multiple keys (maybe for different models or orgs).

**Note:** Handle these carefully; they are sensitive. The Evolution API likely stores them securely and refers by an ID.

##### Set OpenAI Creds

**Method:** `POST`
**Path:** `/openai/creds/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>` (or possibly global key if creds are system-wide, but likely per instance config)

Store a new OpenAI API credential.

```yaml
# Request Body
name: "apikey"               # A label for this credential (e.g., "OpenAI Key 1")
apiKey: "sk-XXXXXXXXXXXXXXXX"  # The actual OpenAI API key string
```

**Response:** The stored credential’s ID and info, e.g.:

```yaml
openaiCredsId: "clyrx36wj0001119ucjjzxik1"
name: "apikey"
```

The actual key might not be returned for security; only reference ID.

> **Proxy Note:** The proxy should call this when a user provides their OpenAI key (if each user has their own) or when configuring a shared key. Avoid logging the actual key. Possibly, this could also accept OpenAI org or endpoint info if needed (not shown here).

##### Get OpenAI Creds

**Method:** `GET`
**Path:** `/openai/creds/{instance}`
**Headers:** `apikey: <instance-api-key>`

Retrieve the list of stored OpenAI credentials (IDs and names, not the secrets).

**Response:** List of creds:

```yaml
openaiCreds:
  - id: "clyrx36wj0001119ucjjzxik1"
    name: "apikey"
  - id: "clyry67uj0002229ucbbzy78k2"
    name: "backup-key"
```

> **Proxy Note:** Use to display which keys are available and perhaps let user choose one for a bot. The actual keys are not exposed, which is good for security.

##### Delete OpenAI Creds

**Method:** `DELETE`
**Path:** `/openai/creds/:openaiCredsId/{instance}`
**Headers:** `apikey: <instance-api-key>`

Remove a stored OpenAI API key by its ID.

* **Path Param:** `:openaiCredsId` – the credential ID to delete.

**Response:** Success if deleted.

> **Proxy Note:** Ensure no active OpenAI bots are using this credsId before deletion. If they are, those bots might fail to call OpenAI after the key is removed. The proxy might prevent deletion if in use, or update those bots to use another key or disable them.

#### Create OpenAI Bot

**Method:** `POST`
**Path:** `/openai/create/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Configure a new OpenAI-powered bot for the instance, with details about how it interacts.

```yaml
# Request Body
enabled: true
openaiCredsId: "clyrx36wj0001119ucjjzxik1"   # Which OpenAI API creds to use for this bot
botType: "assistant"          # Type of OpenAI usage: "assistant" (single-turn completion) or "chatCompletion" (dialog context)
# If botType = "assistant", you can use the Fine-tuning/Answers API (older) or just a completion with a prompt template:
assistantId: "asst_LRNyh6qC4qq8NTyPjHbcJjSp"    # (For OpenAI "assistant" type, maybe an ID of a fine-tuned assistant or something)
functionUrl: "https://n8n.site.com"             # (Possibly a webhook for function calling or an intermediate)
# If botType = "chatCompletion", define model and initial system messages:
model: "gpt-4"                 # The OpenAI model to use (e.g., "gpt-3.5-turbo", "gpt-4")
systemMessages:
  - "You are a helpful assistant."
assistantMessages:
  - "\n\nHello there, how may I assist you today?"   # A predefined first message from the assistant (if any)
userMessages:
  - "Hello!"   # Example user message to start conversation (if needed to prime the model)
maxTokens: 300   # Max tokens for responses

# Trigger configuration (like Typebot triggers):
triggerType: "keyword" 
triggerOperator: "equals"
triggerValue: "teste"    # e.g., start the AI if user message equals "teste"
expire: 20
keywordFinish: "#SAIR"
delayMessage: 1000
unknownMessage: "Mensagem não reconhecida"
listeningFromMe: false
stopBotFromMe: false
keepOpen: false
debounceTime: 10
ignoreJids: []
```

**Response:** The created OpenAI bot config, including its generated ID:

```yaml
openaiBotId: "clyrx89pl0003339ucpdzxopq3"
enabled: true
botType: "assistant"
triggerType: "keyword"
triggerOperator: "equals"
triggerValue: "teste"
openaiCredsId: "clyrx36wj0001119ucjjzxik1"
model: "gpt-4"
maxTokens: 300
...
```

> **Proxy Note:** This is analogous to Typebot’s create. The proxy likely provides an interface to configure an AI assistant. If using the chatCompletion mode, system/assistant messages basically act as the initial conversation (like setting the context). The `assistantId` and `functionUrl` might be for a specific use-case (perhaps if integrating with an external tool for retrieval or functions – could ignore if not needed). The proxy should ensure the OpenAI key (credsId) is valid and that usage of GPT-4 or others is allowed by that key. Also consider cost: enforce usage limits or notify users of token usage if needed.

#### Find OpenAI Bots

**Method:** `GET`
**Path:** `/openai/find/{instance}`
**Headers:** `apikey: <instance-api-key>`

List all configured OpenAI bots for the instance.

**Response:** Array of bot configs (IDs and settings):

```yaml
openaiBots:
  - openaiBotId: "clyrx89pl0003339ucpdzxopq3"
    enabled: true
    triggerType: "keyword"
    triggerOperator: "equals"
    triggerValue: "teste"
    botType: "assistant"
    model: "gpt-4"
    openaiCredsId: "clyrx36wj0001119ucjjzxik1"
    # ... other settings
  - openaiBotId: "clyry12ab0004449ucefxabc4"
    enabled: true
    triggerType: "all"
    botType: "chatCompletion"
    model: "gpt-3.5-turbo"
    openaiCredsId: "clyrx36wj0001119ucjjzxik1"
    # ... etc.
```

#### Fetch OpenAI Bot

**Method:** `GET`
**Path:** `/openai/fetch/:openaiBotId/{instance}`
**Headers:** `apikey: <instance-api-key>`

Get details of a single OpenAI bot config by ID.

**Response:** The bot config object (like one element from the find list).

#### Update OpenAI Bot

**Method:** `PUT`
**Path:** `/openai/update/:openaiBotId/{instance}`
**Headers:** `Content-Type: application/json`, `apikey: <instance-api-key>`

Modify an existing OpenAI bot’s configuration. Only include fields to change.

```yaml
# Request Body (for example, updating various fields)
enabled: true
openaiCredsId: "clyrx36wj0001119ucjjzxik1"
botType: "assistant"
assistantId: "asst_LRNyh6qC4qq8NTyPjHbcJjSp"
functionUrl: "https://webhook.com"
model: "gpt-4"
systemMessages: ["You are a helpful assistant."]
assistantMessages: ["\n\nHello there, how may I assist you today?"]
userMessages: ["Hello!"]
maxTokens: 300
triggerType: "keyword"
triggerOperator: "equals"
triggerValue: "teste"
expire: 20
keywordFinish: "#SAIR"
delayMessage: 1000
unknownMessage: "Mensagem não reconhecida"
listeningFromMe: false
stopBotFromMe: false
keepOpen: false
debounceTime: 10
ignoreJids: []
```

**Response:** The updated bot config.

> **Proxy Note:** Similar to Typebot update – ensure no conflicts in triggers. If changing `openaiCredsId` (API key), be mindful of usage. Changing `model` from 3.5 to 4 will impact cost and response quality; maybe inform users. If the bot had an ongoing conversation (especially for chatCompletion which keeps context), changing parameters might reset or not affect existing sessions until restarted.

#### Delete OpenAI Bot

**Method:** `DELETE`
**Path:** `/openai/delete/:openaiBotId/{instance}`
**Headers:** `apikey: <instance-api-key>`

Remove an OpenAI bot integration.

**Response:** Success if removed.

> **Proxy Note:** After deletion, any trigger that was associated will no longer be handled by AI. Make sure to inform any users possibly interacting that the bot is no longer available (if applicable). Also free up any resources if needed (though context is likely just in memory or DB which would be cleaned up).

---

**Conclusion & Proxy Implementation Tips:** The Zapin proxy should carefully orchestrate these API calls:

* **Authentication:** Use the global API key for instance-level operations (create, delete, etc.) and the instance-specific API keys for messaging. Enforce that one user’s instance API key isn’t used by another.
* **Rate Limiting:** Implement limits per endpoint per instance. E.g., no more than X messages/minute on sendText, or Y group creates per day. Use the proxy to queue or drop excessive requests, and possibly use the delay options to spread out sends (to avoid WhatsApp bans).
* **Monitoring:** Decide on an event integration (WebSocket, Webhook, RabbitMQ, SQS). For a scalable server-side app, RabbitMQ or SQS is recommended so you don’t miss events. The proxy can consume events to log message delivery, content (for analytics or moderation), and trigger business logic (like auto-responses or alerts).
* **Webhook Security:** If using webhooks from Evolution API to proxy, validate the `Authorization` header or token in the payload to ensure the request is from the trusted source.
* **Concurrency:** The Evolution API handles the WhatsApp connection; multiple endpoints can be called concurrently but consider sequence (e.g., don’t call deleteMessage before the message is actually sent). The proxy might need to maintain a short state for pending actions (like waiting for QRCODE\_UPDATED event after create instance to forward the QR code to the user).
* **Error Handling:** Map Evolution API errors to user-friendly messages. E.g., if sending a message returns a 400 because the number isn’t on WhatsApp (error message likely contains info), catch that and inform the user via the proxy.
* **Logging:** Keep audit logs of actions (instance created/deleted, group invites sent, messages sent via AI, etc.) in the proxy. This is crucial for debugging and compliance, especially with automated bots.

By following this documentation, an LLM or any developer integrating can programmatically manage WhatsApp through Evolution API v2.2.2 while using the Zapin proxy as a safe intermediary for multi-tenant security, rate control, and monitoring.
