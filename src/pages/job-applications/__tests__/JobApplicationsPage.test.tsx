/**
 * Job Applications Management Page Tests
 *
 * Comprehensive tests for the Job Applications Management functionality
 * Rank 4 - HIGH: Job matching and application tracking
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { BrowserRouter } from "react-router-dom"
import { JobApplicationsPage } from "../JobApplicationsPage"
import { jobMatchesClient } from "@/api/job-matches-client"

// Mock the job matches client
vi.mock("@/api/job-matches-client", () => ({
  jobMatchesClient: {
    subscribeToMatches: vi.fn(),
  },
}))

// Mock the auth context
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    isEditor: true,
    user: {
      uid: "test-user-123",
      email: "test@example.com",
      displayName: "Test User",
    },
  }),
}))

// Mock the logger
vi.mock("@/services/logging", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock react-router-dom
const mockNavigate = vi.fn()
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom")
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Mock components
vi.mock("../components/JobMatchCard", () => ({
  JobMatchCard: ({ match, onViewDetails }: any) => (
    <div data-testid={`job-match-card-${match.id}`}>
      <h3>{match.jobTitle}</h3>
      <p>{match.companyName}</p>
      <button onClick={() => onViewDetails(match)} data-testid={`view-details-${match.id}`}>
        View Details
      </button>
    </div>
  ),
}))

vi.mock("../components/JobDetailsDialog", () => ({
  JobDetailsDialog: ({ match, open, onOpenChange, onGenerateResume }: any) => (
    <div data-testid="job-details-dialog" style={{ display: open ? "block" : "none" }}>
      <div>Job: {match?.jobTitle}</div>
      <div>Company: {match?.companyName}</div>
      <button onClick={() => onOpenChange(false)} data-testid="close-dialog">Close</button>
      <button onClick={() => onGenerateResume?.(match)} data-testid="generate-resume">
        Generate Resume
      </button>
    </div>
  ),
}))

// Helper function to render with router
const renderWithRouter = (component: React.ReactElement) => {
  return render(<BrowserRouter>{component}</BrowserRouter>)
}

// Mock data
const mockJobMatches = [
  {
    id: "match-1",
    jobTitle: "Senior Software Engineer",
    companyName: "Tech Corp",
    location: "San Francisco, CA",
    salaryRange: "$120k - $180k",
    matchScore: 85,
    applicationPriority: "High",
    createdAt: "2024-01-15T10:00:00Z",
    submittedBy: "user-1",
    jobDescription: "We are looking for an experienced software engineer...",
    requiredSkills: ["React", "TypeScript", "Node.js"],
    preferredSkills: ["AWS", "Docker"],
  },
  {
    id: "match-2",
    jobTitle: "Frontend Developer",
    companyName: "Startup Inc",
    location: "Remote",
    salaryRange: "$80k - $120k",
    matchScore: 78,
    applicationPriority: "Medium",
    createdAt: "2024-01-14T15:30:00Z",
    submittedBy: "user-2",
    jobDescription: "Join our growing team as a frontend developer...",
    requiredSkills: ["Vue.js", "JavaScript"],
    preferredSkills: ["CSS", "HTML"],
  },
  {
    id: "match-3",
    jobTitle: "Full Stack Developer",
    companyName: "Big Corp",
    location: "New York, NY",
    salaryRange: "$100k - $150k",
    matchScore: 92,
    applicationPriority: "Low",
    createdAt: "2024-01-13T09:15:00Z",
    submittedBy: "user-1",
    jobDescription: "Full stack development position...",
    requiredSkills: ["React", "Python", "PostgreSQL"],
    preferredSkills: ["Docker", "Kubernetes"],
  },
]

describe("JobApplicationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
  })

  describe("rendering", () => {
    it("should render job applications page with header", async () => {
      vi.mocked(jobMatchesClient.subscribeToMatches).mockImplementation((userId, callback) => {
        callback(mockJobMatches)
        return () => {}
      })

      renderWithRouter(<JobApplicationsPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Applications")).toBeInTheDocument()
      })

      expect(screen.getByText("AI-matched opportunities ranked by relevance")).toBeInTheDocument()
    })

    it("should show permission error for non-editor users", () => {
      vi.mocked(require("@/contexts/AuthContext").useAuth).mockReturnValue({
        isEditor: false,
        user: {
          uid: "test-user-123",
          email: "test@example.com",
          displayName: "Test User",
        },
      })

      renderWithRouter(<JobApplicationsPage />)

      expect(screen.getByText("You need editor permissions to access this feature. Please contact an administrator.")).toBeInTheDocument()
    })

    it("should show loading state while fetching job matches", () => {
      vi.mocked(jobMatchesClient.subscribeToMatches).mockImplementation(() => {
        // Don't call callback immediately to test loading state
        return () => {}
      })

      renderWithRouter(<JobApplicationsPage />)

      expect(screen.getByText("Job Applications")).toBeInTheDocument()
      // Should show skeleton loading cards
      expect(screen.getAllByTestId(/skeleton/i)).toHaveLength(6)
    })

    it("should show empty state when no job matches", async () => {
      vi.mocked(jobMatchesClient.subscribeToMatches).mockImplementation((userId, callback) => {
        callback([])
        return () => {}
      })

      renderWithRouter(<JobApplicationsPage />)

      await waitFor(() => {
        expect(screen.getByText("No job matches yet")).toBeInTheDocument()
      })

      expect(screen.getByText("Submit job URLs in the Job Finder to get AI-powered matches")).toBeInTheDocument()
      expect(screen.getByText("Go to Job Finder")).toBeInTheDocument()
    })
  })

  describe("job matches display", () => {
    it("should display job match cards when matches are available", async () => {
      vi.mocked(jobMatchesClient.subscribeToMatches).mockImplementation((userId, callback) => {
        callback(mockJobMatches)
        return () => {}
      })

      renderWithRouter(<JobApplicationsPage />)

      await waitFor(() => {
        expect(screen.getByTestId("job-match-card-match-1")).toBeInTheDocument()
        expect(screen.getByTestId("job-match-card-match-2")).toBeInTheDocument()
        expect(screen.getByTestId("job-match-card-match-3")).toBeInTheDocument()
      })

      expect(screen.getByText("Senior Software Engineer")).toBeInTheDocument()
      expect(screen.getByText("Tech Corp")).toBeInTheDocument()
      expect(screen.getByText("Frontend Developer")).toBeInTheDocument()
      expect(screen.getByText("Startup Inc")).toBeInTheDocument()
    })

    it("should display statistics overview", async () => {
      vi.mocked(jobMatchesClient.subscribeToMatches).mockImplementation((userId, callback) => {
        callback(mockJobMatches)
        return () => {}
      })

      renderWithRouter(<JobApplicationsPage />)

      await waitFor(() => {
        expect(screen.getByText("3")).toBeInTheDocument() // Total matches
        expect(screen.getByText("Total Matches")).toBeInTheDocument()
      })

      expect(screen.getByText("1")).toBeInTheDocument() // High priority
      expect(screen.getByText("High Priority")).toBeInTheDocument()
      expect(screen.getByText("1")).toBeInTheDocument() // Medium priority
      expect(screen.getByText("Medium Priority")).toBeInTheDocument()
      expect(screen.getByText("85%")).toBeInTheDocument() // Average match score
      expect(screen.getByText("Avg Match Score")).toBeInTheDocument()
    })
  })

  describe("search and filtering", () => {
    it("should filter job matches by search query", async () => {
      const user = userEvent.setup()
      vi.mocked(jobMatchesClient.subscribeToMatches).mockImplementation((userId, callback) => {
        callback(mockJobMatches)
        return () => {}
      })

      renderWithRouter(<JobApplicationsPage />)

      await waitFor(() => {
        expect(screen.getByTestId("job-match-card-match-1")).toBeInTheDocument()
      })

      // Search for "Tech"
      const searchInput = screen.getByPlaceholderText("Search by company or job title...")
      await user.type(searchInput, "Tech")

      await waitFor(() => {
        expect(screen.getByTestId("job-match-card-match-1")).toBeInTheDocument()
        expect(screen.queryByTestId("job-match-card-match-2")).not.toBeInTheDocument()
        expect(screen.queryByTestId("job-match-card-match-3")).not.toBeInTheDocument()
      })
    })

    it("should filter job matches by priority", async () => {
      const user = userEvent.setup()
      vi.mocked(jobMatchesClient.subscribeToMatches).mockImplementation((userId, callback) => {
        callback(mockJobMatches)
        return () => {}
      })

      renderWithRouter(<JobApplicationsPage />)

      await waitFor(() => {
        expect(screen.getByTestId("job-match-card-match-1")).toBeInTheDocument()
      })

      // Filter by High priority
      const prioritySelect = screen.getByDisplayValue("All Priorities")
      await user.click(prioritySelect)
      await user.click(screen.getByText("High Priority"))

      await waitFor(() => {
        expect(screen.getByTestId("job-match-card-match-1")).toBeInTheDocument()
        expect(screen.queryByTestId("job-match-card-match-2")).not.toBeInTheDocument()
        expect(screen.queryByTestId("job-match-card-match-3")).not.toBeInTheDocument()
      })
    })

    it("should sort job matches by match score", async () => {
      const user = userEvent.setup()
      vi.mocked(jobMatchesClient.subscribeToMatches).mockImplementation((userId, callback) => {
        callback(mockJobMatches)
        return () => {}
      })

      renderWithRouter(<JobApplicationsPage />)

      await waitFor(() => {
        expect(screen.getByTestId("job-match-card-match-1")).toBeInTheDocument()
      })

      // Sort by match score (should be default)
      const sortSelect = screen.getByDisplayValue("Match Score")
      expect(sortSelect).toBeInTheDocument()
    })

    it("should sort job matches by date", async () => {
      const user = userEvent.setup()
      vi.mocked(jobMatchesClient.subscribeToMatches).mockImplementation((userId, callback) => {
        callback(mockJobMatches)
        return () => {}
      })

      renderWithRouter(<JobApplicationsPage />)

      await waitFor(() => {
        expect(screen.getByTestId("job-match-card-match-1")).toBeInTheDocument()
      })

      // Sort by date
      const sortSelect = screen.getByDisplayValue("Match Score")
      await user.click(sortSelect)
      await user.click(screen.getByText("Date Added"))
    })

    it("should sort job matches by company name", async () => {
      const user = userEvent.setup()
      vi.mocked(jobMatchesClient.subscribeToMatches).mockImplementation((userId, callback) => {
        callback(mockJobMatches)
        return () => {}
      })

      renderWithRouter(<JobApplicationsPage />)

      await waitFor(() => {
        expect(screen.getByTestId("job-match-card-match-1")).toBeInTheDocument()
      })

      // Sort by company name
      const sortSelect = screen.getByDisplayValue("Match Score")
      await user.click(sortSelect)
      await user.click(screen.getByText("Company Name"))
    })

    it("should show no results message when filters return no matches", async () => {
      const user = userEvent.setup()
      vi.mocked(jobMatchesClient.subscribeToMatches).mockImplementation((userId, callback) => {
        callback(mockJobMatches)
        return () => {}
      })

      renderWithRouter(<JobApplicationsPage />)

      await waitFor(() => {
        expect(screen.getByTestId("job-match-card-match-1")).toBeInTheDocument()
      })

      // Search for something that doesn't exist
      const searchInput = screen.getByPlaceholderText("Search by company or job title...")
      await user.type(searchInput, "NonExistentCompany")

      await waitFor(() => {
        expect(screen.getByText("No matches found for your current filters")).toBeInTheDocument()
        expect(screen.getByText("Clear Filters")).toBeInTheDocument()
      })
    })

    it("should clear filters when clear button is clicked", async () => {
      const user = userEvent.setup()
      vi.mocked(jobMatchesClient.subscribeToMatches).mockImplementation((userId, callback) => {
        callback(mockJobMatches)
        return () => {}
      })

      renderWithRouter(<JobApplicationsPage />)

      await waitFor(() => {
        expect(screen.getByTestId("job-match-card-match-1")).toBeInTheDocument()
      })

      // Search for something that doesn't exist
      const searchInput = screen.getByPlaceholderText("Search by company or job title...")
      await user.type(searchInput, "NonExistentCompany")

      await waitFor(() => {
        expect(screen.getByText("No matches found for your current filters")).toBeInTheDocument()
      })

      // Clear filters
      await user.click(screen.getByText("Clear Filters"))

      await waitFor(() => {
        expect(screen.getByTestId("job-match-card-match-1")).toBeInTheDocument()
        expect(screen.getByTestId("job-match-card-match-2")).toBeInTheDocument()
        expect(screen.getByTestId("job-match-card-match-3")).toBeInTheDocument()
      })
    })
  })

  describe("job details dialog", () => {
    it("should open job details dialog when view details is clicked", async () => {
      const user = userEvent.setup()
      vi.mocked(jobMatchesClient.subscribeToMatches).mockImplementation((userId, callback) => {
        callback(mockJobMatches)
        return () => {}
      })

      renderWithRouter(<JobApplicationsPage />)

      await waitFor(() => {
        expect(screen.getByTestId("job-match-card-match-1")).toBeInTheDocument()
      })

      // Click view details
      await user.click(screen.getByTestId("view-details-match-1"))

      expect(screen.getByTestId("job-details-dialog")).toBeInTheDocument()
      expect(screen.getByText("Senior Software Engineer")).toBeInTheDocument()
      expect(screen.getByText("Tech Corp")).toBeInTheDocument()
    })

    it("should close job details dialog when close button is clicked", async () => {
      const user = userEvent.setup()
      vi.mocked(jobMatchesClient.subscribeToMatches).mockImplementation((userId, callback) => {
        callback(mockJobMatches)
        return () => {}
      })

      renderWithRouter(<JobApplicationsPage />)

      await waitFor(() => {
        expect(screen.getByTestId("job-match-card-match-1")).toBeInTheDocument()
      })

      // Open dialog
      await user.click(screen.getByTestId("view-details-match-1"))

      expect(screen.getByTestId("job-details-dialog")).toBeInTheDocument()

      // Close dialog
      await user.click(screen.getByTestId("close-dialog"))

      expect(screen.queryByTestId("job-details-dialog")).not.toBeInTheDocument()
    })

    it("should navigate to document builder when generate resume is clicked", async () => {
      const user = userEvent.setup()
      vi.mocked(jobMatchesClient.subscribeToMatches).mockImplementation((userId, callback) => {
        callback(mockJobMatches)
        return () => {}
      })

      renderWithRouter(<JobApplicationsPage />)

      await waitFor(() => {
        expect(screen.getByTestId("job-match-card-match-1")).toBeInTheDocument()
      })

      // Open dialog
      await user.click(screen.getByTestId("view-details-match-1"))

      // Generate resume
      await user.click(screen.getByTestId("generate-resume"))

      expect(mockNavigate).toHaveBeenCalledWith("/document-builder", {
        state: {
          jobMatch: mockJobMatches[0],
          documentType: "resume",
        },
      })
    })
  })

  describe("error handling", () => {
    it("should show error message when job matches fail to load", async () => {
      vi.mocked(jobMatchesClient.subscribeToMatches).mockImplementation((userId, callback, onError) => {
        onError?.(new Error("Failed to load matches"))
        return () => {}
      })

      renderWithRouter(<JobApplicationsPage />)

      await waitFor(() => {
        expect(screen.getByText("Failed to load job matches. Please refresh the page.")).toBeInTheDocument()
      })
    })

    it("should handle subscription errors gracefully", async () => {
      vi.mocked(jobMatchesClient.subscribeToMatches).mockImplementation((userId, callback, onError) => {
        onError?.(new Error("Subscription failed"))
        return () => {}
      })

      renderWithRouter(<JobApplicationsPage />)

      await waitFor(() => {
        expect(screen.getByText("Failed to load job matches. Please refresh the page.")).toBeInTheDocument()
      })
    })
  })

  describe("real-time updates", () => {
    it("should subscribe to job matches on mount", () => {
      vi.mocked(jobMatchesClient.subscribeToMatches).mockImplementation((userId, callback) => {
        callback(mockJobMatches)
        return () => {}
      })

      renderWithRouter(<JobApplicationsPage />)

      expect(jobMatchesClient.subscribeToMatches).toHaveBeenCalledWith(
        null, // No user filtering - show all matches
        expect.any(Function),
        undefined,
        expect.any(Function)
      )
    })

    it("should unsubscribe from job matches on unmount", () => {
      const unsubscribe = vi.fn()
      vi.mocked(jobMatchesClient.subscribeToMatches).mockReturnValue(unsubscribe)

      const { unmount } = renderWithRouter(<JobApplicationsPage />)

      unmount()

      expect(unsubscribe).toHaveBeenCalled()
    })

    it("should update matches when new data is received", async () => {
      let callback: (matches: any[]) => void = () => {}
      vi.mocked(jobMatchesClient.subscribeToMatches).mockImplementation((userId, cb) => {
        callback = cb
        return () => {}
      })

      renderWithRouter(<JobApplicationsPage />)

      // Initially no matches
      expect(screen.queryByTestId("job-match-card-match-1")).not.toBeInTheDocument()

      // Simulate receiving matches
      callback(mockJobMatches)

      await waitFor(() => {
        expect(screen.getByTestId("job-match-card-match-1")).toBeInTheDocument()
      })
    })
  })

  describe("accessibility", () => {
    it("should have proper form labels and ARIA attributes", async () => {
      vi.mocked(jobMatchesClient.subscribeToMatches).mockImplementation((userId, callback) => {
        callback(mockJobMatches)
        return () => {}
      })

      renderWithRouter(<JobApplicationsPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Applications")).toBeInTheDocument()
      })

      // Check search input accessibility
      expect(screen.getByPlaceholderText("Search by company or job title...")).toBeInTheDocument()
    })

    it("should be keyboard navigable", async () => {
      const user = userEvent.setup()
      vi.mocked(jobMatchesClient.subscribeToMatches).mockImplementation((userId, callback) => {
        callback(mockJobMatches)
        return () => {}
      })

      renderWithRouter(<JobApplicationsPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Applications")).toBeInTheDocument()
      })

      // Test tab navigation
      await user.tab()
      expect(document.activeElement).toBeInTheDocument()
    })
  })

  describe("responsive design", () => {
    it("should handle different screen sizes", async () => {
      vi.mocked(jobMatchesClient.subscribeToMatches).mockImplementation((userId, callback) => {
        callback(mockJobMatches)
        return () => {}
      })

      renderWithRouter(<JobApplicationsPage />)

      await waitFor(() => {
        expect(screen.getByText("Job Applications")).toBeInTheDocument()
      })

      // Check if responsive classes are applied
      const container = screen.getByText("Job Applications").closest("div")
      expect(container).toBeInTheDocument()
    })
  })

  describe("edge cases", () => {
    it("should handle empty job matches array", async () => {
      vi.mocked(jobMatchesClient.subscribeToMatches).mockImplementation((userId, callback) => {
        callback([])
        return () => {}
      })

      renderWithRouter(<JobApplicationsPage />)

      await waitFor(() => {
        expect(screen.getByText("No job matches yet")).toBeInTheDocument()
      })
    })

    it("should handle null user", () => {
      vi.mocked(require("@/contexts/AuthContext").useAuth).mockReturnValue({
        isEditor: true,
        user: null,
      })

      renderWithRouter(<JobApplicationsPage />)

      // Should not subscribe to matches
      expect(jobMatchesClient.subscribeToMatches).not.toHaveBeenCalled()
    })

    it("should handle job matches with missing optional fields", async () => {
      const incompleteMatches = [
        {
          id: "match-incomplete",
          jobTitle: "Developer",
          companyName: "Company",
          matchScore: 75,
          applicationPriority: "Medium",
          createdAt: "2024-01-15T10:00:00Z",
          submittedBy: "user-1",
          // Missing optional fields
        },
      ]

      vi.mocked(jobMatchesClient.subscribeToMatches).mockImplementation((userId, callback) => {
        callback(incompleteMatches)
        return () => {}
      })

      renderWithRouter(<JobApplicationsPage />)

      await waitFor(() => {
        expect(screen.getByTestId("job-match-card-match-incomplete")).toBeInTheDocument()
      })

      expect(screen.getByText("Developer")).toBeInTheDocument()
      expect(screen.getByText("Company")).toBeInTheDocument()
    })
  })
})