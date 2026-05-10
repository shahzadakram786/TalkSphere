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
import { CheckCircle } from 'lucide-react'

export default function SignUpSuccess() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
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
              <Button variant="outline" className="w-full">
                Back to Login
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
    </div>
  )
}
