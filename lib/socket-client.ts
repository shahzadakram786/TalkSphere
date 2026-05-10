import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null

/**
 * Initialize Socket.io connection
 * Note: In production, deploy Socket.io server on Railway, Render, or similar
 * For now, this is a placeholder that connects to a local/external server
 */
export function initializeSocket(
  serverUrl: string = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001'
): Socket {
  if (socket) {
    return socket
  }

  socket = io(serverUrl, {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
  })

  socket.on('connect', () => {
    console.log('[v0] Socket connected:', socket?.id)
  })

  socket.on('disconnect', () => {
    console.log('[v0] Socket disconnected')
  })

  socket.on('error', (error) => {
    console.error('[v0] Socket error:', error)
  })

  return socket
}

export function getSocket(): Socket | null {
  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}

// Room events
export function joinRoom(roomId: string, userId: string, userName: string) {
  if (!socket) return

  socket.emit('join-room', { roomId, userId, userName })
}

export function leaveRoom(roomId: string) {
  if (!socket) return

  socket.emit('leave-room', { roomId })
}

// WebRTC signaling events
export function sendOffer(roomId: string, targetUserId: string, offer: any) {
  if (!socket) return

  socket.emit('webrtc-offer', { roomId, targetUserId, offer })
}

export function sendAnswer(roomId: string, targetUserId: string, answer: any) {
  if (!socket) return

  socket.emit('webrtc-answer', { roomId, targetUserId, answer })
}

export function sendIceCandidate(
  roomId: string,
  targetUserId: string,
  candidate: any
) {
  if (!socket) return

  socket.emit('webrtc-ice-candidate', { roomId, targetUserId, candidate })
}

// Setup event listeners
export function onRoomUsersUpdated(
  roomId: string,
  callback: (users: any[]) => void
) {
  if (!socket) return

  socket.on(`room:${roomId}:users-updated`, callback)
}

export function onUserJoined(
  roomId: string,
  callback: (user: any) => void
) {
  if (!socket) return

  socket.on(`room:${roomId}:user-joined`, callback)
}

export function onUserLeft(
  roomId: string,
  callback: (userId: string) => void
) {
  if (!socket) return

  socket.on(`room:${roomId}:user-left`, callback)
}

export function onWebRTCOffer(
  roomId: string,
  callback: (data: { fromUserId: string; offer: any }) => void
) {
  if (!socket) return

  socket.on(`room:${roomId}:webrtc-offer`, callback)
}

export function onWebRTCAnswer(
  roomId: string,
  callback: (data: { fromUserId: string; answer: any }) => void
) {
  if (!socket) return

  socket.on(`room:${roomId}:webrtc-answer`, callback)
}

export function onWebRTCIceCandidate(
  roomId: string,
  callback: (data: { fromUserId: string; candidate: any }) => void
) {
  if (!socket) return

  socket.on(`room:${roomId}:webrtc-ice-candidate`, callback)
}

// Cleanup
export function offRoomUsersUpdated(roomId: string) {
  if (!socket) return
  socket.off(`room:${roomId}:users-updated`)
}

export function offUserJoined(roomId: string) {
  if (!socket) return
  socket.off(`room:${roomId}:user-joined`)
}

export function offUserLeft(roomId: string) {
  if (!socket) return
  socket.off(`room:${roomId}:user-left`)
}

export function offWebRTCOffer(roomId: string) {
  if (!socket) return
  socket.off(`room:${roomId}:webrtc-offer`)
}

export function offWebRTCAnswer(roomId: string) {
  if (!socket) return
  socket.off(`room:${roomId}:webrtc-answer`)
}

export function offWebRTCIceCandidate(roomId: string) {
  if (!socket) return
  socket.off(`room:${roomId}:webrtc-ice-candidate`)
}
