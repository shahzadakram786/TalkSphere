// Supabase Realtime client - uses the existing client from supabase/client.ts
import { getSupabaseClient } from '@/lib/supabase/client'

let currentChannel: any = null
let connectionStatus: 'connected' | 'disconnected' = 'disconnected'
let eventListeners: Record<string, Function[]> = {}
let initialized = false

// Socket-like interface for compatibility with existing code
const socketProxy = {
  get connected() {
    return connectionStatus === 'connected'
  },

  on(event: string, callback: Function) {
    if (!eventListeners[event]) {
      eventListeners[event] = []
    }
    eventListeners[event].push(callback)
    return this
  },

  off(event: string, callback?: Function) {
    if (callback) {
      eventListeners[event] = eventListeners[event].filter(cb => cb !== callback)
    } else {
      delete eventListeners[event]
    }
    return this
  },

  emit(event: string, data?: any) {
    // Handled by specific functions
  }
}

/**
 * Initialize Supabase Realtime client
 * Uses the existing Supabase client from supabase/client.ts
 */
export function initializeSocket(): typeof socketProxy {
  if (initialized) {
    return socketProxy
  }

  // Use the existing Supabase client from the app
  const supabase = getSupabaseClient()
  initialized = true

  // Simulate connected status
  setTimeout(() => {
    connectionStatus = 'connected'
    eventListeners['connect']?.forEach(cb => cb())
  }, 500)

  console.log('[Supabase] Realtime client initialized')
  return socketProxy
}

export function getSocket() {
  return socketProxy
}

export function disconnectSocket() {
  const supabase = getSupabaseClient()
  if (currentChannel) {
    supabase.removeChannel(currentChannel)
    currentChannel = null
  }
  connectionStatus = 'disconnected'
  eventListeners['disconnect']?.forEach(cb => cb())
}

// Room events
export function joinRoom(roomId: string, userId: string, userName: string) {
  const supabase = getSupabaseClient()

  // Remove any existing channel
  if (currentChannel) {
    supabase.removeChannel(currentChannel)
  }

  // Create a new channel for this room
  currentChannel = supabase.channel(`room:${roomId}`, {
    config: {
      broadcast: { self: false },
      private: false,
    },
  })

  // Set up event listeners - using the newer API
  currentChannel.on('broadcast', { event: 'user-joined' }, (payload: any) => {
    eventListeners['user-joined']?.forEach(cb => cb(payload.payload))
    eventListeners[`room:${roomId}:user-joined`]?.forEach(cb => cb(payload.payload))
  })
  .on('broadcast', { event: 'user-left' }, (payload: any) => {
    eventListeners['user-left']?.forEach(cb => cb(payload.payload.userId))
    eventListeners[`room:${roomId}:user-left`]?.forEach(cb => cb(payload.payload.userId))
  })
  .on('broadcast', { event: 'room-users' }, (payload: any) => {
    eventListeners['room-users']?.forEach(cb => cb(payload.payload))
    eventListeners[`room:${roomId}:room-users`]?.forEach(cb => cb(payload.payload))
  })
  .on('broadcast', { event: 'webrtc-offer' }, (payload: any) => {
    eventListeners['webrtc-offer']?.forEach(cb => cb({
      fromUserId: payload.payload.senderUserId,
      targetUserId: payload.payload.targetUserId,
      offer: payload.payload.offer
    }))
    eventListeners[`room:${roomId}:webrtc-offer`]?.forEach(cb => cb({
      fromUserId: payload.payload.senderUserId,
      targetUserId: payload.payload.targetUserId,
      offer: payload.payload.offer
    }))
  })
  .on('broadcast', { event: 'webrtc-answer' }, (payload: any) => {
    eventListeners['webrtc-answer']?.forEach(cb => cb({
      fromUserId: payload.payload.senderUserId,
      targetUserId: payload.payload.targetUserId,
      answer: payload.payload.answer
    }))
    eventListeners[`room:${roomId}:webrtc-answer`]?.forEach(cb => cb({
      fromUserId: payload.payload.senderUserId,
      targetUserId: payload.payload.targetUserId,
      answer: payload.payload.answer
    }))
  })
  .on('broadcast', { event: 'webrtc-ice-candidate' }, (payload: any) => {
    eventListeners['webrtc-ice-candidate']?.forEach(cb => cb({
      fromUserId: payload.payload.senderUserId,
      targetUserId: payload.payload.targetUserId,
      candidate: payload.payload.candidate
    }))
    eventListeners[`room:${roomId}:webrtc-ice-candidate`]?.forEach(cb => cb({
      fromUserId: payload.payload.senderUserId,
      targetUserId: payload.payload.targetUserId,
      candidate: payload.payload.candidate
    }))
  })

  // Join the channel
  currentChannel.subscribe((status: string) => {
    if (status === 'SUBSCRIBED') {
      console.log('[Supabase] Joined room:', roomId)
      connectionStatus = 'connected'
      eventListeners['connect']?.forEach(cb => cb())

      // Broadcast join event to other users in the room
      currentChannel.send({
        type: 'broadcast',
        event: 'user-joined',
        payload: { userId, userName },
      })
    } else if (status === 'CHANNEL_ERROR') {
      console.error('[Supabase] Channel error:', status)
      connectionStatus = 'disconnected'
    }
  })
}

