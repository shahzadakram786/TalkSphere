import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import RoomPage from '@/components/room-page'

interface Props {
  params: Promise<{ id: string }>
}

export default async function Room({ params }: Props) {
  const supabase = await createClient()
  const { id: roomId } = await params

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Verify room exists and user has access
  const { data: room } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single()

  if (!room) {
    redirect('/')
  }

  // Check access: public rooms or user is in room
  if (!room.is_public) {
    const { data: participant } = await supabase
      .from('room_participants')
      .select('id')
      .eq('room_id', roomId)
      .eq('user_id', user.id)
      .single()

    if (!participant) {
      redirect('/')
    }
  }

  return <RoomPage roomId={roomId} />
}
