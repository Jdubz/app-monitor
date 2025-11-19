# Documentation Guide

**Version:** 1.0.0
**Date:** 2025-11-18
**Purpose:** To establish a strict, lean, and actionable documentation system.

---

## Philosophy: Delete First

Documentation is a liability. It goes out of date, becomes irrelevant, and creates noise. Therefore, our documentation policy is **delete-first**. If a document is not actively driving a decision or action, it should be deleted.

**There is no archive.** Archiving is a form of hoarding. If a document is not valuable enough to be kept current, it should be deleted.

---

## Document Lifecycle

1.  **Temporary by Default:** All documents are considered temporary unless explicitly designated as permanent.
2.  **Deleted Upon Completion:** When the work a document describes is complete, the document is deleted. This includes plans, technical designs, and analysis documents.
3.  **No Work Summaries:** We do not create documents that summarize completed work. The code and the commit history are the record of what was done.

---

## Permanent Documents

Only a small, strictly-defined set of documents are considered permanent. These are the foundational documents that guide the project.

-   `docs/architecture/master-design-intent.md`: The core architectural principles and philosophy of the project. This document should be extremely concise.
-   `docs/guides/DOCUMENTATION_GUIDE.md`: This document.
-   `docs/plans/PRIORITIZED_FEATURE_ROADMAP.md`: The single source of truth for all outstanding work.

---

## Directory Structure

-   `/architecture`: Contains the `master-design-intent.md`.
-   `/guides`: Contains this `DOCUMENTATION_GUIDE.md` and other essential guides.
-   `/plans`: Contains the `PRIORITIZED_FEATURE_ROADMAP.md`.
-   `/technicalDesigns`: Contains temporary, actionable technical designs for features that are *not yet implemented*.
