import SimplePeer from 'simple-peer'

interface PeerConnection {
  userId: string
  peer: SimplePeer.Instance
  stream?: MediaStream
}

export class WebRTCManager {
  private peers: Map<string, PeerConnection> = new Map()
  private localStream: MediaStream | null = null
  private peerConnections: Map<string, RTCPeerConnection> = new Map()

  /**
   * Initialize local media stream (audio and/or video)
   */
  async initializeLocalStream(
    audio: boolean = true,
    video: boolean = false
  ): Promise<MediaStream> {
    try {
      console.log('[WebRTC] Requesting media, audio:', audio, 'video:', video)
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio,
        video: video
          ? {
              width: { ideal: 1280 },
              height: { ideal: 720 },
            }
          : false,
      })
      console.log('[WebRTC] Local stream created with', this.localStream.getTracks().length, 'tracks')
      this.localStream.getTracks().forEach(track => {
        console.log('[WebRTC] Track:', track.kind, 'enabled:', track.enabled)
      })
      return this.localStream
    } catch (error) {
      console.error('[WebRTC] Error getting user media:', error)
      throw error
    }
  }

  /**
   * Stop all media tracks
   */
  stopLocalStream() {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop())
      this.localStream = null
    }
  }

  /**
   * Create a peer connection with Simple Peer
   */
  createPeerConnection(
    userId: string,
    initiator: boolean,
    onStream: (stream: MediaStream) => void,
    onSignal: (signal: any) => void,
    onError: (error: Error) => void,
    onClose: () => void
  ): SimplePeer.Instance {
    console.log('[WebRTC] Creating peer connection for:', userId, 'initiator:', initiator)

    const peer = new SimplePeer({
      initiator,
      trickle: true,
      streams: this.localStream ? [this.localStream] : [],
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
        ],
      },
    })

    peer.on('signal', (signal) => {
      console.log('[WebRTC] Signal from peer', userId, ':', signal.type || 'candidate')
      onSignal(signal)
    })

    peer.on('stream', (stream) => {
      console.log('[WebRTC] Received stream from peer', userId, 'tracks:', stream.getTracks().length)
      stream.getTracks().forEach(track => {
        console.log('[WebRTC] Remote track:', track.kind, 'enabled:', track.enabled)
      })
      onStream(stream)
    })

    peer.on('error', (error) => {
      console.error('[WebRTC] Peer error:', userId, error)
      onError(error)
    })

    peer.on('close', () => {
      console.log('[WebRTC] Peer connection closed:', userId)
      this.peers.delete(userId)
      this.peerConnections.delete(userId)
      onClose()
    })

    this.peers.set(userId, {
      userId,
      peer,
    })

    return peer
  }

  /**
   * Send signal to peer
   */
  addSignal(userId: string, signal: any) {
    const peerConnection = this.peers.get(userId)
    if (peerConnection) {
      try {
        const peer = peerConnection.peer

        // Check if we've already processed this exact signal type to avoid duplicates
        const lastSignal = (peer as any)._lastSignal
        if (lastSignal && lastSignal.type === signal.type) {
          console.log('[WebRTC] Skipping duplicate signal:', signal.type)
          return
        }

        const pc = (peer as any)._pc as RTCPeerConnection

        // If we're trying to set answer but already in stable state, skip it
        if (signal.type === 'answer' && pc) {
          if (pc.signalingState === 'stable') {
            console.log('[WebRTC] Ignoring answer - already in stable state')
            return
          }
        }

        // If we're trying to set offer but not in correct state, skip it
        if (signal.type === 'offer' && pc && pc.signalingState !== 'have-local-offer') {
          console.log('[WebRTC] Skipping offer - not in correct state:', pc.signalingState)
          return
        }

        // Store this signal to prevent duplicates
        ;(peer as any)._lastSignal = signal

        peer.signal(signal)
      } catch (error: any) {
        // Handle InvalidStateError gracefully
        if (error?.name === 'InvalidStateError') {
          console.log('[WebRTC] InvalidStateError - connection may have changed, ignoring')
          // Clear last signal so we can try again
          ;(peerConnection.peer as any)._lastSignal = null
          return
        }
        console.error('[WebRTC] Error signaling peer:', error)
      }
    } else {
      console.log('[WebRTC] No peer connection found for:', userId)
    }
  }

  /**
   * Close peer connection
   */
  closePeerConnection(userId: string) {
    const peerConnection = this.peers.get(userId)
    if (peerConnection) {
      peerConnection.peer.destroy()
      this.peers.delete(userId)
      this.peerConnections.delete(userId)
    }
  }

  /**
   * Close all peer connections
   */
  closeAllConnections() {
    this.peers.forEach((connection) => {
      connection.peer.destroy()
    })
    this.peers.clear()
    this.peerConnections.clear()
  }

  /**
   * Get all active peer connections
   */
  getPeers(): Map<string, PeerConnection> {
    return this.peers
  }

  /**
   * Check if connected to specific peer
   */
  isConnectedTo(userId: string): boolean {
    return this.peers.has(userId)
  }

  /**
   * Toggle audio track
   */
  toggleAudio(enabled: boolean) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = enabled
      })
    }
  }

  /**
   * Toggle video track
   */
  toggleVideo(enabled: boolean) {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach((track) => {
        track.enabled = enabled
      })
    }
  }

  /**
   * Update all peer connections with new stream
   * Called when local stream changes (e.g., video enabled/disabled)
   */
  updateStreamForPeers(newStream: MediaStream) {
    this.peers.forEach((connection, userId) => {
      try {
        // SimplePeer doesn't have a direct method to replace stream
        // But we can use the addStream method if available, or rebuild
        const peer = connection.peer
        const pc = (peer as any)._pc as RTCPeerConnection | undefined
        if (peer && pc) {
          // Replace video track in the sender
          const videoTrack = newStream.getVideoTracks()[0]
          const audioTrack = newStream.getAudioTracks()[0]

          pc.getSenders().forEach((sender: RTCRtpSender) => {
            if (sender.track?.kind === 'video' && videoTrack) {
              sender.replaceTrack(videoTrack)
            }
            if (sender.track?.kind === 'audio' && audioTrack) {
              sender.replaceTrack(audioTrack)
            }
          })
          console.log('[WebRTC] Updated stream for peer:', userId)
        }
      } catch (error) {
        console.error('[WebRTC] Error updating stream for peer:', userId, error)
      }
    })
  }

  /**
   * Get local stream
   */
  getLocalStream(): MediaStream | null {
    return this.localStream
  }

  /**
   * Get stats for debugging
   */
  getStats() {
    return {
      peerCount: this.peers.size,
      hasLocalStream: !!this.localStream,
      audioTracksEnabled: this.localStream
        ? this.localStream.getAudioTracks().some((t) => t.enabled)
        : false,
      videoTracksEnabled: this.localStream
        ? this.localStream.getVideoTracks().some((t) => t.enabled)
        : false,
    }
  }
}

export default WebRTCManager
