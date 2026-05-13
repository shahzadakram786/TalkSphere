import { Server } from 'socket.io'
import { createServer } from 'http'

const httpServer = createServer()
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
})

interface RoomUser {
  userId: string
  userName: string
  socketId: string
}

interface SocketInfo {
  socketId: string
  userId: string
  roomId: string | null
}

const rooms = new Map<string, Map<string, RoomUser>>()
const socketInfoMap = new Map<string, SocketInfo>()

io.on('connection', (socket) => {
  console.log('[Socket] Client connected:', socket.id)

  // Store socket info
  socketInfoMap.set(socket.id, {
    socketId: socket.id,
    userId: '',
    roomId: null
  })

  socket.on('join-room', ({ roomId, userId, userName }) => {
    console.log('[Socket] User joining room:', { roomId, userId, userName })

    // Update socket info
    const info = socketInfoMap.get(socket.id)
    if (info) {
      info.userId = userId
      info.roomId = roomId
    }

    socket.join(roomId)

    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Map())
    }

    const roomUsers = rooms.get(roomId)!
    const roomUser: RoomUser = {
      userId,
      userName,
      socketId: socket.id,
    }
    roomUsers.set(socket.id, roomUser)

    // Notify existing users about the new user
    socket.to(roomId).emit('user-joined', {
      userId,
      userName,
    })

    // Send list of existing users to the new user
    const existingUsers = Array.from(roomUsers.values()).filter(u => u.socketId !== socket.id)
    socket.emit('room-users', existingUsers)
  })

  socket.on('leave-room', ({ roomId }) => {
    console.log('[Socket] User leaving room:', { roomId, socketId: socket.id })

    leaveRoom(socket, roomId)
  })

  socket.on('webrtc-offer', ({ roomId, targetUserId, offer }) => {
    console.log('[Socket] WebRTC offer from:', socket.id, 'to:', targetUserId)
    const roomUsers = rooms.get(roomId)
    if (roomUsers) {
      // Find the target user
      const targetUserEntry = Array.from(roomUsers.entries()).find(
        ([, user]) => user.userId === targetUserId
      )
      if (targetUserEntry) {
        const [, targetUser] = targetUserEntry
        // Send offer to target user with the offer sender's ID
        const senderInfo = socketInfoMap.get(socket.id)
        io.to(targetUser.socketId).emit('webrtc-offer', {
          fromUserId: senderInfo?.userId || targetUserId,
          offer,
        })
        console.log('[Socket] Offer forwarded to:', targetUser.socketId)
      } else {
        console.log('[Socket] Target user not found:', targetUserId)
      }
    }
  })

  socket.on('webrtc-answer', ({ roomId, targetUserId, answer }) => {
    console.log('[Socket] WebRTC answer from:', socket.id, 'to:', targetUserId)
    const roomUsers = rooms.get(roomId)
    if (roomUsers) {
      const targetUserEntry = Array.from(roomUsers.entries()).find(
        ([, user]) => user.userId === targetUserId
      )
      if (targetUserEntry) {
        const [, targetUser] = targetUserEntry
        const senderInfo = socketInfoMap.get(socket.id)
        io.to(targetUser.socketId).emit('webrtc-answer', {
          fromUserId: senderInfo?.userId || targetUserId,
          answer,
        })
        console.log('[Socket] Answer forwarded to:', targetUser.socketId)
      }
    }
  })

  socket.on('webrtc-ice-candidate', ({ roomId, targetUserId, candidate }) => {
    console.log('[Socket] ICE candidate from:', socket.id, 'to:', targetUserId)
    const roomUsers = rooms.get(roomId)
    if (roomUsers) {
      const targetUserEntry = Array.from(roomUsers.entries()).find(
        ([, user]) => user.userId === targetUserId
      )
      if (targetUserEntry) {
        const [, targetUser] = targetUserEntry
        const senderInfo = socketInfoMap.get(socket.id)
        io.to(targetUser.socketId).emit('webrtc-ice-candidate', {
          fromUserId: senderInfo?.userId || targetUserId,
          candidate,
        })
      }
    }
  })

  socket.on('disconnect', () => {
    console.log('[Socket] Client disconnected:', socket.id)

    const info = socketInfoMap.get(socket.id)
    if (info?.roomId) {
      leaveRoom(socket, info.roomId)
    }
    socketInfoMap.delete(socket.id)
  })
})

function leaveRoom(socket: any, roomId: string | null) {
  if (!roomId) return

  const roomUsers = rooms.get(roomId)
  if (roomUsers) {
    const user = roomUsers.get(socket.id)
    roomUsers.delete(socket.id)

    if (user) {
      socket.to(roomId).emit('user-left', user.userId)
      console.log('[Socket] User left:', user.userId)
    }

    if (roomUsers.size === 0) {
      rooms.delete(roomId)
      console.log('[Socket] Room deleted:', roomId)
    }
  }

  socket.leave(roomId)
}

const PORT = process.env.SOCKET_PORT || 3001

httpServer.listen(PORT, () => {
  console.log(`[Socket] Server running on port ${PORT}`)
})

export default io