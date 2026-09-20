# Gmail Inbox UI Redesign - Summary

## Overview
The Gmail Inbox UI has been redesigned to match the AIApply-style screenshot while preserving all existing functionality.

## Key Visual Changes

### Header Bar
```
┌─────────────────────────────────────────────────────────────────┐
│ Inbox  📧 user@email.com       🗓️ N Interview invitations      │
└─────────────────────────────────────────────────────────────────┘
```

### Toolbar
```
┌─────────────────────────────────────────────────────────────────┐
│ [Inbox ▼] [⚪ Unread only] [All Labels ▼] [Newest ▼]           │
│                    [Search emails...]                            │
│                              [Mark all read] [Refresh]          │
└─────────────────────────────────────────────────────────────────┘
```

### Three-Pane Layout
```
┌──────────────────┬──────────────────────────────────────┐
│  MESSAGE LIST    │    DETAIL VIEW                       │
│                  │                                       │
│ ☐ Select all     │  Subject: Job Application Update     │
│                  │  From: Recruiter Name                 │
│ ☐ [AB] Sender    │  Date: 17 Jun 2026 at 09:19         │
│    Subject       │                                       │
│    Snippet...    │  [View Application] [Not this time ▼]│
│    [Label]       │  [Reply] [Forward] [Delete]          │
│         13 Jul   │                                       │
│                  │  ┌─────────────────────────────────┐ │
│ ☐ [CD] Sender    │  │ 🏢 Company Name                 │ │
│    Subject       │  │    Job Title                    │ │
│    Snippet...    │  └─────────────────────────────────┘ │
│    [Label]       │                                       │
│         9 Jul    │  Message body content...             │
│                  │                                       │
│ 1–50 of 437   [<][>] │                                  │
└──────────────────┴──────────────────────────────────────┘
```

## Feature Highlights

### Message List
- ✅ Checkbox for each message (bulk selection)
- ✅ Avatar with 2-character initials
- ✅ Sender name, subject, and snippet hierarchy
- ✅ Label chips with proper color coding
- ✅ Unread indicator (solid dot)
- ✅ Date in compact format
- ✅ Active selection with background highlight

### Detail Pane
- ✅ Large subject heading (20px)
- ✅ **View Application** button when linked to application
- ✅ **Status dropdown** to update application status:
  - Not this time (default)
  - Interested
  - Applied
  - Interviewing
- ✅ Reply, Forward, Delete actions
- ✅ Company card when application is linked
- ✅ Full message body with proper formatting

### Toolbar Features
- ✅ Inbox/All Mail selector
- ✅ Unread only toggle
- ✅ Labels filter dropdown
- ✅ Sort order (Newest/Oldest)
- ✅ Search with icon
- ✅ Mark all read & Refresh buttons

## Label Classification Mapping

| Kind         | Label Display              | Color |
|--------------|----------------------------|-------|
| `colloquio`  | Interview invitation       | Green |
| `ricevuta`   | Application Confirmation   | Blue  |
| `rifiutata`  | Not this time              | Red   |
| `risposta`   | Other                      | Default |

## Technical Architecture

### Component Structure
```
GmailInboxView
├── Header Bar (title + email + interview chip)
├── Toolbar (filters + search + actions)
└── Content Grid
    ├── Message List (left pane)
    │   ├── Select all checkbox
    │   ├── Message rows with checkboxes
    │   └── Pagination footer
    └── Detail Pane (right pane)
        ├── Subject & metadata
        ├── Action bar (View App + Status + Reply/Forward/Delete)
        ├── Company card (if linked)
        └── Message body
```

### State Management
```typescript
// Selection
selectedIds: Set<string>          // Bulk checkbox selection
selected: string | null            // Current message ID

// Filters
filter: Filter                     // Label filter
inboxFilter: "inbox" | "all"      // Inbox scope
search: string                     // Search query
sortOrder: "newest" | "oldest"    // Sort order

// Status
currentStatus: StatusOption        // Application status
syncing: boolean                   // Sync in progress
syncNotice: string | null         // Sync feedback
```

## Preserved Functionality

✅ Gmail OAuth connection flow  
✅ Message sync via `/api/gmail/sync`  
✅ Classification by reply-parser  
✅ Application matching logic  
✅ Label assignment (colloquio, rifiutata, ricevuta)  
✅ Read/unread tracking  
✅ Company and job title linking  
✅ Dark/light theme support  
✅ Mobile responsive (via AppShell)

## Future Enhancements (Not in Scope)

- Status update API endpoint implementation
- Reply/Forward functionality wiring
- Delete message functionality
- Bulk action operations
- Pagination beyond first page
- Mark individual messages as read/unread
- Archive functionality

## Migration Notes

### Breaking Changes
None - this is a visual redesign only.

### Design System Usage
All components use existing LavorAI design tokens:
- `var(--bg)` - Background
- `var(--bg-elev)` - Elevated surface
- `var(--bg-sunken)` - Sunken surface
- `var(--fg)` - Foreground text
- `var(--fg-muted)` - Muted text
- `var(--fg-subtle)` - Subtle text
- `var(--border-ds)` - Border
- `var(--primary)` - Brand color (green)
- `ds-chip-green/blue/red` - Label chips

## Comparison to Reference

### ✅ Implemented from Screenshot
- Three-pane layout
- Toolbar with dropdowns and search
- Checkboxes for selection
- Avatar initials (2 chars)
- Label chips inline
- Interview invitations chip in header
- View Application button
- Status dropdown
- Clean spacing and hierarchy

### ⚠️ Adaptations for LavorAI
- Used Italian-first labels where appropriate (can be bilingual)
- Maintained existing label classification system
- Used LavorAI design tokens and theme
- Preserved existing Gmail sync architecture
- Integrated with existing application matching

## Testing Recommendations

1. **Visual Testing**
   - Check layout on desktop (1920x1080, 1440x900)
   - Check mobile responsive (375x667, 768x1024)
   - Verify light and dark themes
   - Test overflow states (long subject, many labels)

2. **Functional Testing**
   - Gmail connection flow
   - Message sync and display
   - Filtering and search
   - Checkbox selection (individual and all)
   - Detail view navigation
   - View Application deep-link
   - Status dropdown (when enabled)

3. **Performance Testing**
   - Large message lists (200+ messages)
   - Filtering performance
   - Search responsiveness
   - Scroll smoothness

4. **Accessibility Testing**
   - Keyboard navigation
   - Screen reader labels
   - Focus indicators
   - Color contrast ratios

## Files Modified

- `src/components/gmail-inbox-view.tsx` (major rewrite)
- `src/app/(app)/inbox/page.tsx` (removed topbar, added wrapper)

Total lines: +532 -356
