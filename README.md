```
# 🎬 The Mavros Archiver

> A high-fidelity, invite-only, self-hosted Video on Demand (VOD) platform built for edge performance and zero egress fees.

## 🏛️ Architecture & Philosophy
The Mavros Archiver is designed around a **Hybrid Serverless + Static Object Storage** architecture. It avoids the common bottleneck of passing video chunks through a Node.js server.

Instead, it leverages Next.js 16 (App Router) for Server-Side Rendering (SSR) and access control, while delegating the heavy lifting of HLS video streaming directly to the CDN (Cloudflare R2).

### Key Features:
* **Private Access:** Strict invite-only authentication managed via Supabase Admin API and Row Level Security (RLS).
* **Cinematic UI/UX:** Built with Tailwind CSS v4 featuring an OLED-optimized "Mavros" dark theme.
* **HLS Streaming:** Native support for `.m3u8` playlists and `.ts` segmented video delivery using VidStack.
* **Cost Optimized:** Utilizing Cloudflare R2 to achieve zero egress fees on high-bandwidth 4K video streams.

## 🛠️ The Golden Stack
* **Framework:** Next.js 16 (App Router) + React 19
* **Language:** TypeScript
* **Styling:** Tailwind CSS v4 + Lucide React
* **Database & Auth:** Supabase (PostgreSQL) + Supabase Auth (SSR)
* **Storage & CDN:** Cloudflare R2
* **Player:** VidStack

## 🚀 Local Development Setup

### 1. Clone the repository
```bash
git clone [https://github.com/your-username/the-mavros-archiver.git](https://github.com/your-username/the-mavros-archiver.git)
cd the-mavros-archiver

```

### 2\. Install dependencies

This project uses `pnpm` for strict and fast dependency management.

```
pnpm install

```

### 3\. Environment Variables

Create a `.env.local` file in the root directory and populate it with your Supabase credentials. Do **not** expose your Service Role Key to the client.

```
# Public Variables (Safe for browser)
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

# Private Variables (Server-side only)
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

```

### 4\. Run the development server

```
pnpm dev

```

Open [http://localhost:3000](https://www.google.com/search?q=http://localhost:3000&authuser=1) with your browser to see the result.

📚 Documentation & Runbooks
---------------------------

Detailed infrastructure documentation, including database schemas, RLS policies, and triggers, is maintained in our Engineering Wiki.
