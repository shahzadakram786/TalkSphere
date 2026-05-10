const { Server } = require('socket.io')

const io = new Server(3001, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
})

// Track rooms and users
const rooms = new Map()

io.on('connection', (socket) => {
  console.log('User connected:', socket.id)

  // Join a room
  socket.on('join-room', ({ roomId, userId, userName }) => {
    socket.join(roomId)

    // Track user in room
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Map())
    }
    rooms.get(roomId).set(userId, { id: socket.id, userId, userName })

    console.log(`User ${userName} (${userId}) joined room ${roomId}`)

    // Notify others in the room
    socket.to(roomId).emit(`room:${roomId}:user-joined`, {
      userId,
      userName
    })

    // Send current room users to the new user
    const roomUsers = Array.from(rooms.get(roomId).values())
    socket.emit(`room:${roomId}:users-updated`, roomUsers)
  })

  // WebRTC Offer (initiator -> target)
  socket.on('webrtc-offer', ({ roomId, targetUserId, offer }) => {
    const targetSocket = getSocketByUserId(roomId, targetUserId)
    if (targetSocket) {
      targetSocket.emit(`room:${roomId}:webrtc-offer`, {
        fromUserId: socket.id,
        offer
      })
      console.log(`Offer sent from ${socket.id} to ${targetUserId}`)
    }
  })

  // WebRTC Answer (target -> initiator)
  socket.on('webrtc-answer', ({ roomId, targetUserId, answer }) => {
    const targetSocket = getSocketByUserId(roomId, targetUserId)
    if (targetSocket) {
      targetSocket.emit(`room:${roomId}:webrtc-answer`, {
        fromUserId: socket.id,
        answer
      })
      console.log(`Answer sent from ${socket.id} to ${targetUserId}`)
    }
  })

  // WebRTC ICE Candidate
  socket.on('webrtc-ice-candidate', ({ roomId, targetUserId, candidate }) => {
    const targetSocket = getSocketByUserId(roomId, targetUserId)
    if (targetSocket) {
      targetSocket.emit(`room:${roomId}:webrtc-ice-candidate`, {
        fromUserId: socket.id,
        candidate
      })
    }
  })

  // Leave room
  socket.on('leave-room', ({ roomId }) => {
    handleUserLeave(socket, roomId)
  })

  // Disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id)
    // Remove from all rooms
    rooms.forEach((users, roomId) => {
      users.forEach((user, odUserId) => {
        if (user.id === socket.id) {
          handleUserLeave(socket, roomId)
        }
      })
    })
  })
})

function getSocketByUserId(roomId, odUserId) {
  const room = rooms.get(roomId)
  if (!room) return null

  for (const [key, user] of room) {
    if (user.userId === odUserId || user.id === odUserId) {
      // Find the actual socket by iterating through all sockets
      const sockets = io.sockets.sockets
      for (const [socketId, s] of sockets) {
        if (socketId === user.id) {
          return s
        }
      }
    }
  }
  return null
}

function handleUserLeave(socket, roomId) {
  if (rooms.has(roomId)) {
    const room = rooms.get(roomId)
    let leftUserId = null

    room.forEach((user, odUserId) => {
      if (user.id === socket.id) {
        leftUserId = odUserId
        room.delete(odUserId)
      }
    })

    if (leftUserId) {
      socket.to(roomId).emit(`room:${roomId}:user-left`, leftUserId)
      console.log(`User ${leftUserId} left room ${roomId}`)
    }

    if (room.size === 0) {
      rooms.delete(roomId)
    }
  }
  socket.leave(roomId)
}

console.log('Socket.io server running on http://localhost:3001')