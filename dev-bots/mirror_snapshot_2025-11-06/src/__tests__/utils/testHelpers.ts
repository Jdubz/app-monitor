/**
 * Enhanced Test Helpers
 *
 * Comprehensive test utilities for better test maintainability and reusability
 */

import { render, RenderOptions } from '@testing-library/react'
import { ReactElement } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { vi } from 'vitest'

// Mock data factories
export const createMockUser = (overrides = {}) => ({
  uid: 'test-user-123',
  email: 'test@example.com',
  displayName: 'Test User',
  photoURL: null,
  emailVerified: true,
  ...overrides
})

export const createMockJobMatch = (overrides = {}) => ({
  id: 'match-1',
  userId: 'test-user-123',
  queueItemId: 'queue-1',
  jobTitle: 'Senior Software Engineer',
  companyName: 'Tech Corp',
  location: 'San Francisco, CA',
  salary: '$150,000 - $200,000',
  matchScore: 85,
  status: 'new' as const,
  linkedInUrl: 'https://linkedin.com/jobs/123',
  jobDescription: 'We are looking for an experienced software engineer...',
  requirements: ['5+ years experience', 'React', 'TypeScript'],
  responsibilities: ['Build web applications', 'Mentor team members'],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  analyzed: true,
  aiMatchReasoning: 'Strong technical match',
  recommendedSkills: ['React', 'TypeScript', 'Node.js'],
  ...overrides
})

// Enhanced render function with providers
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  initialRoute?: string
  mockAuth?: any
  mockFirestore?: any
}

export function renderWithProviders(
  ui: ReactElement,
  options: CustomRenderOptions = {}
) {
  const {
    initialRoute = '/',
    mockAuth = { user: null, loading: false },
    mockFirestore = { loading: false },
    ...renderOptions
  } = options

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <BrowserRouter>
      {children}
    </BrowserRouter>
  )

  return render(ui, { wrapper: Wrapper, ...renderOptions })
}

// Form interaction helpers
export const fillForm = async (formData: Record<string, string>) => {
  const { user } = await import('@testing-library/user-event')
  const userEvent = user.setup()

  for (const [fieldName, value] of Object.entries(formData)) {
    const field = document.querySelector(`[name="${fieldName}"]`) as HTMLInputElement
    if (field) {
      await userEvent.clear(field)
      await userEvent.type(field, value)
    }
  }
}

// Wait helpers
export const waitForLoadingToFinish = async () => {
  const { waitFor } = await import('@testing-library/react')
  await waitFor(() => {
    const loadingElements = document.querySelectorAll('[data-testid*="loading"], [class*="loading"]')
    expect(loadingElements.length).toBe(0)
  })
}

// Mock API helpers
export const mockApiResponse = (data: any, delay = 0) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        ok: true,
        json: () => Promise.resolve(data),
        status: 200,
        statusText: 'OK'
      })
    }, delay)
  })
}

// Test cleanup helpers
export const cleanupMocks = () => {
  vi.clearAllMocks()
  vi.clearAllTimers()
  vi.useRealTimers()
}

// Export everything from @testing-library/react for convenience
export * from '@testing-library/react'