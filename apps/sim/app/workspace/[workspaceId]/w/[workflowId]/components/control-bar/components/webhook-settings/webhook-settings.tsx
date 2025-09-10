'use client'

import { useEffect, useState } from 'react'
import {
  AlertCircle,
  Check,
  Copy,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Skeleton,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui'
import { createLogger } from '@/lib/logs/console/logger'
import { cn, generatePassword } from '@/lib/utils'
import type {
  LogLevel as StoreLogLevel,
  TriggerType as StoreTriggerType,
} from '@/stores/logs/filters/types'

const logger = createLogger('WebhookSettings')

type NotificationLogLevel = Exclude<StoreLogLevel, 'all'>
type NotificationTrigger = Exclude<StoreTriggerType, 'all'>

interface WebhookConfig {
  id: string
  url: string
  includeFinalOutput: boolean
  includeTraceSpans: boolean
  includeRateLimits: boolean
  includeUsageData: boolean
  levelFilter: NotificationLogLevel[]
  triggerFilter: NotificationTrigger[]
  active: boolean
  createdAt: string
  updatedAt: string
}

interface WebhookSettingsProps {
  workflowId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function WebhookSettings({ workflowId, open, onOpenChange }: WebhookSettingsProps) {
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [isTesting, setIsTesting] = useState<string | null>(null)
  const [showSecret, setShowSecret] = useState(false)
  const [editingWebhookId, setEditingWebhookId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [copySuccess, setCopySuccess] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [operationStatus, setOperationStatus] = useState<{
    type: 'success' | 'error' | null
    message: string
  }>({ type: null, message: '' })
  const [testStatus, setTestStatus] = useState<{
    webhookId: string
    type: 'success' | 'error'
    message: string
  } | null>(null)

  interface EditableWebhookPayload {
    url: string
    secret: string
    includeFinalOutput: boolean
    includeTraceSpans: boolean
    includeRateLimits: boolean
    includeUsageData: boolean
    levelFilter: NotificationLogLevel[]
    triggerFilter: NotificationTrigger[]
  }

  // Filter webhooks based on search term
  const filteredWebhooks = webhooks.filter((webhook) =>
    webhook.url.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const [newWebhook, setNewWebhook] = useState<EditableWebhookPayload>({
    url: '',
    secret: '',
    includeFinalOutput: false,
    includeTraceSpans: false,
    includeRateLimits: false,
    includeUsageData: false,
    levelFilter: ['info', 'error'],
    triggerFilter: ['api', 'webhook', 'schedule', 'manual', 'chat'],
  })
  const [fieldErrors, setFieldErrors] = useState<{
    url?: string[]
    levelFilter?: string[]
    triggerFilter?: string[]
    general?: string[]
  }>({})

  useEffect(() => {
    if (open) {
      loadWebhooks()
    }
  }, [open, workflowId])

  const loadWebhooks = async () => {
    try {
      setIsLoading(true)
      const response = await fetch(`/api/workflows/${workflowId}/log-webhook`)
      if (response.ok) {
        const data = await response.json()
        const list: WebhookConfig[] = data.data || []
        setWebhooks(list)
        // Show form if no webhooks exist
        if (list.length === 0) {
          setShowForm(true)
        }
      }
    } catch (error) {
      logger.error('Failed to load webhooks', { error })
      setOperationStatus({
        type: 'error',
        message: 'Failed to load webhook configurations',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const createWebhook = async () => {
    setFieldErrors({}) // Clear any previous errors

    if (!newWebhook.url) {
      setFieldErrors({ url: ['Please enter a webhook URL'] })
      return
    }

    // Validate URL format
    try {
      const url = new URL(newWebhook.url)
      if (!['http:', 'https:'].includes(url.protocol)) {
        setFieldErrors({ url: ['URL must start with http:// or https://'] })
        return
      }
    } catch {
      setFieldErrors({ url: ['Please enter a valid URL (e.g., https://example.com/webhook)'] })
      return
    }

    // Validate filters are not empty
    if (newWebhook.levelFilter.length === 0) {
      setFieldErrors({ levelFilter: ['Please select at least one log level filter'] })
      return
    }

    if (newWebhook.triggerFilter.length === 0) {
      setFieldErrors({ triggerFilter: ['Please select at least one trigger filter'] })
      return
    }

    // Check for duplicate URL
    const existingWebhook = webhooks.find((w) => w.url === newWebhook.url)
    if (existingWebhook) {
      setFieldErrors({ url: ['A webhook with this URL already exists'] })
      return
    }

    try {
      setIsCreating(true)
      setFieldErrors({})
      const response = await fetch(`/api/workflows/${workflowId}/log-webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newWebhook),
      })

      if (response.ok) {
        // Refresh the webhooks list to ensure consistency and avoid duplicates
        await loadWebhooks()
        setNewWebhook({
          url: '',
          secret: '',
          includeFinalOutput: false,
          includeTraceSpans: false,
          includeRateLimits: false,
          includeUsageData: false,
          levelFilter: ['info', 'error'],
          triggerFilter: ['api', 'webhook', 'schedule', 'manual', 'chat'],
        })
        setFieldErrors({})
        setShowForm(false)
        setOperationStatus({
          type: 'success',
          message: 'Webhook created successfully',
        })
      } else {
        const error = await response.json()
        // Show detailed validation errors if available
        if (error.details && Array.isArray(error.details)) {
          const errorMessages = error.details.map((e: any) => e.message || e.path?.join('.'))
          setFieldErrors({ general: [`Validation failed: ${errorMessages.join(', ')}`] })
        } else {
          setFieldErrors({ general: [error.error || 'Failed to create webhook'] })
        }
      }
    } catch (error) {
      logger.error('Failed to create webhook', { error })
      setFieldErrors({ general: ['Failed to create webhook. Please try again.'] })
    } finally {
      setIsCreating(false)
    }
  }

  const deleteWebhook = async (webhookId: string) => {
    try {
      const response = await fetch(
        `/api/workflows/${workflowId}/log-webhook?webhookId=${webhookId}`,
        {
          method: 'DELETE',
        }
      )

      if (response.ok) {
        // Refresh the webhooks list to ensure consistency
        await loadWebhooks()
      }
    } catch (error) {
      logger.error('Failed to delete webhook', { error })
    }
  }

  const testWebhook = async (webhookId: string) => {
    try {
      setIsTesting(webhookId)
      const response = await fetch(
        `/api/workflows/${workflowId}/log-webhook/test?webhookId=${webhookId}`,
        {
          method: 'POST',
        }
      )

      if (response.ok) {
        const data = await response.json()
        if (data.data.success) {
          setTestStatus({
            webhookId,
            type: 'success',
            message: `Test webhook sent successfully (${data.data.status})`,
          })
        } else {
          setTestStatus({
            webhookId,
            type: 'error',
            message: `Test webhook failed: ${data.data.error || data.data.statusText}`,
          })
        }
      } else {
        setTestStatus({
          webhookId,
          type: 'error',
          message: 'Failed to send test webhook',
        })
      }
    } catch (error) {
      logger.error('Failed to test webhook', { error })
      setTestStatus({
        webhookId,
        type: 'error',
        message: 'Failed to test webhook',
      })
    } finally {
      setIsTesting(null)
    }
  }

  // Remove copyWebhookId function as it's not used

  const handleGeneratePassword = () => {
    const password = generatePassword(24)
    setNewWebhook({ ...newWebhook, secret: password })
    setFieldErrors({})
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopySuccess(true)
    setTimeout(() => {
      setCopySuccess(false)
    }, 2000)
  }

  const startEditWebhook = (webhook: WebhookConfig) => {
    setEditingWebhookId(webhook.id)
    setNewWebhook({
      url: webhook.url,
      secret: '', // Don't expose the existing secret
      includeFinalOutput: webhook.includeFinalOutput,
      includeTraceSpans: webhook.includeTraceSpans,
      includeRateLimits: webhook.includeRateLimits || false,
      includeUsageData: webhook.includeUsageData || false,
      levelFilter: webhook.levelFilter,
      triggerFilter: webhook.triggerFilter,
    })
    setSearchTerm('')
    setShowForm(true)
  }

  const cancelEdit = () => {
    setEditingWebhookId(null)
    setFieldErrors({})
    setOperationStatus({ type: null, message: '' })
    setNewWebhook({
      url: '',
      secret: '',
      includeFinalOutput: false,
      includeTraceSpans: false,
      includeRateLimits: false,
      includeUsageData: false,
      levelFilter: ['info', 'error'],
      triggerFilter: ['api', 'webhook', 'schedule', 'manual', 'chat'],
    })
    setShowForm(false)
  }

  const handleCloseModal = () => {
    cancelEdit()
    setOperationStatus({ type: null, message: '' })
    setTestStatus(null)
    setSearchTerm('')
    onOpenChange(false)
  }

  const updateWebhook = async () => {
    if (!editingWebhookId) return

    // Validate URL format
    try {
      const url = new URL(newWebhook.url)
      if (!['http:', 'https:'].includes(url.protocol)) {
        setFieldErrors({ url: ['URL must start with http:// or https://'] })
        return
      }
    } catch {
      setFieldErrors({ url: ['Please enter a valid URL (e.g., https://example.com/webhook)'] })
      return
    }

    // Validate filters are not empty
    if (newWebhook.levelFilter.length === 0) {
      setFieldErrors({ levelFilter: ['Please select at least one log level filter'] })
      return
    }

    if (newWebhook.triggerFilter.length === 0) {
      setFieldErrors({ triggerFilter: ['Please select at least one trigger filter'] })
      return
    }

    // Check for duplicate URL (excluding current webhook)
    const existingWebhook = webhooks.find(
      (w) => w.url === newWebhook.url && w.id !== editingWebhookId
    )
    if (existingWebhook) {
      setFieldErrors({ url: ['A webhook with this URL already exists'] })
      return
    }

    try {
      setIsCreating(true)
      interface UpdateWebhookPayload {
        url: string
        includeFinalOutput: boolean
        includeTraceSpans: boolean
        includeRateLimits: boolean
        includeUsageData: boolean
        levelFilter: NotificationLogLevel[]
        triggerFilter: NotificationTrigger[]
        secret?: string
        active?: boolean
      }

      let updateData: UpdateWebhookPayload = {
        url: newWebhook.url,
        includeFinalOutput: newWebhook.includeFinalOutput,
        includeTraceSpans: newWebhook.includeTraceSpans,
        includeRateLimits: newWebhook.includeRateLimits,
        includeUsageData: newWebhook.includeUsageData,
        levelFilter: newWebhook.levelFilter,
        triggerFilter: newWebhook.triggerFilter,
      }

      // Only include secret if it was changed
      if (newWebhook.secret) {
        updateData = { ...updateData, secret: newWebhook.secret }
      }

      const response = await fetch(`/api/workflows/${workflowId}/log-webhook/${editingWebhookId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      })

      if (response.ok) {
        await loadWebhooks()
        cancelEdit()
        setOperationStatus({
          type: 'success',
          message: 'Webhook updated successfully',
        })
      } else {
        const error = await response.json()
        setFieldErrors({ general: [error.error || 'Failed to update webhook'] })
      }
    } catch (error) {
      logger.error('Failed to update webhook', { error })
      setFieldErrors({ general: ['Failed to update webhook'] })
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleCloseModal}>
      <DialogContent className='flex h-[70vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[800px]'>
        <DialogHeader className='flex-shrink-0 border-b px-6 py-4'>
          <DialogTitle className='font-medium text-lg'>Webhook Notifications</DialogTitle>
        </DialogHeader>

        <div className='flex min-h-0 flex-1 flex-col'>
          {/* Fixed Header with Search */}
          {!showForm && (
            <div className='flex-shrink-0 px-6 pt-4 pb-2'>
              <div className='flex h-9 w-56 items-center gap-2 rounded-lg border bg-transparent pr-2 pl-3'>
                <Search className='h-4 w-4 flex-shrink-0 text-muted-foreground' strokeWidth={2} />
                <Input
                  placeholder='Search webhooks...'
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className='flex-1 border-0 bg-transparent px-0 font-[380] font-sans text-base text-foreground leading-none placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0'
                />
              </div>
            </div>
          )}

          {/* Scrollable Content */}
          <div className='scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent min-h-0 flex-1 overflow-y-auto px-6'>
            <div className='h-full py-2'>
              {!showForm ? (
                <div className='space-y-2'>
                  {isLoading ? (
                    <div className='space-y-2'>
                      {/* Show 2 skeleton webhooks */}
                      {[1, 2].map((index) => (
                        <div key={index} className='flex flex-col gap-2'>
                          <Skeleton className='h-[14px] w-[65px] rounded-[4px]' />{' '}
                          {/* WEBHOOK 1/2 label */}
                          <div className='flex flex-col gap-2'>
                            <div className='flex items-center justify-between gap-4'>
                              <div className='flex flex-1 items-center gap-3'>
                                <Skeleton className='h-8 w-[250px] rounded-[8px]' /> {/* URL */}
                              </div>
                              <div className='flex items-center gap-2'>
                                <Skeleton className='h-9 w-9 rounded-[8px]' /> {/* Test */}
                                <Skeleton className='h-9 w-9 rounded-[8px]' /> {/* Edit */}
                                <Skeleton className='h-9 w-9 rounded-[8px]' /> {/* Delete */}
                              </div>
                            </div>
                            <div className='flex flex-wrap items-center gap-2 text-xs'>
                              {/* Level filters */}
                              <Skeleton className='h-[22px] w-8 rounded-md' />
                              <Skeleton className='h-[22px] w-10 rounded-md' />
                              <Skeleton className='h-1 w-1 rounded-full' /> {/* bullet */}
                              {/* Trigger filters */}
                              <Skeleton className='h-[22px] w-6 rounded-md' />
                              <Skeleton className='h-[22px] w-14 rounded-md' />
                              <Skeleton className='h-[22px] w-14 rounded-md' />
                              <Skeleton className='h-[22px] w-12 rounded-md' />
                              <Skeleton className='h-[22px] w-8 rounded-md' />
                              <Skeleton className='h-1 w-1 rounded-full' /> {/* bullet */}
                              {/* Data options */}
                              <Skeleton className='h-[22px] w-12 rounded-md' />
                              <Skeleton className='h-[22px] w-10 rounded-md' />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : webhooks.length === 0 ? (
                    <div className='flex h-full items-center justify-center text-muted-foreground text-sm'>
                      Click "Add Webhook" below to get started
                    </div>
                  ) : (
                    <>
                      {filteredWebhooks.map((webhook, index) => (
                        <div key={webhook.id} className='relative flex flex-col gap-2'>
                          <Label className='font-normal text-muted-foreground text-xs uppercase'>
                            Webhook {index + 1}
                          </Label>
                          <div className='flex flex-col gap-2'>
                            <div className='flex items-center justify-between gap-4'>
                              <div className='flex flex-1 items-center gap-3'>
                                <div className='flex h-8 items-center rounded-[8px] bg-muted px-3'>
                                  <code className='font-mono text-foreground text-xs'>
                                    {webhook.url.length > 40
                                      ? `${webhook.url.substring(0, 37)}...`
                                      : webhook.url}
                                  </code>
                                </div>

                                {/* Test Status inline for this specific webhook */}
                                {testStatus &&
                                  testStatus.webhookId === webhook.id &&
                                  testStatus.type === 'error' && (
                                    <div className='flex items-center gap-2 text-red-600 text-xs dark:text-red-400'>
                                      <AlertCircle className='h-3 w-3 flex-shrink-0' />
                                      <span>{testStatus.message}</span>
                                    </div>
                                  )}
                              </div>

                              <div className='flex items-center gap-2'>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant='ghost'
                                      size='icon'
                                      onClick={() => testWebhook(webhook.id)}
                                      disabled={isTesting === webhook.id}
                                      className='h-9 w-9 rounded-[8px] border bg-background p-0 text-muted-foreground shadow-xs hover:bg-muted'
                                    >
                                      <RefreshCw
                                        className={cn(
                                          'h-4 w-4',
                                          isTesting === webhook.id && 'animate-spin'
                                        )}
                                      />
                                      <span className='sr-only'>Test webhook</span>
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Test</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant='ghost'
                                      size='icon'
                                      onClick={() => startEditWebhook(webhook)}
                                      className='h-9 w-9 rounded-[8px] border bg-background p-0 text-muted-foreground shadow-xs hover:bg-muted'
                                    >
                                      <Pencil className='h-4 w-4' />
                                      <span className='sr-only'>Edit webhook</span>
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Edit</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant='ghost'
                                      size='icon'
                                      onClick={() => deleteWebhook(webhook.id)}
                                      className='h-9 w-9 rounded-[8px] border bg-background p-0 text-muted-foreground shadow-xs transition-all duration-200 hover:border-red-500 hover:bg-red-500 hover:text-white'
                                    >
                                      <Trash2 className='h-4 w-4' />
                                      <span className='sr-only'>Delete webhook</span>
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Delete</TooltipContent>
                                </Tooltip>
                              </div>
                            </div>

                            <div className='flex flex-wrap items-center gap-2 text-xs'>
                              {webhook.levelFilter.map((level) => (
                                <span key={level} className='rounded-md bg-muted px-1.5 py-0.5'>
                                  {level}
                                </span>
                              ))}
                              <span className='text-muted-foreground'>•</span>
                              {webhook.triggerFilter.map((trigger) => (
                                <span key={trigger} className='rounded-md bg-muted px-1.5 py-0.5'>
                                  {trigger}
                                </span>
                              ))}
                              {(webhook.includeFinalOutput ||
                                webhook.includeTraceSpans ||
                                webhook.includeRateLimits ||
                                webhook.includeUsageData) && (
                                <>
                                  <span className='text-muted-foreground'>•</span>
                                  {webhook.includeFinalOutput && (
                                    <span className='rounded-md bg-muted px-1.5 py-0.5'>
                                      output
                                    </span>
                                  )}
                                  {webhook.includeTraceSpans && (
                                    <span className='rounded-md bg-muted px-1.5 py-0.5'>
                                      traces
                                    </span>
                                  )}
                                  {webhook.includeRateLimits && (
                                    <span className='rounded-md bg-muted px-1.5 py-0.5'>
                                      limits
                                    </span>
                                  )}
                                  {webhook.includeUsageData && (
                                    <span className='rounded-md bg-muted px-1.5 py-0.5'>usage</span>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      {/* Show message when search has no results but there are webhooks */}
                      {searchTerm.trim() &&
                        filteredWebhooks.length === 0 &&
                        webhooks.length > 0 && (
                          <div className='py-8 text-center text-muted-foreground text-sm'>
                            No webhooks found matching "{searchTerm}"
                          </div>
                        )}
                    </>
                  )}
                </div>
              ) : (
                <div className='flex flex-col gap-4 pt-1'>
                  {/* Form Header */}
                  <div>
                    <h3 className='font-medium text-base'>
                      {editingWebhookId ? 'Edit Webhook' : 'Create New Webhook'}
                    </h3>
                    <p className='text-muted-foreground text-sm'>
                      Configure webhook notifications for workflow executions
                    </p>
                  </div>

                  {/* General errors */}
                  {fieldErrors.general && fieldErrors.general.length > 0 && (
                    <div className='rounded-[8px] border border-red-200 bg-red-50 p-4 dark:border-red-800/50 dark:bg-red-950/20'>
                      <div className='flex items-start gap-2'>
                        <AlertCircle className='mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400' />
                        <div className='space-y-1 text-red-800 text-sm dark:text-red-300'>
                          {fieldErrors.general.map((error, index) => (
                            <p key={index}>{error}</p>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className='flex flex-col gap-6'>
                    <div className='space-y-2'>
                      <Label htmlFor='url' className='font-medium text-sm'>
                        Webhook URL
                      </Label>
                      <Input
                        id='url'
                        type='url'
                        placeholder='https://your-app.com/webhook'
                        value={newWebhook.url}
                        onChange={(e) => {
                          setNewWebhook({ ...newWebhook, url: e.target.value })
                          setFieldErrors({ ...fieldErrors, url: undefined })
                        }}
                        className='h-9 rounded-[8px]'
                        autoComplete='off'
                        autoCorrect='off'
                        autoCapitalize='off'
                        spellCheck='false'
                        data-form-type='other'
                      />
                      <p className='text-muted-foreground text-xs'>
                        The URL where webhook notifications will be sent
                      </p>
                      {fieldErrors.url && fieldErrors.url.length > 0 && (
                        <div className='mt-1 space-y-1 text-red-400 text-xs dark:text-red-400'>
                          {fieldErrors.url.map((error, index) => (
                            <p key={index}>{error}</p>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className='space-y-2'>
                      <Label htmlFor='secret' className='font-medium text-sm'>
                        Secret (optional)
                      </Label>
                      <div className='relative'>
                        <Input
                          id='secret'
                          type={showSecret ? 'text' : 'password'}
                          placeholder='Webhook secret for signature verification'
                          value={newWebhook.secret}
                          onChange={(e) => {
                            setNewWebhook({ ...newWebhook, secret: e.target.value })
                            setFieldErrors({ ...fieldErrors, general: undefined })
                          }}
                          className='h-9 rounded-[8px] pr-28'
                          autoComplete='new-password'
                          autoCorrect='off'
                          autoCapitalize='off'
                          spellCheck='false'
                          data-form-type='other'
                        />
                        <div className='absolute top-0 right-0 flex h-9 pr-1'>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type='button'
                                variant='ghost'
                                size='sm'
                                onClick={handleGeneratePassword}
                                className='h-9 px-2'
                              >
                                <RefreshCw className='h-4 w-4' />
                                <span className='sr-only'>Generate password</span>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Generate secure secret</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type='button'
                                variant='ghost'
                                size='sm'
                                onClick={() => copyToClipboard(newWebhook.secret)}
                                disabled={!newWebhook.secret}
                                className='h-9 px-2'
                              >
                                {copySuccess ? (
                                  <Check className='h-4 w-4' />
                                ) : (
                                  <Copy className='h-4 w-4' />
                                )}
                                <span className='sr-only'>Copy secret</span>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Copy secret</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type='button'
                                variant='ghost'
                                size='sm'
                                className='h-9 px-2'
                                onClick={() => setShowSecret(!showSecret)}
                              >
                                {showSecret ? (
                                  <EyeOff className='h-4 w-4' />
                                ) : (
                                  <Eye className='h-4 w-4' />
                                )}
                                <span className='sr-only'>
                                  {showSecret ? 'Hide secret' : 'Show secret'}
                                </span>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {showSecret ? 'Hide secret' : 'Show secret'}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                      <p className='text-muted-foreground text-xs'>
                        Used to sign webhook payloads with HMAC-SHA256
                      </p>
                    </div>

                    <div className='space-y-3'>
                      <Label className='font-medium text-sm'>Log Level Filters</Label>
                      <div className='space-y-3'>
                        {(['info', 'error'] as NotificationLogLevel[]).map((level) => (
                          <div key={level} className='flex items-center justify-between'>
                            <div className='flex flex-col'>
                              <Label className='font-normal text-sm capitalize'>{level} logs</Label>
                              <p className='text-muted-foreground text-xs'>
                                Receive notifications for {level} level logs
                              </p>
                            </div>
                            <Switch
                              checked={newWebhook.levelFilter.includes(level)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setNewWebhook({
                                    ...newWebhook,
                                    levelFilter: [...newWebhook.levelFilter, level],
                                  })
                                } else {
                                  setNewWebhook({
                                    ...newWebhook,
                                    levelFilter: newWebhook.levelFilter.filter((l) => l !== level),
                                  })
                                }
                                setFieldErrors({ ...fieldErrors, levelFilter: undefined })
                              }}
                            />
                          </div>
                        ))}
                      </div>
                      {fieldErrors.levelFilter && fieldErrors.levelFilter.length > 0 && (
                        <div className='mt-1 space-y-1 text-red-400 text-xs dark:text-red-400'>
                          {fieldErrors.levelFilter.map((error, index) => (
                            <p key={index}>{error}</p>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className='space-y-3'>
                      <Label className='font-medium text-sm'>Trigger Type Filters</Label>
                      <div className='space-y-3'>
                        {(
                          ['api', 'webhook', 'schedule', 'manual', 'chat'] as NotificationTrigger[]
                        ).map((trigger) => (
                          <div key={trigger} className='flex items-center justify-between'>
                            <div className='flex flex-col'>
                              <Label className='font-normal text-sm capitalize'>
                                {trigger} triggers
                              </Label>
                              <p className='text-muted-foreground text-xs'>
                                Notify when workflow is triggered via {trigger}
                              </p>
                            </div>
                            <Switch
                              checked={newWebhook.triggerFilter.includes(trigger)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setNewWebhook({
                                    ...newWebhook,
                                    triggerFilter: [...newWebhook.triggerFilter, trigger],
                                  })
                                } else {
                                  setNewWebhook({
                                    ...newWebhook,
                                    triggerFilter: newWebhook.triggerFilter.filter(
                                      (t) => t !== trigger
                                    ),
                                  })
                                }
                                setFieldErrors({ ...fieldErrors, triggerFilter: undefined })
                              }}
                            />
                          </div>
                        ))}
                      </div>
                      {fieldErrors.triggerFilter && fieldErrors.triggerFilter.length > 0 && (
                        <div className='mt-1 space-y-1 text-red-400 text-xs dark:text-red-400'>
                          {fieldErrors.triggerFilter.map((error, index) => (
                            <p key={index}>{error}</p>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className='space-y-3'>
                      <Label className='font-medium text-sm'>Include in Payload</Label>
                      <div className='mt-2 flex flex-col gap-3'>
                        <div className='flex items-center justify-between'>
                          <div className='flex flex-col'>
                            <Label className='font-normal text-sm'>Final output</Label>
                            <p className='text-muted-foreground text-xs'>
                              Include workflow execution results
                            </p>
                          </div>
                          <Switch
                            checked={newWebhook.includeFinalOutput}
                            onCheckedChange={(checked) =>
                              setNewWebhook({ ...newWebhook, includeFinalOutput: checked })
                            }
                          />
                        </div>
                        <div className='flex items-center justify-between'>
                          <div className='flex flex-col'>
                            <Label className='font-normal text-sm'>Trace spans</Label>
                            <p className='text-muted-foreground text-xs'>
                              Detailed execution steps
                            </p>
                          </div>
                          <Switch
                            checked={newWebhook.includeTraceSpans}
                            onCheckedChange={(checked) =>
                              setNewWebhook({ ...newWebhook, includeTraceSpans: checked })
                            }
                          />
                        </div>
                        <div className='flex items-center justify-between'>
                          <div className='flex flex-col'>
                            <Label className='font-normal text-sm'>Rate limits</Label>
                            <p className='text-muted-foreground text-xs'>
                              Workflow execution limits
                            </p>
                          </div>
                          <Switch
                            checked={newWebhook.includeRateLimits}
                            onCheckedChange={(checked) =>
                              setNewWebhook({ ...newWebhook, includeRateLimits: checked })
                            }
                          />
                        </div>
                        <div className='flex items-center justify-between'>
                          <div className='flex flex-col'>
                            <Label className='font-normal text-sm'>Usage data</Label>
                            <p className='text-muted-foreground text-xs'>
                              Billing period cost and limits
                            </p>
                          </div>
                          <Switch
                            checked={newWebhook.includeUsageData}
                            onCheckedChange={(checked) =>
                              setNewWebhook({ ...newWebhook, includeUsageData: checked })
                            }
                          />
                        </div>
                      </div>
                      <p className='mt-3 pb-2 text-muted-foreground text-xs'>
                        By default, only basic metadata and cost information is included
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className='flex-shrink-0 bg-background'>
          <div className='flex w-full items-center justify-between border-t px-6 py-4'>
            {showForm ? (
              <>
                <Button variant='outline' onClick={cancelEdit} className='h-9 rounded-[8px]'>
                  Back
                </Button>
                <Button
                  onClick={editingWebhookId ? updateWebhook : createWebhook}
                  disabled={
                    isCreating ||
                    !newWebhook.url ||
                    newWebhook.levelFilter.length === 0 ||
                    newWebhook.triggerFilter.length === 0
                  }
                  className='h-9 rounded-[8px]'
                >
                  {isCreating ? (
                    <>
                      <RefreshCw className='h-4 w-4 animate-spin' />
                      {editingWebhookId ? 'Updating...' : 'Creating...'}
                    </>
                  ) : (
                    <>{editingWebhookId ? 'Update Webhook' : 'Create Webhook'}</>
                  )}
                </Button>
              </>
            ) : isLoading ? (
              <>
                <Skeleton className='h-9 w-[117px] rounded-[8px]' />
                <div />
              </>
            ) : (
              <>
                <Button
                  onClick={() => {
                    setSearchTerm('')
                    setShowForm(true)
                  }}
                  variant='ghost'
                  className='h-9 rounded-[8px] border bg-background px-3 shadow-xs hover:bg-muted focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0'
                >
                  <Plus className='h-4 w-4 stroke-[2px]' />
                  Add Webhook
                </Button>
                <div />
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
