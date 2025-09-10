import { eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { getHighestPrioritySubscription } from '@/lib/billing/core/subscription'
import { createLogger } from '@/lib/logs/console/logger'
import { generateRequestId } from '@/lib/utils'
import { verifyTestWebhookToken } from '@/lib/webhooks/test-tokens'
import { executeWebhookJob } from '@/background/webhook-execution'
import { db } from '@/db'
import { webhook, workflow } from '@/db/schema'
import { RateLimiter } from '@/services/queue'

const logger = createLogger('WebhookTestReceiverAPI')

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = generateRequestId()
  try {
    const { id } = await params
    const url = new URL(request.url)
    const token = url.searchParams.get('token')
    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 401 })
    }

    const valid = await verifyTestWebhookToken(token, id)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    // Read raw body for providers that need it
    let rawBody: string
    try {
      rawBody = await request.text()
      if (!rawBody) rawBody = '{}'
    } catch {
      rawBody = '{}'
    }

    // Parse as JSON if possible; otherwise keep as text
    let body: any = {}
    try {
      body = JSON.parse(rawBody)
    } catch {
      body = { _raw: rawBody }
    }

    // Load webhook + workflow
    const rows = await db
      .select({
        webhook: webhook,
        workflow: workflow,
      })
      .from(webhook)
      .innerJoin(workflow, eq(webhook.workflowId, workflow.id))
      .where(eq(webhook.id, id))
      .limit(1)

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 })
    }

    const foundWebhook = rows[0].webhook
    const foundWorkflow = rows[0].workflow

    // Rate limiting: mirror production webhook route
    const userSubscription = await getHighestPrioritySubscription(foundWorkflow.userId)
    const rateLimiter = new RateLimiter()
    const rateLimitCheck = await rateLimiter.checkRateLimitWithSubscription(
      foundWorkflow.userId,
      userSubscription,
      'webhook',
      true
    )
    if (!rateLimitCheck.allowed) {
      logger.warn(
        `[${requestId}] Test webhook rate limit exceeded for user ${foundWorkflow.userId}`
      )
      return NextResponse.json({ message: 'Rate limit exceeded (test)' }, { status: 200 })
    }

    // Build payload for execution in test/live mode
    const payload = {
      webhookId: foundWebhook.id,
      workflowId: foundWorkflow.id,
      userId: foundWorkflow.userId,
      provider: foundWebhook.provider,
      body,
      headers: Object.fromEntries(request.headers.entries()),
      path: foundWebhook.path,
      blockId: foundWebhook.blockId,
      // Test flags
      testMode: true as const,
      executionTarget: 'live' as const,
    }

    // Execute synchronously (fire-and-forget but we can await)
    const result = await executeWebhookJob(payload as any)

    return NextResponse.json({
      success: Boolean(result?.success),
      output: result?.output || null,
      executionId: result?.executionId || null,
      executedAt: result?.executedAt || new Date().toISOString(),
      mode: 'test',
      target: 'live',
    })
  } catch (error: any) {
    logger.error(`[${requestId}] Test webhook execution failed`, error)
    return NextResponse.json({ error: error.message || 'Execution failed' }, { status: 500 })
  }
}
