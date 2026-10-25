import { LoginForm } from '@/components/auth/login-form'

const ERROR_MESSAGES: Record<string, string> = {
  link_invalid: 'That link is invalid or has expired. Ask your administrator for a new invite.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return <LoginForm initialError={error ? ERROR_MESSAGES[error] : undefined} />
}
