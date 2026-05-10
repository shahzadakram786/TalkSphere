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
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio,
        video: video
          ? {
              width: { ideal: 1280 },
              height: { ideal: 720 },
            }
          : false,
      })
      return this.localStream
    } catch (error) {
      console.error('[v0] Error getting user media:', error)
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
    const peer = new SimplePeer({
      initiator,
      trickleIce: true,
      streams: this.localStream ? [this.localStream] : [],
      config: {
        iceServers: [
          { urls: ['stun:stun.l.google.com:19302'] },
          { urls: ['stun:stun1.l.google.com:19302'] },
        ],
      },
    })

    peer.on('signal', (signal) => {
      console.log('[v0] Signal from peer', userId, signal.type)
      onSignal(signal)
    })

    peer.on('stream', (stream) => {
      console.log('[v0] Received stream from peer', userId)
      onStream(stream)
    })

    peer.on('error', (error) => {
      console.error('[v0] Peer error:', error)
      onError(error)
    })

    peer.on('close', () => {
      console.log('[v0] Peer connection closed:', userId)
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
        peerConnection.peer.signal(signal)
      } catch (error) {
        console.error('[v0] Error signaling peer:', error)
      }
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