export function leaveRoom(roomId: string) {
  const supabase = getSupabaseClient()
  if (!currentChannel) return

  currentChannel.send({
    type: 'broadcast',
    event: 'user-left',
    payload: { userId: '' },
  })

  supabase.removeChannel(currentChannel)
  currentChannel = null
  connectionStatus = 'disconnected'
}

// WebRTC signaling events
export function sendOffer(roomId: string, senderUserId: string, targetUserId: string, offer: any) {
  if (!currentChannel) return
  console.log('[Supabase] Sending offer from:', senderUserId, 'to:', targetUserId)

  currentChannel.send({
    type: 'broadcast',
    event: 'webrtc-offer',
    payload: { senderUserId, targetUserId, offer },
  })
}

export function sendAnswer(roomId: string, senderUserId: string, targetUserId: string, answer: any) {
  if (!currentChannel) return
  console.log('[Supabase] Sending answer from:', senderUserId, 'to:', targetUserId)

  currentChannel.send({
    type: 'broadcast',
    event: 'webrtc-answer',
    payload: { senderUserId, targetUserId, answer },
  })
}

export function sendIceCandidate(
  roomId: string,
  senderUserId: string,
  targetUserId: string,
  candidate: any
) {
  if (!currentChannel) return
  console.log('[Supabase] Sending ICE from:', senderUserId, 'to:', targetUserId)

  currentChannel.send({
    type: 'broadcast',
    event: 'webrtc-ice-candidate',
    payload: { senderUserId, targetUserId, candidate },
  })
}

// Setup event listeners - for compatibility
export function onRoomUsersUpdated(
  roomId: string,
  callback: (users: any[]) => void
) {
  const listener = (payload: any) => callback(payload)
  eventListeners[`room:${roomId}:users-updated`] = eventListeners[`room:${roomId}:users-updated`] || []
  eventListeners[`room:${roomId}:users-updated`].push(listener)
}

export function onUserJoined(
  roomId: string,
  callback: (user: any) => void
) {
  eventListeners[`room:${roomId}:user-joined`] = eventListeners[`room:${roomId}:user-joined`] || []
  eventListeners[`room:${roomId}:user-joined`].push(callback)
}

export function onUserLeft(
  roomId: string,
  callback: (userId: string) => void
) {
  eventListeners[`room:${roomId}:user-left`] = eventListeners[`room:${roomId}:user-left`] || []
  eventListeners[`room:${roomId}:user-left`].push(callback)
}

export function onRoomUsers(
  roomId: string,
  callback: (users: any[]) => void
) {
  eventListeners[`room:${roomId}:room-users`] = eventListeners[`room:${roomId}:room-users`] || []
  eventListeners[`room:${roomId}:room-users`].push(callback)
}

export function onWebRTCOffer(
  roomId: string,
  callback: (data: { fromUserId: string; targetUserId: string; offer: any }) => void
) {
  eventListeners[`room:${roomId}:webrtc-offer`] = eventListeners[`room:${roomId}:webrtc-offer`] || []
  eventListeners[`room:${roomId}:webrtc-offer`].push(callback)
}

export function onWebRTCAnswer(
  roomId: string,
  callback: (data: { fromUserId: string; targetUserId: string; answer: any }) => void
) {
  eventListeners[`room:${roomId}:webrtc-answer`] = eventListeners[`room:${roomId}:webrtc-answer`] || []
  eventListeners[`room:${roomId}:webrtc-answer`].push(callback)
}

export function onWebRTCIceCandidate(
  roomId: string,
  callback: (data: { fromUserId: string; targetUserId: string; candidate: any }) => void
) {
  eventListeners[`room:${roomId}:webrtc-ice-candidate`] = eventListeners[`room:${roomId}:webrtc-ice-candidate`] || []
  eventListeners[`room:${roomId}:webrtc-ice-candidate`].push(callback)
}

// Cleanup
export function offRoomUsersUpdated(roomId: string) {
  delete eventListeners[`room:${roomId}:users-updated`]
}

export function offUserJoined(roomId: string) {
  delete eventListeners[`room:${roomId}:user-joined`]
}

export function offUserLeft(roomId: string) {
  delete eventListeners[`room:${roomId}:user-left`]
}

export function offWebRTCOffer(roomId: string) {
  delete eventListeners[`room:${roomId}:webrtc-offer`]
}

export function offWebRTCAnswer(roomId: string) {
  delete eventListeners[`room:${roomId}:webrtc-answer`]
}

export function offWebRTCIceCandidate(roomId: string) {
  delete eventListeners[`room:${roomId}:webrtc-ice-candidate`]
}

