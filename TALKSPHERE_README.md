# TalkSphere - Real-time Communication Platform

TalkSphere is a modern, full-stack real-time communication platform built with Next.js, Supabase, Socket.io, and WebRTC. It enables users to create rooms, discover public rooms, and communicate via text chat with support for voice and video (phase 2).

## MVP Features Implemented

### Authentication & User Management
- Email/password authentication with Supabase Auth
- User profiles with display names and avatars
- Secure session management with HTTP-only cookies
- Row Level Security (RLS) for data protection

### Room Management
- Create and host rooms with custom descriptions
- Public/private room visibility control
- Room discovery with filtering by type (general, lecture, gaming, study)
- Real-time participant tracking
- Join/leave room functionality

### Real-time Communication
- Text chat with real-time message delivery via Supabase Realtime
- Live participant presence tracking
- Message history
- Automatic scroll to latest messages

### Infrastructure
- Supabase PostgreSQL with RLS policies
- Socket.io for WebRTC signaling (ready for phase 2)
- Simple Peer library for peer-to-peer connections (ready for phase 2)
- Professional dark theme UI with Tailwind CSS

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   TalkSphere Frontend                     │
│            (Next.js 16 + React 19 + Tailwind)           │
├─────────────────────────────────────────────────────────┤
│  Dashboard → Room Discovery → Room Communication Page   │
│  (Room CRUD) (Public/Private) (Chat + WebRTC Ready)    │
└────────────┬────────────────────────────────────────────┘
             │
      ┌──────┴──────┐
      │             │
 ┌────▼────┐   ┌────▼──────────────┐
 │ Supabase │   │ Socket.io Server  │
 │PostgreSQL   │ (Railway/Render)   │
 │  + RLS   │   │ (External Deploy) │
 │ + Realtime  │ │ (Phase 2)         │
 └──────────┘   └───────────────────┘
      │
 ┌────▼────────────────────────────┐
 │  WebRTC P2P (Simple Peer)       │
 │  (Phase 2 - Audio/Video)        │
 └─────────────────────────────────┘
```

## Database Schema

### Tables
- `users` - User profiles (extends auth.users)
- `rooms` - Chat rooms with metadata
- `room_participants` - Active participants per room
- `messages` - Chat message history
- `room_invites` - Room invitation system

### RLS Policies
All tables have Row Level Security enabled:
- Users can view all public profiles
- Users can only modify their own data
- Messages are visible only to room participants
- Rooms are visible based on privacy settings

## Getting Started

### Prerequisites
- Node.js 18+
- Supabase account (database configured)
- Socket.io server (for production - Phase 2)

### Environment Variables
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001  # Phase 2
NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL=http://localhost:3000/auth/callback
```

### Installation
```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Build for production
pnpm build
```

### Access the App
- Frontend: http://localhost:3000
- Auth: http://localhost:3000/auth/login
- Dashboard: http://localhost:3000/ (protected)

## Phase 2: Advanced Features (Deferred)

### WebRTC Implementation
- Real-time audio/video peer-to-peer connections
- Screen sharing capabilities
- Simple Peer signaling through Socket.io
- STUN/TURN server configuration

### AI Features
- Whisper speech-to-text transcription
- Claude-powered speech coaching
- DeepL translation for international communication

### Advanced Moderation
- Content filtering and moderation
- User blocking and reporting
- Room access controls

### Scheduling
- Schedule rooms for later
- Calendar integration
- Reminders and notifications

## Socket.io Server Setup (Phase 2)

The external Socket.io server will handle:
- WebRTC signaling (offers, answers, ICE candidates)
- Room presence management
- Real-time event broadcasting

Deploy on Railway, Render, or similar platforms.

## File Structure

```
/vercel/share/v0-project/
├── app/
│   ├── auth/
│   │   ├── login/
│   │   ├── sign-up/
│   │   ├── callback/
│   │   └── error/
│   ├── room/[id]/
│   │   └── page.tsx
│   ├── page.tsx          # Dashboard
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── dashboard.tsx     # Room discovery & creation
│   ├── room-page.tsx     # Room communication
│   └── ui/              # shadcn components
├── lib/
│   ├── supabase/        # Supabase clients
│   ├── socket-client.ts  # Socket.io utilities
│   └── webrtc-manager.ts # WebRTC peer management
├── middleware.ts         # Session management
└── package.json
```

## Key Implementation Details

### Authentication Flow
1. User signs up with email, username, display_name
2. Database trigger auto-creates user profile
3. Auth callback exchanges code for session
4. Middleware protects routes
5. Supabase RLS enforces data access

### Room Communication
1. Join room creates participant record
2. Supabase Realtime broadcasts participant changes
3. Chat messages stored and retrieved from database
4. Simple Peer creates WebRTC connections (Phase 2)
5. Socket.io handles WebRTC signaling

### WebRTC Signaling (Phase 2)
- User joins room → Socket.io notifies others
- New user initiates peer connections to existing participants
- Offers/answers/ICE candidates exchanged via Socket.io
- Full mesh topology for small rooms

## Security Considerations

- All data protected by Supabase RLS
- WebRTC connections are peer-to-peer (end-to-end)
- Session tokens stored in HTTP-only cookies
- User metadata validated on signup
- CSRF protection via middleware
- Environment variables never exposed to client

## Performance Optimizations

- Real-time updates via Supabase Realtime (no polling)
- Efficient participant tracking with left_at tracking
- Message pagination ready (infinite scroll)
- Component code splitting with Next.js
- CSS-in-JS minimized with Tailwind

## Troubleshooting

### WebRTC Not Connecting (Phase 2)
- Verify Socket.io server is running
- Check browser console for signaling errors
- Ensure STUN servers are accessible

### Messages Not Loading
- Check Supabase database connection
- Verify RLS policies allow message access
- Check browser DevTools Network tab

### Auth Issues
- Verify email confirmation if required
- Check NEXT_PUBLIC_SUPABASE_REDIRECT_URL
- Clear cookies and try again

## Next Steps

1. Deploy Socket.io server to production
2. Integrate WebRTC video/audio
3. Add Whisper speech transcription
4. Implement user presence indicators
5. Add room scheduling
6. Deploy to production with Vercel

## Support

For issues or questions, refer to:
- Supabase docs: https://supabase.com/docs
- Socket.io docs: https://socket.io/docs
- Simple Peer docs: https://github.com/feross/simple-peer
- Next.js docs: https://nextjs.org/docs

---

Built with Next.js, Supabase, Socket.io, and WebRTC
