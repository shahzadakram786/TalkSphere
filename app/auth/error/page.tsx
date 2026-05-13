import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import Link from 'next/link'
import { AlertCircle, ArrowLeft } from 'lucide-react'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error: string }>
}) {
  const params = await searchParams

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto flex items-center justify-between px-2 sm:px-4 py-3 sm:py-4">
          <div className="flex items-center gap-2 sm:gap-4">
            <Link href="/" className="flex items-center gap-2">
              <img
                src="/Untitled design/favicon.png"
                alt="TalkSphere"
                className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-white p-1"
              />
              <h1 className="text-lg sm:text-xl font-bold">TalkSphere</h1>
            </Link>
          </div>
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" />
              <span className="ml-1 sm:ml-2 hidden sm:inline">Back to Home</span>
            </Button>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <AlertCircle className="h-12 w-12 text-destructive" />
            </div>
            <CardTitle className="text-2xl">Something went wrong</CardTitle>
            <CardDescription>
              {params?.error ? `Error: ${params.error}` : 'An unspecified error occurred.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              We encountered an issue while processing your request. Please try again or contact support if the problem persists.
            </p>
            <div className="pt-4 space-y-2">
              <Link href="/auth/login" className="block">
                <Button className="w-full">
                  Back to Login
                </Button>
              </Link>
              <Link href="/" className="block">
                <Button variant="outline" className="w-full">
                  Go to Home
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}