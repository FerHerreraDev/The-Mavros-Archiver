/**
 * Simple in-memory rate limiter
 * For production, use Upstash Redis or similar
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

class RateLimiter {
  private store = new Map<string, RateLimitEntry>()
  private readonly maxAttempts: number
  private readonly windowMs: number

  constructor(maxAttempts: number = 5, windowMs: number = 60000) {
    this.maxAttempts = maxAttempts
    this.windowMs = windowMs

    // Cleanup old entries every minute
    setInterval(() => this.cleanup(), 60000)
  }

  async limit(identifier: string): Promise<{ success: boolean; remaining: number }> {
    const now = Date.now()
    const entry = this.store.get(identifier)

    // No entry or expired - create new
    if (!entry || now > entry.resetAt) {
      this.store.set(identifier, {
        count: 1,
        resetAt: now + this.windowMs,
      })
      return { success: true, remaining: this.maxAttempts - 1 }
    }

    // Increment count
    entry.count++

    // Check if exceeded
    if (entry.count > this.maxAttempts) {
      return { success: false, remaining: 0 }
    }

    return { success: true, remaining: this.maxAttempts - entry.count }
  }

  private cleanup() {
    const now = Date.now()
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetAt) {
        this.store.delete(key)
      }
    }
  }
}

// Export singleton instance
// 5 attempts per minute per IP
export const ratelimit = new RateLimiter(5, 60000)
