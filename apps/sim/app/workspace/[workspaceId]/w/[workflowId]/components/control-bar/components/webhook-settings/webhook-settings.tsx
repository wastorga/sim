'use client'

import { useEffect, useState } from 'react'
import {
  AlertCircle,
  Bell,
  Check,
  CheckCircle,
  Copy,
  Edit2,
  Eye,
  EyeOff,
  Plus,
  RefreshCw,
  Trash2,
  Webhook,
  X,
} from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui'
import { createLogger } from '@/lib/logs/console/logger'
import { generatePassword } from '@/lib/utils'
import type {
  LogLevel as StoreLogLevel,
  TriggerType as StoreTriggerType,
} from '@/stores/logs/filters/types'

const logger = createLogger('WebhookSettings')

type NotificationLogLevel = Exclude<StoreLogLevel, 'all'>
type NotificationTrigger = Exclude<StoreTriggerType, 'all'>
type TabView = 'active' | 'create'

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
  const [activeTab, setActiveTab] = useState<TabView>('create')
  const [copySuccess, setCopySuccess] = useState(false)
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
        // Set initial tab based on whether webhooks exist
        if (list.length > 0) {
          setActiveTab('active')
        } else {
          setActiveTab('create')
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
        setActiveTab('active')
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
        setOperationStatus({
          type: 'success',
          message: 'Webhook deleted',
        })
      } else {
        setOperationStatus({
          type: 'error',
          message: 'Failed to delete webhook',
        })
      }
    } catch (error) {
      logger.error('Failed to delete webhook', { error })
      setOperationStatus({
        type: 'error',
        message: 'Failed to delete webhook',
      })
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
    setOperationStatus({
      type: 'success',
      message: 'Secret copied to clipboard',
    })
    setTimeout(() => {
      setCopySuccess(false)
      setOperationStatus({ type: null, message: '' })
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
  }

  const handleCloseModal = () => {
    cancelEdit()
    setOperationStatus({ type: null, message: '' })
    setTestStatus(null)
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
        setActiveTab('active')
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
      <DialogContent
        className='flex max-h-[78vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[600px]'
        hideCloseButton
      >
        <DialogHeader className='flex-shrink-0 border-b px-6 py-4'>
          <div className='flex items-center justify-between'>
            <DialogTitle className='font-medium text-lg'>Webhook Notifications</DialogTitle>
            <Button variant='ghost' size='icon' className='h-8 w-8 p-0' onClick={handleCloseModal}>
              <X className='h-4 w-4' />
              <span className='sr-only'>Close</span>
            </Button>
          </div>
        </DialogHeader>

        {/* Success/Error Messages */}
        {operationStatus.type && (
          <div className='flex-shrink-0 px-6 pt-4'>
            {operationStatus.type === 'success' ? (
              <div className='rounded-[8px] border border-green-200 bg-green-50 p-4 dark:border-green-800/50 dark:bg-green-950/20'>
                <div className='flex items-start gap-2'>
                  <CheckCircle className='mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-400' />
                  <p className='text-green-800 text-sm dark:text-green-300'>
                    {operationStatus.message}
                  </p>
                </div>
              </div>
            ) : (
              <div className='rounded-[8px] border border-red-200 bg-red-50 p-4 dark:border-red-800/50 dark:bg-red-950/20'>
                <div className='flex items-start gap-2'>
                  <AlertCircle className='mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400' />
                  <p className='text-red-800 text-sm dark:text-red-300'>
                    {operationStatus.message}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        <div className='flex flex-1 flex-col overflow-hidden'>
          <div className='flex h-14 flex-none items-center border-b px-6'>
            <div className='flex gap-2'>
              <button
                onClick={() => setActiveTab('active')}
                className={`rounded-md px-3 py-1 text-sm transition-colors ${
                  activeTab === 'active'
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                }`}
              >
                Active Webhooks
              </button>
              <button
                onClick={() => setActiveTab('create')}
                className={`rounded-md px-3 py-1 text-sm transition-colors ${
                  activeTab === 'create'
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                }`}
              >
                {editingWebhookId ? 'Edit Webhook' : 'Create New'}
              </button>
            </div>
          </div>

          <div className='flex-1 overflow-y-auto'>
            <div className='p-6'>
              {activeTab === 'active' && (
                <>
                  {isLoading ? (
                    <div className='flex items-center justify-center py-8'>
                      <RefreshCw className='h-5 w-5 animate-spin text-muted-foreground' />
                    </div>
                  ) : webhooks.length === 0 ? (
                    <div className='flex flex-col items-center justify-center py-12 text-center'>
                      <Webhook className='h-12 w-12 text-muted-foreground/50' />
                      <h3 className='mt-4 font-medium text-lg'>No webhooks configured</h3>
                      <p className='mt-2 max-w-sm text-muted-foreground text-sm'>
                        Create your first webhook to receive notifications when workflow executions
                        complete.
                      </p>
                      <Button onClick={() => setActiveTab('create')} className='mt-4 gap-2'>
                        <Plus className='h-4 w-4' />
                        Create Webhook
                      </Button>
                    </div>
                  ) : (
                    <div className='space-y-3'>
                      {webhooks.map((webhook) => (
                        <div key={webhook.id} className='space-y-2'>
                          <div className='flex items-center justify-between gap-4 rounded-lg border p-4'>
                            <div className='flex items-center gap-3'>
                              <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-muted'>
                                <Webhook className='h-5 w-5' />
                              </div>
                              <div className='min-w-0'>
                                <div className='flex items-center gap-2'>
                                  <span className='truncate font-normal text-sm'>
                                    {webhook.url}
                                  </span>
                                  <span
                                    className={`h-2 w-2 rounded-full ${
                                      webhook.active ? 'bg-green-500' : 'bg-gray-400'
                                    }`}
                                  />
                                </div>
                                <p className='truncate text-muted-foreground text-xs'>
                                  {webhook.levelFilter.join(', ')} •{' '}
                                  {webhook.triggerFilter.join(', ')}
                                </p>
                              </div>
                            </div>

                            <div className='flex gap-1'>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant='ghost'
                                    size='sm'
                                    onClick={() => testWebhook(webhook.id)}
                                    disabled={isTesting === webhook.id}
                                    className='h-8'
                                  >
                                    {isTesting === webhook.id ? (
                                      <RefreshCw className='h-4 w-4 animate-spin' />
                                    ) : (
                                      <Bell className='h-4 w-4' />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {isTesting === webhook.id ? 'Testing...' : 'Test Webhook'}
                                </TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant='ghost'
                                    size='sm'
                                    onClick={() => {
                                      startEditWebhook(webhook)
                                      setActiveTab('create')
                                    }}
                                    className='h-8'
                                  >
                                    <Edit2 className='h-4 w-4' />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Edit Webhook</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant='ghost'
                                    size='sm'
                                    onClick={() => deleteWebhook(webhook.id)}
                                    className='h-8 text-muted-foreground hover:text-foreground'
                                  >
                                    <Trash2 className='h-4 w-4' />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Delete Webhook</TooltipContent>
                              </Tooltip>
                            </div>
                          </div>

                          {/* Test Status for this specific webhook */}
                          {testStatus && testStatus.webhookId === webhook.id && (
                            <div className='ml-4'>
                              {testStatus.type === 'success' ? (
                                <div className='rounded-[8px] border border-green-200 bg-green-50 p-3 dark:border-green-800/50 dark:bg-green-950/20'>
                                  <div className='flex items-start gap-2'>
                                    <CheckCircle className='mt-0.5 h-3 w-3 shrink-0 text-green-600 dark:text-green-400' />
                                    <p className='text-green-800 text-xs dark:text-green-300'>
                                      {testStatus.message}
                                    </p>
                                  </div>
                                </div>
                              ) : (
                                <div className='rounded-[8px] border border-red-200 bg-red-50 p-3 dark:border-red-800/50 dark:bg-red-950/20'>
                                  <div className='flex items-start gap-2'>
                                    <AlertCircle className='mt-0.5 h-3 w-3 shrink-0 text-red-600 dark:text-red-400' />
                                    <p className='text-red-800 text-xs dark:text-red-300'>
                                      {testStatus.message}
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {activeTab === 'create' && (
                <>
                  {/* General errors */}
                  {fieldErrors.general && fieldErrors.general.length > 0 && (
                    <div className='mb-4 rounded-[8px] border border-red-200 bg-red-50 p-4 dark:border-red-800/50 dark:bg-red-950/20'>
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

                  <div className='space-y-6'>
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
                        className='h-9'
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
                          className='h-9 pr-28'
                          autoComplete='new-password'
                          autoCorrect='off'
                          autoCapitalize='off'
                          spellCheck='false'
                          data-form-type='other'
                        />
                        <div className='absolute top-0 right-0 flex h-9'>
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
                      <Label className='font-medium text-sm'>Filter by Level</Label>
                      <div className='flex gap-2'>
                        {(['info', 'error'] as NotificationLogLevel[]).map((level) => (
                          <Button
                            key={level}
                            variant={newWebhook.levelFilter.includes(level) ? 'default' : 'outline'}
                            size='sm'
                            onClick={() => {
                              if (newWebhook.levelFilter.includes(level)) {
                                setNewWebhook({
                                  ...newWebhook,
                                  levelFilter: newWebhook.levelFilter.filter((l) => l !== level),
                                })
                              } else {
                                setNewWebhook({
                                  ...newWebhook,
                                  levelFilter: [...newWebhook.levelFilter, level],
                                })
                              }
                              setFieldErrors({ ...fieldErrors, levelFilter: undefined })
                            }}
                            className='h-8 capitalize'
                          >
                            {level}
                          </Button>
                        ))}
                      </div>
                      <p className='text-muted-foreground text-xs'>
                        Select which log levels trigger webhook notifications
                      </p>
                      {fieldErrors.levelFilter && fieldErrors.levelFilter.length > 0 && (
                        <div className='mt-1 space-y-1 text-red-400 text-xs dark:text-red-400'>
                          {fieldErrors.levelFilter.map((error, index) => (
                            <p key={index}>{error}</p>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className='space-y-3'>
                      <Label className='font-medium text-sm'>Filter by Trigger</Label>
                      <div className='flex flex-wrap gap-2'>
                        {(
                          ['api', 'webhook', 'schedule', 'manual', 'chat'] as NotificationTrigger[]
                        ).map((trigger) => (
                          <Button
                            key={trigger}
                            variant={
                              newWebhook.triggerFilter.includes(trigger) ? 'default' : 'outline'
                            }
                            size='sm'
                            onClick={() => {
                              if (newWebhook.triggerFilter.includes(trigger)) {
                                setNewWebhook({
                                  ...newWebhook,
                                  triggerFilter: newWebhook.triggerFilter.filter(
                                    (t) => t !== trigger
                                  ),
                                })
                              } else {
                                setNewWebhook({
                                  ...newWebhook,
                                  triggerFilter: [...newWebhook.triggerFilter, trigger],
                                })
                              }
                              setFieldErrors({ ...fieldErrors, triggerFilter: undefined })
                            }}
                            className='h-8 capitalize'
                          >
                            {trigger}
                          </Button>
                        ))}
                      </div>
                      <p className='text-muted-foreground text-xs'>
                        Select which triggers should send webhook notifications
                      </p>
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
                      <p className='mt-3 text-muted-foreground text-xs'>
                        By default, only basic metadata and cost information is included
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {activeTab === 'create' && (
          <div className='flex flex-shrink-0 justify-between border-t px-6 py-4'>
            <Button variant='outline' onClick={handleCloseModal}>
              Cancel
            </Button>

            <Button
              onClick={editingWebhookId ? updateWebhook : createWebhook}
              disabled={
                isCreating ||
                !newWebhook.url ||
                newWebhook.levelFilter.length === 0 ||
                newWebhook.triggerFilter.length === 0
              }
              className='gap-2 bg-[var(--brand-primary-hover-hex)] font-medium text-white shadow-[0_0_0_0_var(--brand-primary-hover-hex)] transition-all duration-200 hover:bg-[var(--brand-primary-hover-hex)] hover:shadow-[0_0_0_4px_rgba(127,47,255,0.15)] disabled:opacity-50 disabled:hover:bg-[var(--brand-primary-hover-hex)] disabled:hover:shadow-none'
            >
              {isCreating ? (
                <>
                  <RefreshCw className='mr-2 h-4 w-4 animate-spin' />
                  {editingWebhookId ? 'Updating...' : 'Creating...'}
                </>
              ) : (
                <>
                  {editingWebhookId ? (
                    <>
                      <Edit2 className='mr-2 h-4 w-4' />
                      Update Webhook
                    </>
                  ) : (
                    <>
                      <Plus className='mr-2 h-4 w-4' />
                      Create Webhook
                    </>
                  )}
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
