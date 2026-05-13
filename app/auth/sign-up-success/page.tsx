'use client'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import Link from 'next/link'
import { CheckCircle, ArrowLeft } from 'lucide-react'

export default function SignUpSuccess() {
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
              <CheckCircle className="h-12 w-12 text-primary" />
            </div>
            <CardTitle className="text-2xl">Account Created!</CardTitle>
            <CardDescription>
              Please check your email to confirm your account
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              We&apos;ve sent a confirmation email to your email address. Click the
              link in the email to activate your account and get started with
              TalkSphere.
            </p>
            <div className="space-y-3">
              <p className="text-sm font-medium">Once confirmed, you can:</p>
              <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
                <li>Create and host voice rooms</li>
                <li>Connect with others in real-time</li>
                <li>Share and collaborate instantly</li>
              </ul>
            </div>
            <div className="pt-4 space-y-2">
              <Link href="/auth/login" className="block">
                <Button className="w-full">
                  Go to Login
                </Button>
              </Link>
              <p className="text-xs text-center text-muted-foreground">
                Didn&apos;t receive an email? Check your spam folder or{' '}
                <Link href="/auth/sign-up" className="text-primary hover:underline">
                  try again
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}