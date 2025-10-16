# Refund Your SOL - Solana Token Account Rent Reclaim Tool

## Overview
A Solana blockchain utility that helps users reclaim SOL from unused SPL token accounts. The application features a beautiful purple and blue gradient design, real-time statistics, and comprehensive transaction history.

## Recent Changes (October 16, 2025)
- Created complete MVP with all core features
- Implemented WebSocket real-time updates
- Built responsive UI following design guidelines
- Replaced all emoji with Lucide icons
- Fixed button sizing issues per design guidelines
- All backend API endpoints functional with in-memory storage

## Project Architecture

### Frontend (React + TypeScript)
- **Design System**: Purple/blue gradients, dark theme, shadcn components
- **Key Components**:
  - Hero section with gradient background
  - Statistics dashboard (3-column grid)
  - Wallet connection interface
  - Transaction history table (responsive)
  - FAQ accordion
  - Referral banner
  - Partners section
  - Footer

### Backend (Express + WebSocket)
- **API Endpoints**:
  - `GET /api/stats` - Global statistics
  - `GET /api/transactions` - Transaction history
  - `POST /api/transactions` - Submit new transaction
- **WebSocket**: Real-time updates on `/ws` path
- **Storage**: In-memory storage with sample data

### Data Models
- **Transaction**: Wallet address, accounts closed, refunded SOL, TX signature, timestamp
- **Stats**: Total users, accounts closed, SOL refunded

## User Preferences
- Dark mode by default
- Professional crypto/web3 aesthetic
- No emoji in UI (icons only)
- Clean, trustworthy design

## Technical Notes

### Solana Integration
**Note**: The @solana/web3.js and wallet-adapter packages could not be installed due to npm dependency conflicts. The current implementation uses a well-structured mock that demonstrates the full user flow:
1. Wallet connection simulation
2. Token account scanning
3. Refund transaction execution
4. Backend integration with real-time updates

To integrate real Solana functionality in the future:
1. Install packages: @solana/web3.js, @solana/wallet-adapter-react, @solana/wallet-adapter-react-ui, @solana/wallet-adapter-wallets
2. Update WalletConnect component with actual wallet adapters
3. Implement real token account scanning with RPC calls
4. Execute actual close account transactions

### Design Guidelines
- All UI follows design_guidelines.md religiously
- Uses Lucide icons exclusively (no emoji)
- Shadcn components with no custom hover/active states
- Proper button sizing (no custom h-/w- on size="icon")
- Responsive design across all breakpoints

## Key Features
1. ✅ Wallet connection (simulated multi-wallet support)
2. ✅ Token account scanning
3. ✅ SOL refund transactions with 15% fee
4. ✅ Real-time statistics updates via WebSocket
5. ✅ Global transaction history
6. ✅ Responsive design (desktop + mobile)
7. ✅ FAQ section
8. ✅ Referral banner (35% commission)
9. ✅ Partner integrations display

## Running the Application
The app runs on port 5000 with the "Start application" workflow:
- Frontend: Vite dev server
- Backend: Express with WebSocket support
- Hot reload enabled for development
