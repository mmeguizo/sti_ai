# AI LLMs — Project Documentation

> **What is this?** A full-stack AI chat app with two chat modes (general AI chat and IT support ticket analysis), user authentication, and an admin panel. The frontend is Angular, the backend is NestJS, and AI responses come from Hugging Face.

---

## Table of Contents

1. [How the App Works (Non-Technical Overview)](#how-the-app-works-non-technical-overview)
2. [Project Folder Structure](#project-folder-structure)
3. [The Three Big Pieces](#the-three-big-pieces)
4. [Data Flow Diagrams](#data-flow-diagrams)
5. [Backend — File-by-File](#backend--file-by-file)
6. [Frontend — File-by-File](#frontend--file-by-file)
7. [Database — Schema & Tables](#database--schema--tables)
8. [Configuration & Deployment](#configuration--deployment)
9. [Environment Variables](#environment-variables)
10. [How to Run Locally](#how-to-run-locally)
11. [Change Log](#change-log)

---

## How the App Works (Non-Technical Overview)

Imagine three layers stacked on top of each other:

```
┌──────────────────────────────────────────────┐
│  FRONTEND  (what users see in the browser)   │
│  Angular app hosted on Netlify               │
└────────────────────┬─────────────────────────┘
                     │ HTTP requests
┌────────────────────▼─────────────────────────┐
│  BACKEND  (the brain behind the scenes)      │
│  NestJS API hosted on Render.com             │
└────────┬──────────────────────┬──────────────┘
         │                      │
┌────────▼────────┐   ┌────────▼──────────────┐
│  Supabase       │   │  MySQL                │
│  (PostgreSQL)   │   │  (IT support tickets) │
│  Users & Chats  │   │  50k+ ticket records  │
└─────────────────┘   └───────────────────────┘
```

**What a user experiences:**

1. **Login** — User clicks "Login", gets redirected to Auth0 (a third-party login service), logs in, comes back authenticated.
2. **General AI Chat** — User types a message, the backend sends it to Hugging Face (an AI service), and the AI's response appears on screen. Chat history is saved.
3. **IT Support Ticket Chat** — User asks a question like "How many tickets are open?". The backend translates that into a SQL database query, runs it against the ticket database, then uses AI to turn the raw numbers into a readable answer.
4. **Admin Panel** — Admin users can view all users, approve new accounts, and change roles.

---

## Project Folder Structure

```
AI LLMs/
│
├── api/                          ← BACKEND (NestJS server)
│   ├── src/
│   │   ├── main.ts               ← Server entry point (starts the app)
│   │   ├── app.module.ts         ← Registers all controllers & services
│   │   ├── app.controller.ts     ← Health check endpoint (GET /)
│   │   ├── app.service.ts        ← Returns "Hello World" (health check)
│   │   │
│   │   ├── ai/
│   │   │   └── ai.service.ts     ← Core AI: talks to Hugging Face API
│   │   │
│   │   ├── auth/
│   │   │   ├── auth.controller.ts   ← Login sync & admin user endpoints
│   │   │   └── auth.service.ts      ← JWT verification, user sync, admin logic
│   │   │
│   │   ├── chat/
│   │   │   ├── chat.controller.ts          ← General chat endpoints
│   │   │   └── chat.persistence.service.ts ← Saves chats to Supabase
│   │   │
│   │   └── tickets/
│   │       ├── ticket-chat.controller.ts  ← OLD keyword-search ticket chat
│   │       ├── ticket-lookup.service.ts   ← OLD MySQL keyword LIKE search
│   │       ├── nl-sql.controller.ts       ← NEW NL-to-SQL endpoint
│   │       ├── nl-sql.service.ts          ← NEW NL-to-SQL pipeline service
│   │       └── ask-database.ts            ← Prompt templates & SQL helpers
│   │
│   ├── package.json              ← Backend dependencies & scripts
│   ├── tsconfig.json             ← TypeScript config
│   └── nest-cli.json             ← NestJS CLI config
│
├── app/                          ← FRONTEND (Angular app)
│   ├── src/
│   │   ├── main.ts               ← Angular app bootstrap
│   │   ├── index.html            ← Single HTML page (SPA shell)
│   │   ├── styles.css            ← Global styles
│   │   │
│   │   ├── app/
│   │   │   ├── app.ts            ← Root component (login or workspace)
│   │   │   ├── app.config.ts     ← App configuration (Auth0, routing, HTTP)
│   │   │   ├── app.routes.ts     ← Route definitions (currently empty)
│   │   │   ├── app.settings.ts   ← Auth0 domain & client ID
│   │   │   │
│   │   │   ├── auth/
│   │   │   │   ├── login.component.ts    ← Login page logic
│   │   │   │   ├── login.component.html  ← Login page template
│   │   │   │   └── login.component.css   ← Login page styles
│   │   │   │
│   │   │   ├── workspace/
│   │   │   │   ├── workspace.component.ts    ← Main workspace (tabs + header)
│   │   │   │   ├── workspace.component.html  ← Workspace template
│   │   │   │   └── workspace.component.css   ← Workspace styles
│   │   │   │
│   │   │   ├── chat/
│   │   │   │   ├── chat.component.ts    ← General AI chat logic
│   │   │   │   ├── chat.component.html  ← Chat template
│   │   │   │   └── chat.component.css   ← Chat styles
│   │   │   │
│   │   │   ├── ticket-chat/
│   │   │   │   ├── ticket-chat.component.ts    ← Ticket chat logic
│   │   │   │   ├── ticket-chat.component.html  ← Ticket chat template
│   │   │   │   └── ticket-chat.component.css   ← Ticket chat styles
│   │   │   │
│   │   │   ├── admin/
│   │   │   │   ├── admin-users.component.ts    ← Admin panel logic
│   │   │   │   ├── admin-users.component.html  ← Admin panel template
│   │   │   │   └── admin-users.component.css   ← Admin panel styles
│   │   │   │
│   │   │   └── services/
│   │   │       ├── auth-facade.service.ts     ← Auth0 + user sync
│   │   │       ├── chat.service.ts            ← General chat HTTP calls
│   │   │       ├── ticket-chat.service.ts     ← Ticket chat HTTP calls
│   │   │       └── admin-users.service.ts     ← Admin user management calls
│   │   │
│   │   └── environments/
│   │       ├── environment.ts       ← Dev config (localhost:3000)
│   │       └── environment.prod.ts  ← Prod config (Render URL)
│   │
│   ├── package.json              ← Frontend dependencies & scripts
│   └── angular.json              ← Angular CLI config
│
├── supabase/
│   └── schema.sql                ← PostgreSQL database schema
│
├── netlify.toml                  ← Frontend deployment config (Netlify)
├── render.yaml                   ← Backend deployment config (Render.com)
├── PROJECT-DOCS.md               ← THIS FILE
└── README.md                     ← General readme
```

---

## The Three Big Pieces

### 1. Frontend (Angular) — `app/`

The user interface. It runs in the browser and talks to the backend via HTTP.

| What it does                          | Where                                             |
| ------------------------------------- | ------------------------------------------------- |
| Shows login page if not authenticated | `app/src/app/auth/login.component.*`              |
| Shows workspace with tabs after login | `app/src/app/workspace/workspace.component.*`     |
| General AI Chat tab                   | `app/src/app/chat/chat.component.*`               |
| IT Ticket Chat tab                    | `app/src/app/ticket-chat/ticket-chat.component.*` |
| Admin user management (admin only)    | `app/src/app/admin/admin-users.component.*`       |
| Makes HTTP calls to backend           | `app/src/app/services/*.service.ts`               |
| Auth0 login/logout/token management   | `app/src/app/services/auth-facade.service.ts`     |

### 2. Backend (NestJS) — `api/`

The server. It handles all the business logic, talks to databases, and calls the AI.

| What it does                        | Where                                      |
| ----------------------------------- | ------------------------------------------ |
| Starts the server, configures CORS  | `api/src/main.ts`                          |
| Registers all parts of the app      | `api/src/app.module.ts`                    |
| Calls Hugging Face AI for responses | `api/src/ai/ai.service.ts`                 |
| Verifies login tokens, syncs users  | `api/src/auth/auth.service.ts`             |
| Saves/loads chat history            | `api/src/chat/chat.persistence.service.ts` |
| NL-to-SQL pipeline (new)            | `api/src/tickets/nl-sql.service.ts`        |
| SQL prompt templates & helpers      | `api/src/tickets/ask-database.ts`          |

### 3. Databases

| Database                  | What it stores                              | Where defined               |
| ------------------------- | ------------------------------------------- | --------------------------- |
| **Supabase (PostgreSQL)** | User accounts, chat sessions, chat messages | `supabase/schema.sql`       |
| **MySQL**                 | 50k+ IT support ticket records              | External (not in this repo) |

---

## Data Flow Diagrams

### Login Flow

```
User clicks "Login"
    │
    ▼
Auth0 Universal Login page (third-party)
    │  User enters email/password
    ▼
Redirect back to app with ID token
    │
    ▼
Frontend calls POST /auth/sync-user with token
    │
    ▼
Backend verifies token signature → extracts user info
    │
    ▼
Backend upserts user to Supabase (app_users table)
    │
    ▼
Returns user profile (role, status, display name)
    │
    ▼
Frontend shows Workspace (or "pending approval" banner)
```

### General AI Chat Flow

```
User types message → clicks Send
    │
    ▼
Frontend (ChatComponent) calls ChatService.sendMessage()
    │
    ▼
HTTP POST /chat  { message: "What is machine learning?" }
    │
    ▼
Backend (ChatController) receives request
    │
    ▼
Calls AiService.generateChatResponse(message)
    │   ├── Checks concurrency (max 4 parallel requests)
    │   ├── Queues if busy (max 20 in queue)
    │   └── Sends to Hugging Face chatCompletion API
    ▼
Hugging Face returns AI response
    │
    ▼
If user is logged in → save to Supabase (chats + chat_messages)
    │
    ▼
HTTP Response: { reply: "Machine learning is...", chatId: "abc-123" }
    │
    ▼
Frontend displays bot message with Markdown rendering
```

### IT Ticket Chat — NL-to-SQL Flow (Current Pipeline)

```
User asks: "How many tickets are open?"
    │
    ▼
Frontend (TicketChatComponent) calls TicketChatService.sendMessage()
    │
    ▼
HTTP POST /nl-sql  { question: "How many tickets are open?" }
    │
    ▼
Backend (NlSqlController) → NlSqlService.askDatabase()
    │
    ▼
Step 1: Fetch table schema (SHOW CREATE TABLE)
    │         → Cached after first call
    ▼
Step 2: Build SQL prompt from template
    │         "Given this schema: {...}, write a SELECT query for: {...}"
    ▼
Step 3: Send prompt to Hugging Face (chatCompletion)
    │
    ▼
Step 4: AI returns raw SQL:  "SELECT COUNT(*) FROM ... WHERE status = 'Open'"
    │
    ▼
Step 5: Extract clean SQL (strip markdown fences)
    │
    ▼
Step 6: Security check — SELECT only!
    │         Blocks: INSERT, UPDATE, DELETE, DROP, ALTER, CREATE,
    │                 TRUNCATE, REPLACE, MERGE, EXEC, GRANT, REVOKE, etc.
    ▼
Step 7: Execute SQL against MySQL database
    │
    ▼
Step 8: Format results as JSON
    │
    ▼
Step 9: Build answer prompt
    │         "Given this question, SQL, and results, write a natural answer"
    ▼
Step 10: Send to Hugging Face (chatCompletion)
    │
    ▼
HTTP Response: { answer: "There are 12,847 open tickets.", sql: "SELECT COUNT(*)..." }
    │
    ▼
Frontend displays the answer (maps 'answer' → 'reply')
```

### Admin User Management Flow

```
Admin clicks "Users" button
    │
    ▼
AdminUsersComponent loads → calls AdminUsersService.listUsers()
    │
    ▼
HTTP GET /auth/admin/users  (with Bearer token)
    │
    ▼
Backend verifies token → checks user has 'admin' role
    │
    ▼
Queries Supabase for user list (with search & pagination)
    │
    ▼
Returns paginated user list
    │
    ▼
Admin clicks "Activate" / "Disable" / "Make Admin" / etc.
    │
    ▼
HTTP PATCH /auth/admin/users/:auth0UserId  { status: "active" }
    │
    ▼
Backend verifies admin, updates Supabase, returns updated user
```

---

## Backend — File-by-File

### `api/src/main.ts` — Server Entry Point

**What it does:** Boots up the entire NestJS server. Configures which domains can call the API (CORS).

**How it works:**

1. Creates a NestJS app from the root `AppModule`
2. Reads `FRONTEND_URL` environment variable for allowed origins
3. Always allows `localhost:4200` and `127.0.0.1:4200` (local dev)
4. Allows any `*.netlify.app` domain (production/preview)
5. Starts listening on port 3000 (or `PORT` env var)

---

### `api/src/app.module.ts` — Module Registry

**What it does:** Tells NestJS which controllers and services exist. Think of it as the master list of all the pieces.

**Currently registers:**

- **Controllers** (HTTP endpoints): `AppController`, `ChatController`, `AuthController`, `TicketChatController`, `NlSqlController`
- **Services** (business logic): `AppService`, `AiService`, `AuthSyncService`, `ChatPersistenceService`, `TicketLookupService`, `NlSqlService`

> **When you add a new feature:** You must register its controller and/or service here, or NestJS won't know it exists.

---

### `api/src/ai/ai.service.ts` — Hugging Face AI Integration

**What it does:** The core AI brain. Sends prompts to Hugging Face and returns responses.

**Key features:**

- **Concurrency control** — Only 4 requests to Hugging Face at the same time. Extra requests wait in a queue (max 20).
- **Timeout protection** — If Hugging Face takes too long (70 seconds), the request fails with a clear error.
- **Fallback models** — If the primary model (`meta-llama/Llama-3.1-8B-Instruct`) fails, it tries `Qwen/Qwen2.5-7B-Instruct`.
- **Two modes:**
  - `generateChatResponse(message)` — Freeform AI chat (used by General Chat)
  - `generateTicketChatResponse(prompt)` — Grounded response that only uses data you provide (used by old keyword ticket chat)

**Used by:** `ChatController`, `TicketChatController`

---

### `api/src/auth/auth.controller.ts` — Auth Endpoints

**What it does:** Exposes HTTP endpoints for user login sync and admin user management.

| Endpoint                      | Method | Who Can Call       | What It Does                 |
| ----------------------------- | ------ | ------------------ | ---------------------------- |
| `POST /auth/sync-user`        | POST   | Any logged-in user | Syncs Auth0 user to Supabase |
| `GET /auth/admin/users`       | GET    | Admin only         | Lists all users              |
| `PATCH /auth/admin/users/:id` | PATCH  | Admin only         | Updates user role or status  |

---

### `api/src/auth/auth.service.ts` — Auth Logic

**What it does:** The heavy lifting behind authentication.

- **Verifies JWTs** — Checks that the user's login token is real and not tampered with, using Auth0's public keys (JWKS).
- **Syncs users** — When a user logs in, creates or updates their profile in Supabase.
- **Admin checks** — Verifies the caller is an admin before allowing admin actions.
- **User management** — Handles updating roles and statuses, tracks who approved whom.

---

### `api/src/chat/chat.controller.ts` — General Chat Endpoints

**What it does:** Handles the "General AI Chat" tab.

| Endpoint                    | What It Does                       |
| --------------------------- | ---------------------------------- |
| `POST /chat`                | Send a message, get an AI response |
| `GET /chat/history`         | List your past chat sessions       |
| `GET /chat/history/:chatId` | Load messages from a specific chat |

**Important:** Chat history is only saved if you're logged in. If you send a message without a token, you still get a response — it just won't be saved.

---

### `api/src/chat/chat.persistence.service.ts` — Chat Storage

**What it does:** Reads and writes chat data to Supabase.

- `saveMessagePair()` — Saves both the user message and AI reply to the database. Creates a new chat session if one doesn't exist.
- `listChats()` — Gets up to 50 most recent chats for a user.
- `getMessages()` — Gets all messages in a specific chat. Verifies you own the chat first.

---

### `api/src/tickets/nl-sql.controller.ts` — NL-to-SQL Endpoint

**What it does:** Exposes the natural language to SQL endpoint.

| Endpoint       | What It Does                                    |
| -------------- | ----------------------------------------------- |
| `POST /nl-sql` | Takes `{ question }`, returns `{ answer, sql }` |

No authentication required. This is a public endpoint.

---

### `api/src/tickets/nl-sql.service.ts` — NL-to-SQL Pipeline

**What it does:** The heart of the ticket analysis feature. This is a 10-step pipeline:

| Step | What Happens                                                |
| ---- | ----------------------------------------------------------- |
| 1    | Fetch the table schema from MySQL (cached after first time) |
| 2    | Build a prompt telling the AI to write a SQL query          |
| 3    | Send the prompt to Hugging Face                             |
| 4    | AI returns a SQL query                                      |
| 5    | Clean up the SQL (strip markdown formatting)                |
| 6    | **Security check** — reject if it's not a pure SELECT       |
| 7    | Execute the SQL against MySQL                               |
| 8    | Format the query results as JSON                            |
| 9    | Build a new prompt asking AI to explain the results         |
| 10   | AI returns a natural-language answer                        |

**Console logging:** Every step prints to the server console so you can trace exactly what happened. Look for lines like `[NL-SQL] Step 1:`, `[NL-SQL] Step 2:`, etc.

---

### `api/src/tickets/ask-database.ts` — Prompt Templates & Helpers

**What it does:** Contains the reusable building blocks for the NL-SQL pipeline.

**Exports:**

- `SQL_PROMPT` — The template that tells AI how to write SQL. Includes the table schema and question.
- `ANSWER_PROMPT` — The template that tells AI how to format results into a readable answer.
- `validateSelectOnly(sql)` — Security guard. Throws an error if the SQL contains anything other than SELECT.
- `extractSql(raw)` — Cleans up the AI's response to get just the SQL (removes markdown code fences, etc.).
- `askDatabase(question)` — A standalone function that runs the entire pipeline. Can be tested independently with `npx ts-node src/tickets/ask-database.ts`.

**Blocked SQL keywords:** INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE, REPLACE, MERGE, EXEC, EXECUTE, GRANT, REVOKE, CALL, LOAD, SET.

---

### `api/src/tickets/ticket-chat.controller.ts` — OLD Keyword Search (Legacy)

**What it does:** The original ticket chat endpoint. Searches MySQL using keyword matching (LIKE queries) instead of generating SQL. The frontend no longer calls this endpoint — it was replaced by `/nl-sql`.

**Why it still exists:** Kept as a fallback. Could be removed if NL-SQL proves stable.

---

### `api/src/tickets/ticket-lookup.service.ts` — OLD Keyword Search Service (Legacy)

**What it does:** Extracts keywords from the user's question and searches all text columns in the tickets table using LIKE queries. Returns up to 15 matching tickets. Used by the old `ticket-chat.controller.ts`.

---

## Frontend — File-by-File

### `app/src/main.ts` — App Bootstrap

**What it does:** Starts the Angular application. Loads the root `App` component with configuration from `app.config.ts`.

---

### `app/src/app/app.ts` — Root Component

**What it does:** The very first component that renders. Makes one decision:

- **If user is logged in** → Show `WorkspaceComponent`
- **If not** → Show `LoginComponent`

---

### `app/src/app/app.config.ts` — App Configuration

**What it does:** Sets up Angular's core providers:

- **Router** — For page navigation (currently no routes defined; uses conditional rendering instead)
- **HTTP Client** — For making API calls (uses modern Fetch API)
- **Auth0** — Login service (only enabled if domain & client ID are configured)

---

### `app/src/app/app.settings.ts` — Auth0 Settings

**What it does:** Stores Auth0 configuration values (domain, client ID). Also provides `isAuth0Configured()` to check if Auth0 credentials are present.

---

### `app/src/app/auth/login.component.*` — Login Page

**What it does:** Shows the login screen with:

- Explanation of how Auth0 + Supabase integration works
- Feature cards (single entry point, approval workflow, chat history)
- Login button (calls Auth0 redirect)
- Error display if login fails
- Setup notice if Auth0 is not configured

---

### `app/src/app/workspace/workspace.component.*` — Main Workspace

**What it does:** The authenticated user's home screen. Contains:

- **Header** — User name, email, role badge, status badge, logout button
- **Tab navigation** — "General AI Chat" and "IT Support Tickets"
- **Admin toggle** — "Users" button (visible to admins only) switches to admin panel
- **Approval banner** — Shown if user account is pending approval

---

### `app/src/app/chat/chat.component.*` — General AI Chat

**What it does:** Interactive chat with a general-purpose AI.

**Features:**

- Message input with Enter-to-send
- Animated "Thinking..." loading indicator
- Bot responses rendered as Markdown (supports code blocks, lists, etc.)
- Sidebar with chat history (load previous conversations)
- "New Chat" button to start fresh
- Error handling (timeout, server errors, network errors)

---

### `app/src/app/ticket-chat/ticket-chat.component.*` — IT Ticket Chat

**What it does:** Chat interface for asking questions about the IT support ticket database.

**Features:**

- Message input with Enter-to-send
- Multi-phase loading animation showing pipeline progress:
  - "Analyzing question" → "Generating SQL query" → "Querying database" → "Formatting answer with AI"
- Clear button to reset conversation
- Bot responses rendered as Markdown
- Longer timeout (90 seconds) because database queries + 2 AI calls take longer

---

### `app/src/app/admin/admin-users.component.*` — Admin Panel

**What it does:** Lets admins manage all user accounts.

**Features:**

- Search users by name, email, role, or status
- Paginated table (8 users per page)
- Action buttons: Activate, Disable, Make Admin, Make User
- Loading states and error handling

---

### `app/src/app/services/auth-facade.service.ts` — Auth Service

**What it does:** Bridges Auth0 SDK with the rest of the app.

**Key responsibilities:**

- **`login()`** — Starts Auth0 login redirect
- **`logout()`** — Logs out and redirects to homepage
- **`appUser$`** — Observable that emits the current user's profile (merged Auth0 + Supabase data)
- **`rawToken$`** — Observable that emits the raw JWT for API calls
- **User sync** — After Auth0 login, calls backend `/auth/sync-user` to create/update profile in Supabase

---

### `app/src/app/services/chat.service.ts` — Chat HTTP Service

**What it does:** Makes HTTP calls for the General AI Chat feature.

| Method                              | HTTP Call               | Purpose                    |
| ----------------------------------- | ----------------------- | -------------------------- |
| `sendMessage(msg, token?, chatId?)` | POST `/chat`            | Send message, get AI reply |
| `getChatList(token)`                | GET `/chat/history`     | List past chat sessions    |
| `getChatMessages(chatId, token)`    | GET `/chat/history/:id` | Load messages from a chat  |

Timeout: 65 seconds.

---

### `app/src/app/services/ticket-chat.service.ts` — Ticket Chat HTTP Service

**What it does:** Makes HTTP calls for the IT Ticket Chat feature.

| Method             | HTTP Call      | Purpose                      |
| ------------------ | -------------- | ---------------------------- |
| `sendMessage(msg)` | POST `/nl-sql` | Ask a question about tickets |

Sends `{ question }` and maps the response `{ answer, sql }` to `{ reply }` for component compatibility.

Timeout: 90 seconds (longer due to database + 2 AI calls).

---

### `app/src/app/services/admin-users.service.ts` — Admin HTTP Service

**What it does:** Makes HTTP calls for admin user management.

| Method                              | HTTP Call                     | Purpose               |
| ----------------------------------- | ----------------------------- | --------------------- |
| `listUsers(search, page, pageSize)` | GET `/auth/admin/users`       | Search/list users     |
| `updateUser(auth0UserId, updates)`  | PATCH `/auth/admin/users/:id` | Change role or status |

Requires admin authentication (Bearer token). Non-admins get 403 Forbidden.

---

### `app/src/environments/environment.ts` — Dev Environment

```
apiUrl: http://localhost:3000
```

Used during local development. All HTTP services read this to know where the backend is.

---

### `app/src/environments/environment.prod.ts` — Production Environment

```
apiUrl: https://sti-ai.onrender.com
```

Used in production builds. Points to the Render.com-hosted backend.

---

## Database — Schema & Tables

### Supabase (PostgreSQL) — User Data & Chat History

Defined in `supabase/schema.sql`.

**Table: `app_users`** — Every user who has logged in.

| Column          | Type          | Purpose                                 |
| --------------- | ------------- | --------------------------------------- |
| `auth0_user_id` | text (PK)     | Auth0 subject ID (e.g. `auth0\|abc123`) |
| `email`         | text (unique) | User email                              |
| `display_name`  | text          | User's name                             |
| `avatar_url`    | text          | Profile picture URL                     |
| `role`          | text          | `user` or `admin`                       |
| `status`        | text          | `pending`, `active`, or `disabled`      |
| `approved_by`   | text (FK)     | Who approved this user                  |
| `approved_at`   | timestamp     | When they were approved                 |
| `last_login_at` | timestamp     | Last login time                         |
| `created_at`    | timestamp     | Account creation time                   |
| `updated_at`    | timestamp     | Last profile update                     |

**Table: `chats`** — Chat sessions.

| Column            | Type                | Purpose                                      |
| ----------------- | ------------------- | -------------------------------------------- |
| `id`              | uuid (PK)           | Unique chat ID                               |
| `user_id`         | text (FK→app_users) | Who owns this chat                           |
| `title`           | text                | Chat title (first 60 chars of first message) |
| `status`          | text                | `active` or `archived`                       |
| `last_message_at` | timestamp           | When the latest message was sent             |

**Table: `chat_messages`** — Individual messages within chats.

| Column        | Type            | Purpose                                              |
| ------------- | --------------- | ---------------------------------------------------- |
| `id`          | uuid (PK)       | Unique message ID                                    |
| `chat_id`     | uuid (FK→chats) | Which chat this belongs to                           |
| `sender_role` | text            | `user`, `assistant`, or `system`                     |
| `content`     | text            | The message text                                     |
| `model`       | text            | Which AI model generated it (for assistant messages) |
| `created_at`  | timestamp       | When it was sent                                     |

### MySQL — IT Support Tickets

Database: `it_support_ticket`, Table: `synthetic_it_support_tickets`

This is a separate MySQL database (not Supabase). It contains ~50k synthetic IT support ticket records.

| Column               | Purpose                                                |
| -------------------- | ------------------------------------------------------ |
| `ticket_id`          | Unique ticket identifier                               |
| `created_at`         | When the ticket was created                            |
| `customer_id`        | Customer identifier                                    |
| `customer_segment`   | Customer type/segment                                  |
| `channel`            | How the ticket was submitted (email, phone, web, etc.) |
| `product_area`       | Which product area the ticket is about                 |
| `issue_type`         | Type of issue reported                                 |
| `priority`           | Ticket priority level                                  |
| `status`             | Current status (Open, Closed, etc.)                    |
| `sla_plan`           | Service level agreement tier                           |
| `initial_message`    | The customer's original message                        |
| `agent_first_reply`  | The support agent's first response                     |
| `resolution_summary` | How the issue was resolved                             |
| `customer_sentiment` | Customer's sentiment (positive, negative, neutral)     |
| `platform`           | Operating system or platform                           |
| `region`             | Geographic region                                      |

---

## Configuration & Deployment

### Frontend → Netlify

Configured in `netlify.toml`:

- Build directory: `app/`
- Build command: `npm run build`
- Output: `dist/app/browser`
- All routes redirect to `index.html` (SPA routing)

### Backend → Render.com

Configured in `render.yaml`:

- Build directory: `api/`
- Build command: `npm install && npm run build`
- Start command: `node dist/main`
- Environment variables set in Render dashboard

---

## Environment Variables

### Backend (`api/`)

| Variable                     | Required | Default                            | Purpose                                |
| ---------------------------- | -------- | ---------------------------------- | -------------------------------------- |
| `HF_TOKEN`                   | Yes      | —                                  | Hugging Face API token                 |
| `HF_MODEL`                   | No       | `meta-llama/Llama-3.1-8B-Instruct` | AI model to use                        |
| `SUPABASE_URL`               | Yes      | —                                  | Supabase project URL                   |
| `SUPABASE_SERVICE_ROLE_KEY`  | Yes      | —                                  | Supabase admin API key                 |
| `AUTH0_ISSUER_BASE_URL`      | Yes      | —                                  | Auth0 tenant URL                       |
| `AUTH0_CLIENT_ID`            | Yes      | —                                  | Auth0 application client ID            |
| `FRONTEND_URL`               | No       | —                                  | Allowed CORS origins (comma-separated) |
| `MYSQL_HOST`                 | No       | `localhost`                        | MySQL server host                      |
| `MYSQL_PORT`                 | No       | `3306`                             | MySQL server port                      |
| `MYSQL_USER`                 | No       | `root`                             | MySQL username                         |
| `MYSQL_PASSWORD`             | No       | (empty)                            | MySQL password                         |
| `MYSQL_DATABASE`             | No       | `it_support_ticket`                | MySQL database name                    |
| `AI_MAX_CONCURRENT_REQUESTS` | No       | `4`                                | Max parallel AI requests               |
| `AI_MAX_QUEUE_SIZE`          | No       | `20`                               | Max queued AI requests                 |
| `AI_QUEUE_WAIT_TIMEOUT_MS`   | No       | `15000`                            | Queue wait timeout (ms)                |
| `AI_REQUEST_TIMEOUT_MS`      | No       | `70000`                            | AI request timeout (ms)                |
| `PORT`                       | No       | `3000`                             | Server port                            |

### Frontend (`app/`)

Auth0 settings are hardcoded in `app/src/app/app.settings.ts`:

- Auth0 Domain: `dev-hte6ekrcmpejgmww.au.auth0.com`
- Auth0 Client ID: `LrqtZdycPuTrOrAPqSHorJiWqFMgvuD2`

API URL is in environment files:

- Dev: `http://localhost:3000` (in `environment.ts`)
- Prod: `https://sti-ai.onrender.com` (in `environment.prod.ts`)

---

## How to Run Locally

### Prerequisites

- Node.js (v18+)
- MySQL server running with `it_support_ticket` database and `synthetic_it_support_tickets` table loaded
- Supabase project set up with schema from `supabase/schema.sql`
- Auth0 application configured
- Hugging Face account with API token

### Start the Backend

```bash
cd api
npm install
# Create .env file with required variables (see Environment Variables section)
npm start
```

Server starts at http://localhost:3000.

### Start the Frontend

```bash
cd app
npm install
npm start
```

App opens at http://localhost:4200.

---

## Change Log

> Every time a file is added, removed, or significantly changed, add an entry here.

| Date       | What Changed                | Files Affected                                                                                                                                                                                                                                                                                                                                                                                | Description                                                                                                                                                                                                                                                                                                  |
| ---------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-03-25 | NL-to-SQL pipeline created  | `api/src/tickets/ask-database.ts` (new), `api/src/tickets/nl-sql.service.ts` (new), `api/src/tickets/nl-sql.controller.ts` (new), `api/src/app.module.ts` (updated)                                                                                                                                                                                                                           | Added natural language to SQL translation pipeline. Users can ask questions in plain English and get answers from the ticket database.                                                                                                                                                                       |
| 2026-03-25 | Frontend switched to NL-SQL | `app/src/app/services/ticket-chat.service.ts` (updated), `app/src/app/ticket-chat/ticket-chat.component.ts` (updated)                                                                                                                                                                                                                                                                         | Ticket chat now calls `/nl-sql` instead of old `/ticket-chat` keyword search endpoint. Loading labels updated to show SQL pipeline progress.                                                                                                                                                                 |
| 2026-03-25 | Console logging added       | `api/src/tickets/nl-sql.service.ts`, `api/src/tickets/nl-sql.controller.ts`, `api/src/tickets/ticket-chat.controller.ts`, `api/src/tickets/ticket-lookup.service.ts`                                                                                                                                                                                                                          | Added step-by-step console.log at every pipeline stage for debugging.                                                                                                                                                                                                                                        |
| 2026-03-25 | HuggingFace provider fix    | `api/src/tickets/nl-sql.service.ts` (updated), `api/src/tickets/ask-database.ts` (updated)                                                                                                                                                                                                                                                                                                    | Replaced LangChain's HuggingFaceInference (text-generation task) with `HfInference.chatCompletion()` (conversational task) to fix provider compatibility with novita.                                                                                                                                        |
| 2026-03-25 | Project documentation added | `PROJECT-DOCS.md` (new)                                                                                                                                                                                                                                                                                                                                                                       | This file. Explains every file, every flow, and how the whole system works.                                                                                                                                                                                                                                  |
| 2026-03-25 | Ticket chat history sidebar | `supabase/schema.sql` (updated), `api/src/chat/chat.persistence.service.ts` (updated), `api/src/tickets/nl-sql.controller.ts` (updated), `app/src/app/services/ticket-chat.service.ts` (updated), `app/src/app/ticket-chat/ticket-chat.component.ts` (updated), `app/src/app/ticket-chat/ticket-chat.component.html` (updated), `app/src/app/ticket-chat/ticket-chat.component.css` (updated) | Added clickable chat history sidebar to the IT Support Ticket chat, mirroring the General AI Chat. Added `chat_type` column to `chats` table. Backend now persists ticket conversations and exposes `/nl-sql/history` endpoints. Frontend shows a sidebar with past sessions that users can click to reload. |
