# Gmail Inbox UI - Visual Changes

## Layout Comparison

### Before (Old Design)
```
┌─────────────────────────────────────────────────────────────┐
│ Topbar: Inbox | Lavoro                                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Inbox  📧 user@email.com        🟣 N Interview inv.    │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                               │
│ ┌──────────────┬───────────────────────────────────────────┐│
│ │ SIDEBAR      │ DETAIL VIEW                              ││
│ │              │                                           ││
│ │ [Search...]  │  Subject                                 ││
│ │              │  From: sender@email.com                  ││
│ │ [Inbox]      │  Date: 17/06/2026 09:19                 ││
│ │ [Unread]     │                                          ││
│ │              │  [View App] [Reply] [Forward] [Delete]  ││
│ │ Labels:      │                                          ││
│ │ • Interview  │  Message body...                         ││
│ │ • Confirms   │                                          ││
│ │ • Reject     │                                          ││
│ │              │                                          ││
│ │ [Mark read]  │                                          ││
│ │ [Refresh]    │                                          ││
│ │              │                                          ││
│ │ LIST:        │                                          ││
│ │              │                                          ││
│ │ [A] Sender   │                                          ││
│ │   Subject    │                                          ││
│ │   Snippet    │                                          ││
│ │   🔵 [Label] │                                          ││
│ │   13 Jul     │                                          ││
│ │              │                                          ││
│ │ 1-50 of N    │                                          ││
│ └──────────────┴───────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### After (New AIApply-style Design)
```
┌─────────────────────────────────────────────────────────────┐
│ Inbox  📧 user@email.com          🗓️ N Interview invitations│
├─────────────────────────────────────────────────────────────┤
│ [Inbox▼] [⚪Unread] [Labels▼] [Newest▼] [Search...] [Actions]│
├────────────────────┬────────────────────────────────────────┤
│ MESSAGE LIST       │ DETAIL VIEW                            │
│                    │                                         │
│ ☐ Select all       │ Job Application Update from TD SYNNEX  │
│                    │ TD SYNNEX Human Resources               │
│ ☐ [AB] Hanadi      │ 17 Jun 2026 at 09:19 CEST             │
│    AI Training...  │                                         │
│    Hello Umberto...│ [View Application] [Not this time ▼]   │
│    🟢 Other        │ [Reply] [Forward] [Delete]              │
│         13 Jul  ●  │                                         │
│                    │ ┌────────────────────────────────────┐ │
│ ☐ [AB] Abbott-HR   │ │ 🏢 TD SYNNEX                       │ │
│    Die Position... │ │    Junior Sales Specialist         │ │
│    body, table...  │ └────────────────────────────────────┘ │
│    ⏱️ Not this time│                                         │
│          9 Jul     │ Hello Umberto                           │
│                    │                                         │
│ ☐ [LE] Letuelez... │ Thank you for your interest...         │
│    Questa estate...│                                         │
│    Aiuta gli...    │ At this time, this position has been   │
│    🟢 Other        │ filled. We encourage you to join our   │
│          6 Jul     │ Talent Community...                    │
│                    │                                         │
│ 1–50 of 437  [<][>]│                                         │
└────────────────────┴────────────────────────────────────────┘
```

## Component-by-Component Changes

### 1. Header Bar
**Before:**
- Separate AppTopbar component
- Basic title "Inbox"
- Email shown in sidebar

**After:**
- Integrated header in component
- Larger "Inbox" title (24px)
- Email badge with icon next to title
- Interview invitations chip on right (dashed border, green tint)

### 2. Toolbar
**Before:**
- Filters and actions scattered in left sidebar
- No dedicated toolbar row
- Search at top of sidebar
- Actions (Mark all read, Refresh) at middle of sidebar

**After:**
- Dedicated horizontal toolbar below header
- Left: Inbox dropdown, Unread toggle, Labels dropdown, Sort selector
- Center: Search bar with icon (max-width 400px)
- Right: Mark all read, Refresh buttons
- All controls easily accessible and visible

### 3. Message List
**Before:**
- Avatars: 32px, single letter
- No checkboxes
- Smaller text hierarchy
- Label chips below content
- Date: Italian format (13 Lug)
- Unread: Small dot badge

**After:**
- Avatars: 36px, two letters (e.g., "AB", "HF")
- Checkbox on each row + "Select all" header
- Clearer hierarchy: sender (14px bold), subject (13px), snippet (12px muted)
- Label chips inline with content
- Date: English format (13 Jul) for consistency
- Unread: Larger solid dot (10px)
- Active row: darker background

### 4. Detail Pane
**Before:**
- Subject: 18px
- Actions: small buttons grouped together
- Metadata: smaller text
- No status selector

**After:**
- Subject: 20px, more prominent
- Sender and date on separate line with better spacing
- **View Application**: Primary green button (stands out)
- **Status dropdown**: Next to View Application
  - "Not this time" (default)
  - "Interested"
  - "Applied"
  - "Interviewing"
  - Disabled when no linked application
- Reply, Forward, Delete: Secondary style
- Company card: larger (48px logo), better contrast

### 5. Spacing & Layout
**Before:**
- Two-pane: 360px sidebar + flexible detail
- Sidebar included filters + list
- More cramped layout

**After:**
- Three-pane concept with dedicated areas:
  - Header: full-width
  - Toolbar: full-width
  - Content: 320-380px list + flexible detail
- More breathing room in all components
- Consistent 12-16px padding

### 6. Visual Polish
**Before:**
- Mix of border radius sizes
- Some buttons without clear hierarchy
- Label colors less distinct

**After:**
- Consistent border radius (6-8px)
- Clear button hierarchy (primary = green, secondary = default)
- Label chips use solid brand colors for better visibility
- Better use of elevation (var(--bg-elev) for toolbar)

## Functional Improvements

### Selection & Bulk Actions
**Before:** No bulk selection capability  
**After:** Checkboxes on each message + "Select all on this page"

### Status Management
**Before:** No way to update application status from inbox  
**After:** Status dropdown in detail pane (when application linked)

### Interview Tracking
**Before:** Small badge in corner  
**After:** Prominent chip in header with dashed border (calls attention)

### Filtering
**Before:** Click label buttons in sidebar  
**After:** Dropdown selector in toolbar (more scalable, saves vertical space)

### Sorting
**Before:** Always newest first (hardcoded)  
**After:** Toggle between newest/oldest in toolbar

## Preserved Features

✅ Gmail OAuth connection flow  
✅ Message sync and classification  
✅ Application matching and linking  
✅ Company logo display  
✅ Label color coding  
✅ Read/unread tracking  
✅ Search functionality  
✅ Responsive design (AppShell)  
✅ Dark/light theme support

## Browser Compatibility

The redesign uses standard CSS Grid, Flexbox, and modern CSS properties:
- CSS Grid: `grid-template-columns`, `gap`
- Flexbox: `display: flex`, `align-items`, `justify-content`
- CSS Variables: `var(--border-ds)`, etc.
- Modern selectors: `:hover`, `:focus-visible`

**Minimum Requirements:**
- Chrome/Edge 88+
- Firefox 89+
- Safari 14.1+

## Accessibility Improvements

### Keyboard Navigation
- All interactive elements focusable
- Checkboxes accessible via Tab + Space
- Dropdowns accessible via Arrow keys
- Escape closes mobile drawer (existing)

### Screen Readers
- Proper label associations
- Meaningful aria-labels on icon buttons
- Status messages announced

### Visual Contrast
- All text meets WCAG AA standards
- Focus indicators visible
- Color not sole indicator (icons + text)

## Mobile Responsive Changes

The inbox inherits responsive behavior from AppShell:

**Desktop (≥1024px):**
- Full three-pane layout
- Sidebar visible on left
- Toolbar horizontal

**Tablet/Mobile (<1024px):**
- Sidebar becomes drawer (tap hamburger)
- Toolbar may wrap to multiple rows
- Message list and detail stack vertically
- Touch-friendly tap targets (minimum 44x44px)

No inbox-specific mobile overrides needed - AppShell handles breakpoints.

## Performance Considerations

### Rendering
- Message list virtualizable (not implemented yet)
- Detail view only renders current message
- Checkboxes use Set for O(1) lookups

### State Management
- Minimal re-renders via proper state structure
- Filter/sort computed on-demand
- No unnecessary memoization

### Data Loading
- Existing sync mechanism unchanged
- 200 messages fetched per page (server-side)
- Client-side filtering and sorting

## Dark Theme Adaptation

All new components use CSS variables:
```css
var(--bg)           /* Background */
var(--bg-elev)      /* Toolbar, footer */
var(--bg-sunken)    /* Active selection */
var(--fg)           /* Primary text */
var(--fg-muted)     /* Secondary text */
var(--fg-subtle)    /* Tertiary text */
var(--border-ds)    /* Borders */
var(--primary)      /* Brand green */
```

Dark mode automatically applies when `[data-theme="dark"]` is set.

## Migration Path for Existing Users

No migration needed - this is a drop-in UI replacement:
1. No database schema changes
2. No API endpoint changes
3. No localStorage/session changes
4. Existing messages display immediately

Users will see the new UI on next visit to `/inbox`.

## Known Limitations

### Not Implemented (Future Work)
- ❌ Status update API endpoint
- ❌ Reply functionality wiring
- ❌ Forward functionality wiring
- ❌ Delete message functionality
- ❌ Bulk action operations (mark read, delete, etc.)
- ❌ Pagination beyond first page
- ❌ Toggle read/unread on individual messages
- ❌ Archive functionality

### Design Decisions
- Avatar initials: 2 characters from sender name (not email)
- Date format: English for consistency (can be localized)
- Status dropdown: Simplified states (can be expanded)
- Labels filter: Single selection (can be multi-select)

## Testing Scenarios

### Happy Path
1. User connects Gmail
2. Messages sync and display in list
3. User clicks message → detail view opens
4. User filters by "Interview invitation"
5. User clicks "View Application" → navigates to application page

### Edge Cases
1. No messages → Shows "No messages" placeholder
2. No linked application → Status dropdown disabled, no View Application button
3. Very long subject → Ellipsis truncation
4. Many labels → Wrapping handled correctly
5. Search with no results → Shows "No messages with this filter"

### Error Handling
1. Sync failure → Error message in toolbar
2. Network error → Existing error handling preserved
3. Invalid message data → Graceful fallback to "(no subject)"

## Future Enhancement Ideas

### Phase 2 - Actions
- Implement status update API
- Wire up Reply/Forward/Delete
- Add bulk actions menu
- Add archive functionality

### Phase 3 - Advanced Features
- Virtual scrolling for large lists
- Multi-select labels filter
- Custom label creation
- Smart filters (e.g., "Needs response")
- Keyboard shortcuts (j/k navigation)

### Phase 4 - Intelligence
- AI-powered prioritization
- Suggested responses
- Auto-categorization refinement
- Sentiment analysis badges

## Rollback Plan

If issues arise, rollback is straightforward:
1. Revert commit `abc5ed2`
2. Restore previous `gmail-inbox-view.tsx`
3. Restore previous `inbox/page.tsx`

No database or API changes to revert.
