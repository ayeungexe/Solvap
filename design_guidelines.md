# Design Guidelines: Solana Refund Utility

## Design Approach
**System Selected:** Material Design with Web3 Customizations  
**Rationale:** This utility-focused blockchain application requires clear data presentation, trustworthy interactions, and modern web3 aesthetics. Material Design provides excellent patterns for data tables and dashboards while allowing customization for crypto-native visual language.

## Core Design Principles
1. **Trust & Transparency:** Clean layouts with clear data hierarchy to build user confidence
2. **Crypto-Native Aesthetics:** Modern gradients and bold typography reflecting web3 culture
3. **Functional Clarity:** Information-first design prioritizing usability over decoration
4. **Mobile-Responsive:** Seamless wallet connection across all devices

---

## Color Palette

### Primary Colors
- **Primary Purple:** 270 70% 60% (vibrant purple for CTAs and primary actions)
- **Primary Blue:** 240 80% 65% (accent blue for secondary elements)
- **Deep Purple:** 270 60% 25% (dark backgrounds, footer)

### Backgrounds & Surfaces
- **Dark Mode Primary:** 240 15% 8% (main background)
- **Dark Mode Surface:** 240 10% 12% (cards, elevated surfaces)
- **Dark Mode Surface Elevated:** 240 8% 16% (modals, dropdowns)

### Gradients
- **Primary Gradient:** Linear from 270 70% 60% to 240 80% 65% (hero, CTAs)
- **Subtle Gradient:** Linear from 270 30% 15% to 240 25% 12% (section backgrounds)

### Accent & Utility
- **Success Green:** 140 60% 55% (completed transactions)
- **Warning Amber:** 38 95% 65% (donation notices)
- **Text Primary:** 0 0% 95% (headings, primary text)
- **Text Secondary:** 0 0% 65% (descriptions, labels)
- **Border:** 240 10% 25% (dividers, card borders)

---

## Typography

### Font Families
- **Primary:** Inter (headings, UI elements, data) - Google Fonts
- **Mono:** JetBrains Mono (wallet addresses, transaction hashes) - Google Fonts

### Scale & Hierarchy
- **Hero Heading:** text-5xl md:text-7xl font-bold (gradient text)
- **Section Headings:** text-3xl md:text-4xl font-bold
- **Card Titles:** text-xl font-semibold
- **Body Text:** text-base font-normal
- **Data/Stats:** text-4xl md:text-5xl font-bold (large numbers)
- **Labels:** text-sm font-medium uppercase tracking-wide
- **Wallet/TX:** text-xs md:text-sm font-mono (addresses)

---

## Layout System

### Spacing Primitives
Use Tailwind units: **2, 4, 8, 12, 16, 20, 24** for consistent rhythm
- Component padding: p-4 to p-8
- Section spacing: py-16 to py-24
- Grid gaps: gap-4 to gap-8
- Card spacing: p-6 to p-8

### Container Strategy
- **Max Width:** max-w-7xl mx-auto (main content)
- **Section Padding:** px-4 md:px-6 lg:px-8
- **Full-width Sections:** Stats dashboard, transaction table

---

## Component Library

### Hero Section
- Full-width gradient background (primary gradient)
- Centered layout with max-w-4xl content
- Large heading with gradient text effect
- Prominent wallet connection button (variant="default" with primary gradient)
- Subheading explaining the service
- Floating logo above heading (192x192px)

### Statistics Dashboard (3-Column Grid)
- Grid: grid-cols-1 md:grid-cols-3 gap-6
- Each stat card with:
  - Icon (emoji or SVG, text-4xl)
  - Large number display (text-5xl font-bold gradient text)
  - Label (text-sm uppercase tracking-wide text-secondary)
- Dark surface background with subtle border
- Rounded corners (rounded-xl)

### Wallet Connection Interface
- Large card (max-w-md mx-auto) with dark surface background
- Wallet selection buttons with icons (Phantom, Solflare)
- Connected state showing truncated wallet address
- "Change Wallet" and "Reset Connection" actions
- Scan results showing refundable SOL and account count
- Primary CTA button "Close Accounts & Refund SOL"

### Transaction History Table
- Full-width responsive table
- Desktop: 6 columns (Wallet, Accounts, Refunded SOL, TX Signature, DateTime)
- Mobile: Stacked card layout
- Alternating row backgrounds for readability
- Truncated wallet addresses with full view on hover
- Clickable TX signatures linking to Solscan (external link icon)
- "Load More" button at bottom
- Sticky header on scroll

### FAQ Section
- Accordion pattern with smooth expand/collapse
- Question in bold, answer in regular weight
- Subtle hover state on clickable headers
- Plus/minus icon indicator
- Max-width prose container for readability

### Referral Banner
- Top of page, full-width
- Gradient background (warning amber to primary purple)
- Bold text: "Earn massive 35% from referrals"
- Centered or left-aligned based on viewport
- Closeable (optional X button)

### Partners Section
- 2-column grid for partner logos
- Dark surface cards with logos centered
- Partner names below logos
- Hover state: slight scale and brightness increase
- External links to partner sites

### Footer
- Dark background (deep purple)
- Centered content with social links
- Donation explanation text
- Copyright and legal links

---

## Animations & Interactions

### Micro-interactions
- Button hover: slight scale (1.02) and brightness increase
- Card hover: subtle elevation shadow
- Table row hover: background color change
- Accordion expand: smooth height transition (200ms)

### Loading States
- Skeleton screens for transaction table
- Spinner for wallet connection
- Progress indicator for account scanning

### Wallet Connection Flow
- Modal overlay for wallet selection
- Success toast notification on connection
- Error state with retry option

---

## Data Visualization

### Statistics
- Large numbers with gradient text effect
- Animated count-up on page load
- Icon + number + label grouping
- Responsive scaling

### Transaction Table
- Monospace font for addresses and signatures
- Truncation with ellipsis (show first/last 4 chars)
- Color-coded amounts (green for refunded)
- Timestamp in relative format ("2 hours ago") with tooltip showing exact time

---

## Images

### Hero Image
- **No large hero image** - use gradient background instead
- Logo image (512x512px) centered above hero heading

### Partner Logos
- Partner logo 1: Solana Vibe Station (circular logo on dark background)
- Partner logo 2: Mobula (white circular logo)
- Size: ~120x120px, centered in cards

### Icons
- Use Heroicons for UI elements (wallet, external link, chevron, etc.)
- Emoji for statistics (👤 users, 🔒 accounts, 💰 SOL)

---

## Accessibility & Responsiveness

### Mobile Optimization
- Stack stats grid to single column
- Transform table to card layout on mobile
- Larger touch targets for wallet buttons (min 44px)
- Simplified wallet address truncation

### Dark Mode
- Maintain consistent dark theme throughout
- Ensure WCAG AA contrast ratios (4.5:1 for body text)
- Visible focus states for keyboard navigation
- Semantic HTML for screen readers

### Trust Signals
- SSL badge in footer
- "Secure Connection" indicator near wallet button
- Transaction verification via Solscan links
- Clear donation fee disclosure