'use client'

import { Suspense, useEffect, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { client, useSession } from '@/lib/auth-client'
import { quickValidateEmail } from '@/lib/email/validation'
import { createLogger } from '@/lib/logs/console/logger'
import { cn } from '@/lib/utils'
import { SocialLoginButtons } from '@/app/(auth)/components/social-login-buttons'
import { soehne } from '@/app/fonts/soehne/soehne'

const logger = createLogger('SignupForm')

const PASSWORD_VALIDATIONS = {
  minLength: { regex: /.{8,}/, message: 'Password must be at least 8 characters long.' },
  uppercase: {
    regex: /(?=.*?[A-Z])/,
    message: 'Password must include at least one uppercase letter.',
  },
  lowercase: {
    regex: /(?=.*?[a-z])/,
    message: 'Password must include at least one lowercase letter.',
  },
  number: { regex: /(?=.*?[0-9])/, message: 'Password must include at least one number.' },
  special: {
    regex: /(?=.*?[#?!@$%^&*-])/,
    message: 'Password must include at least one special character.',
  },
}

const NAME_VALIDATIONS = {
  required: {
    test: (value: string) => Boolean(value && typeof value === 'string'),
    message: 'Name is required.',
  },
  notEmpty: {
    test: (value: string) => value.trim().length > 0,
    message: 'Name cannot be empty.',
  },
  validCharacters: {
    regex: /^[\p{L}\s\-']+$/u,
    message: 'Name can only contain letters, spaces, hyphens, and apostrophes.',
  },
  noConsecutiveSpaces: {
    regex: /^(?!.*\s\s).*$/,
    message: 'Name cannot contain consecutive spaces.',
  },
}

const validateEmailField = (emailValue: string): string[] => {
  const errors: string[] = []

  if (!emailValue || !emailValue.trim()) {
    errors.push('Email is required.')
    return errors
  }

  const validation = quickValidateEmail(emailValue.trim().toLowerCase())
  if (!validation.isValid) {
    errors.push(validation.reason || 'Please enter a valid email address.')
  }

  return errors
}

function SignupFormContent({
  githubAvailable,
  googleAvailable,
  isProduction,
}: {
  githubAvailable: boolean
  googleAvailable: boolean
  isProduction: boolean
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { refetch: refetchSession } = useSession()
  const [isLoading, setIsLoading] = useState(false)
  const [, setMounted] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordErrors, setPasswordErrors] = useState<string[]>([])
  const [showValidationError, setShowValidationError] = useState(false)
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [emailErrors, setEmailErrors] = useState<string[]>([])
  const [showEmailValidationError, setShowEmailValidationError] = useState(false)
  const [redirectUrl, setRedirectUrl] = useState('')
  const [isInviteFlow, setIsInviteFlow] = useState(false)

  // Name validation state
  const [name, setName] = useState('')
  const [nameErrors, setNameErrors] = useState<string[]>([])
  const [showNameValidationError, setShowNameValidationError] = useState(false)

  useEffect(() => {
    setMounted(true)
    const emailParam = searchParams.get('email')
    if (emailParam) {
      setEmail(emailParam)
    }

    // Handle redirection for invitation flow
    const redirectParam = searchParams.get('redirect')
    if (redirectParam) {
      setRedirectUrl(redirectParam)

      // Check if this is part of an invitation flow
      if (redirectParam.startsWith('/invite/')) {
        setIsInviteFlow(true)
      }
    }

    // Explicitly check for invite_flow parameter
    const inviteFlowParam = searchParams.get('invite_flow')
    if (inviteFlowParam === 'true') {
      setIsInviteFlow(true)
    }
  }, [searchParams])

  // Validate password and return array of error messages
  const validatePassword = (passwordValue: string): string[] => {
    const errors: string[] = []

    if (!PASSWORD_VALIDATIONS.minLength.regex.test(passwordValue)) {
      errors.push(PASSWORD_VALIDATIONS.minLength.message)
    }

    if (!PASSWORD_VALIDATIONS.uppercase.regex.test(passwordValue)) {
      errors.push(PASSWORD_VALIDATIONS.uppercase.message)
    }

    if (!PASSWORD_VALIDATIONS.lowercase.regex.test(passwordValue)) {
      errors.push(PASSWORD_VALIDATIONS.lowercase.message)
    }

    if (!PASSWORD_VALIDATIONS.number.regex.test(passwordValue)) {
      errors.push(PASSWORD_VALIDATIONS.number.message)
    }

    if (!PASSWORD_VALIDATIONS.special.regex.test(passwordValue)) {
      errors.push(PASSWORD_VALIDATIONS.special.message)
    }

    return errors
  }

  // Validate name and return array of error messages
  const validateName = (nameValue: string): string[] => {
    const errors: string[] = []

    if (!NAME_VALIDATIONS.required.test(nameValue)) {
      errors.push(NAME_VALIDATIONS.required.message)
      return errors // Return early for required field
    }

    if (!NAME_VALIDATIONS.notEmpty.test(nameValue)) {
      errors.push(NAME_VALIDATIONS.notEmpty.message)
      return errors // Return early for empty field
    }

    if (!NAME_VALIDATIONS.validCharacters.regex.test(nameValue.trim())) {
      errors.push(NAME_VALIDATIONS.validCharacters.message)
    }

    if (!NAME_VALIDATIONS.noConsecutiveSpaces.regex.test(nameValue)) {
      errors.push(NAME_VALIDATIONS.noConsecutiveSpaces.message)
    }

    return errors
  }

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPassword = e.target.value
    setPassword(newPassword)

    // Silently validate but don't show errors
    const errors = validatePassword(newPassword)
    setPasswordErrors(errors)
    setShowValidationError(false)
  }

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value
    setName(rawValue)

    const errors = validateName(rawValue)
    setNameErrors(errors)
    setShowNameValidationError(false)
  }

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEmail = e.target.value
    setEmail(newEmail)

    // Silently validate but don't show errors until submit
    const errors = validateEmailField(newEmail)
    setEmailErrors(errors)
    setShowEmailValidationError(false)

    // Clear any previous server-side email errors when the user starts typing
    if (emailError) {
      setEmailError('')
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsLoading(true)

    const formData = new FormData(e.currentTarget)
    const emailValue = formData.get('email') as string
    const passwordValue = formData.get('password') as string
    const nameValue = formData.get('name') as string

    const trimmedName = nameValue.trim()

    const nameValidationErrors = validateName(trimmedName)
    setNameErrors(nameValidationErrors)
    setShowNameValidationError(nameValidationErrors.length > 0)

    const emailValidationErrors = validateEmailField(emailValue)
    setEmailErrors(emailValidationErrors)
    setShowEmailValidationError(emailValidationErrors.length > 0)

    const errors = validatePassword(passwordValue)
    setPasswordErrors(errors)

    setShowValidationError(errors.length > 0)

    try {
      if (
        nameValidationErrors.length > 0 ||
        emailValidationErrors.length > 0 ||
        errors.length > 0
      ) {
        if (nameValidationErrors.length > 0) {
          setNameErrors([nameValidationErrors[0]])
          setShowNameValidationError(true)
        }
        if (emailValidationErrors.length > 0) {
          setEmailErrors([emailValidationErrors[0]])
          setShowEmailValidationError(true)
        }
        if (errors.length > 0) {
          setPasswordErrors([errors[0]])
          setShowValidationError(true)
        }
        setIsLoading(false)
        return
      }

      if (trimmedName.length > 100) {
        setNameErrors(['Name will be truncated to 100 characters. Please shorten your name.'])
        setShowNameValidationError(true)
        setIsLoading(false)
        return
      }

      const sanitizedName = trimmedName

      const response = await client.signUp.email(
        {
          email: emailValue,
          password: passwordValue,
          name: sanitizedName,
        },
        {
          onError: (ctx) => {
            logger.error('Signup error:', ctx.error)
            const errorMessage: string[] = ['Failed to create account']

            if (ctx.error.code?.includes('USER_ALREADY_EXISTS')) {
              errorMessage.push(
                'An account with this email already exists. Please sign in instead.'
              )
              setEmailError(errorMessage[0])
            } else if (
              ctx.error.code?.includes('BAD_REQUEST') ||
              ctx.error.message?.includes('Email and password sign up is not enabled')
            ) {
              errorMessage.push('Email signup is currently disabled.')
              setEmailError(errorMessage[0])
            } else if (ctx.error.code?.includes('INVALID_EMAIL')) {
              errorMessage.push('Please enter a valid email address.')
              setEmailError(errorMessage[0])
            } else if (ctx.error.code?.includes('PASSWORD_TOO_SHORT')) {
              errorMessage.push('Password must be at least 8 characters long.')
              setPasswordErrors(errorMessage)
              setShowValidationError(true)
            } else if (ctx.error.code?.includes('PASSWORD_TOO_LONG')) {
              errorMessage.push('Password must be less than 128 characters long.')
              setPasswordErrors(errorMessage)
              setShowValidationError(true)
            } else if (ctx.error.code?.includes('network')) {
              errorMessage.push('Network error. Please check your connection and try again.')
              setPasswordErrors(errorMessage)
              setShowValidationError(true)
            } else if (ctx.error.code?.includes('rate limit')) {
              errorMessage.push('Too many requests. Please wait a moment before trying again.')
              setPasswordErrors(errorMessage)
              setShowValidationError(true)
            } else {
              setPasswordErrors(errorMessage)
              setShowValidationError(true)
            }
          },
        }
      )

      if (!response || response.error) {
        setIsLoading(false)
        return
      }

      // Refresh session to get the new user data immediately after signup
      try {
        await refetchSession()
        logger.info('Session refreshed after successful signup')
      } catch (sessionError) {
        logger.error('Failed to refresh session after signup:', sessionError)
      }

      // For new signups, always require verification
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('verificationEmail', emailValue)
        localStorage.setItem('has_logged_in_before', 'true')

        // Set cookie flag for middleware check
        document.cookie = 'requiresEmailVerification=true; path=/; max-age=900; SameSite=Lax' // 15 min expiry
        document.cookie = 'has_logged_in_before=true; path=/; max-age=31536000; SameSite=Lax'

        // Store invitation flow state if applicable
        if (isInviteFlow && redirectUrl) {
          sessionStorage.setItem('inviteRedirectUrl', redirectUrl)
          sessionStorage.setItem('isInviteFlow', 'true')
        }
      }

      // Send verification OTP manually
      try {
        await client.emailOtp.sendVerificationOtp({
          email: emailValue,
          type: 'email-verification',
        })
      } catch (otpError) {
        logger.error('Failed to send OTP:', otpError)
        // Continue anyway - user can use resend button
      }

      // Always redirect to verification for new signups
      router.push('/verify?fromSignup=true')
    } catch (error) {
      logger.error('Signup error:', error)
      setIsLoading(false)
    }
  }

  return (
    <div className={`${soehne.className} space-y-6 font-light`}>
      <div className='space-y-2 text-center'>
        <h1 className='auth-text-primary font-semibold text-[32px] tracking-tight'>
          Create Account
        </h1>
        <p className='auth-text-secondary text-[16px]'>
          Enter your details to create a new account
        </p>
      </div>

      <div className='flex flex-col gap-6'>
        <div className='auth-card auth-card-shadow rounded-[10px] border p-6 backdrop-blur-sm'>
          <SocialLoginButtons
            githubAvailable={githubAvailable}
            googleAvailable={googleAvailable}
            callbackURL={redirectUrl || '/workspace'}
            isProduction={isProduction}
          />

          {(githubAvailable || googleAvailable) && (
            <div className='relative mt-2 py-4'>
              <div className='absolute inset-0 flex items-center'>
                <div className='auth-divider w-full border-t' />
              </div>
            </div>
          )}

          <form onSubmit={onSubmit} className='space-y-5'>
            <div className='space-y-4'>
              <div className='space-y-2'>
                <Label htmlFor='name' className='auth-label'>
                  Full Name
                </Label>
                <Input
                  id='name'
                  name='name'
                  placeholder='Enter your name'
                  type='text'
                  autoCapitalize='words'
                  autoComplete='name'
                  title='Name can only contain letters, spaces, hyphens, and apostrophes'
                  value={name}
                  onChange={handleNameChange}
                  className={cn(
                    'auth-input rounded-[10px] transition-colors focus:border-gray-400 focus:ring-2 focus:ring-gray-100',
                    showNameValidationError &&
                      nameErrors.length > 0 &&
                      'border-red-500 focus:border-red-500 focus:ring-red-100 focus-visible:ring-red-500'
                  )}
                />
                {showNameValidationError && nameErrors.length > 0 && (
                  <div className='mt-1 space-y-1 text-red-400 text-xs'>
                    {nameErrors.map((error, index) => (
                      <p key={index}>{error}</p>
                    ))}
                  </div>
                )}
              </div>
              <div className='space-y-2'>
                <Label htmlFor='email' className='auth-label'>
                  Email
                </Label>
                <Input
                  id='email'
                  name='email'
                  placeholder='Enter your email'
                  autoCapitalize='none'
                  autoComplete='email'
                  autoCorrect='off'
                  value={email}
                  onChange={handleEmailChange}
                  className={cn(
                    'auth-input rounded-[10px] transition-colors focus:border-gray-400 focus:ring-2 focus:ring-gray-100',
                    (emailError || (showEmailValidationError && emailErrors.length > 0)) &&
                      'border-red-500 focus:border-red-500 focus:ring-red-100 focus-visible:ring-red-500'
                  )}
                />
                {showEmailValidationError && emailErrors.length > 0 && (
                  <div className='mt-1 space-y-1 text-red-400 text-xs'>
                    {emailErrors.map((error, index) => (
                      <p key={index}>{error}</p>
                    ))}
                  </div>
                )}
                {emailError && !showEmailValidationError && (
                  <div className='mt-1 text-red-400 text-xs'>
                    <p>{emailError}</p>
                  </div>
                )}
              </div>
              <div className='space-y-2'>
                <Label htmlFor='password' className='auth-label'>
                  Password
                </Label>
                <div className='relative'>
                  <Input
                    id='password'
                    name='password'
                    type={showPassword ? 'text' : 'password'}
                    autoCapitalize='none'
                    autoComplete='new-password'
                    placeholder='Enter your password'
                    autoCorrect='off'
                    value={password}
                    onChange={handlePasswordChange}
                    className='auth-input rounded-[10px] pr-10 transition-colors focus:border-gray-400 focus:ring-2 focus:ring-gray-100'
                  />
                  <button
                    type='button'
                    onClick={() => setShowPassword(!showPassword)}
                    className='-translate-y-1/2 absolute top-1/2 right-3 text-gray-500 transition hover:text-gray-700'
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {showValidationError && passwordErrors.length > 0 && (
                  <div className='mt-1 space-y-1 text-red-400 text-xs'>
                    {passwordErrors.map((error, index) => (
                      <p key={index}>{error}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <Button
              type='submit'
              className='flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border-brand-gradient bg-brand-gradient font-medium text-[16px] text-white shadow-brand-gradient transition-all duration-200 hover:bg-brand-gradient-hover'
              disabled={isLoading}
            >
              {isLoading ? 'Creating account...' : 'Create Account'}
            </Button>
          </form>
        </div>

        <div className='text-center text-[16px]'>
          <span className='auth-text-secondary'>Already have an account? </span>
          <Link
            href={isInviteFlow ? `/login?invite_flow=true&callbackUrl=${redirectUrl}` : '/login'}
            className='font-medium text-[var(--brand-accent-hex)] underline-offset-4 transition hover:text-[var(--brand-accent-hover-hex)] hover:underline'
          >
            Sign in
          </Link>
        </div>

        <div className='auth-text-muted text-center text-[14px] leading-relaxed'>
          By creating an account, you agree to our{' '}
          <Link href='/terms' className='auth-link underline-offset-4 transition hover:underline'>
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href='/privacy' className='auth-link underline-offset-4 transition hover:underline'>
            Privacy Policy
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function SignupPage({
  githubAvailable,
  googleAvailable,
  isProduction,
}: {
  githubAvailable: boolean
  googleAvailable: boolean
  isProduction: boolean
}) {
  return (
    <Suspense
      fallback={<div className='flex h-screen items-center justify-center'>Loading...</div>}
    >
      <SignupFormContent
        githubAvailable={githubAvailable}
        googleAvailable={googleAvailable}
        isProduction={isProduction}
      />
    </Suspense>
  )
}
