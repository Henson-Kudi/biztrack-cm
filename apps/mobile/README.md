# BizTrack CM — Mobile App

React Native / Expo mobile client for BizTrack CM. Targets Android and iOS.

---

## Tech Stack

| Layer | Tool |
|---|---|
| Framework | Expo SDK 55 (Expo Router v4 file-based routing) |
| Language | TypeScript |
| Styling | NativeWind v4 (TailwindCSS for React Native) |
| State | Zustand (persisted via expo-secure-store) |
| HTTP | Axios with auto token refresh interceptor |
| Forms | Custom `useForm` hook with per-field validation |
| Animations | react-native-reanimated v4 |
| Local DB | expo-sqlite + Drizzle ORM (offline sync) |
| Build | EAS (Expo Application Services) cloud builds |

---

## Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9
- [Expo Go](https://expo.dev/go) on your phone **or** a Development Build (see below)
- The API (`apps/api`) running locally or pointing to a staging URL

---

## Environment Setup

Create a `.env` file in `apps/mobile/` (copy from `.env.example`):

```bash
cp apps/mobile/.env.example apps/mobile/.env
```

Then fill in the values:

```env
# URL of the running BizTrack API (no trailing slash)
# For local development, use your machine's LAN IP (not localhost)
# because the phone and PC must be on the same Wi-Fi network.
# Example: http://192.168.1.100:3000/api/v1
EXPO_PUBLIC_API_URL=http://<YOUR_LAN_IP>:3000/api/v1
```

> **Why LAN IP and not `localhost`?**
> `localhost` on a physical phone or Android emulator resolves to the
> device itself, not your development machine. Use your machine's
> local network IP (e.g. `192.168.1.x`) so requests reach the API.
> On Windows, find it with `ipconfig` → look for **IPv4 Address**.

---

## Running in Development

Install dependencies from the monorepo root first:

```bash
# From monorepo root
pnpm install
```

Then start the Metro bundler:

```bash
# From monorepo root
cd apps/mobile && pnpm dev

# Or from the mobile directory directly
pnpm dev
```

This runs `expo start -c` (with cache cleared). Scan the QR code with:
- **Expo Go** (limited — no custom native modules)
- **Development Build** on your device (full native support, recommended)

---

## Building a Development Client (one-time setup)

Because this app uses custom native modules (Reanimated, Gesture Handler,
SQLite), you need a **Development Build** instead of Expo Go.

```bash
# Build an APK for Android (internal distribution)
pnpm build:android

# Build for iOS (requires Apple Developer account)
pnpm build:ios
```

These commands trigger an **EAS cloud build**. You will receive a download
link for the APK/IPA when the build is complete. Install it on your device,
then run `pnpm dev` to connect to your local Metro bundler.

---

## Project Structure

```
apps/mobile/
├── src/
│   ├── app/
│   │   ├── _layout.tsx          # Root layout — auth guard
│   │   ├── (auth)/              # Auth & onboarding screens
│   │   │   ├── _layout.tsx
│   │   │   ├── index.tsx        # Entry (phone input)
│   │   │   ├── register.tsx     # Registration
│   │   │   ├── password.tsx     # Password login
│   │   │   ├── otp-login.tsx    # Passwordless OTP login
│   │   │   ├── verify-phone.tsx # Phone OTP verification
│   │   │   ├── verify-email.tsx # Email OTP verification
│   │   │   ├── select-business.tsx
│   │   │   ├── setup-business.tsx
│   │   │   ├── select-plan.tsx
│   │   │   └── first-product.tsx
│   │   └── (tabs)/              # Main app screens (post-login)
│   │       ├── _layout.tsx
│   │       ├── index.tsx        # Dashboard
│   │       ├── sell.tsx         # POS / Sales
│   │       ├── products.tsx     # Product catalogue
│   │       ├── expenses.tsx     # Expenses
│   │       └── profile.tsx      # Account & settings
│   ├── components/
│   │   ├── ui/                  # Shared primitives (AppButton, AppInput, etc.)
│   │   ├── auth/                # Auth-specific components
│   │   ├── home/                # Dashboard widgets
│   │   ├── products/            # Product components
│   │   ├── sell/                # POS components
│   │   └── expenses/            # Expense components
│   ├── hooks/
│   │   └── useForm.ts           # Generic form state + validation hook
│   ├── navigation/
│   │   └── nextStepRouter.ts    # Maps API nextStep → Expo Router path
│   ├── services/
│   │   ├── apiClient.ts         # Axios instance with token refresh
│   │   └── auth.service.ts      # Auth API wrappers
│   ├── store/
│   │   └── useAuthStore.ts      # Zustand auth store (persisted)
│   └── utils/
│       └── permissions.ts       # Camera/contacts permission helpers
├── .env.example
├── app.json
├── eas.json
├── metro.config.js
├── babel.config.js
└── tailwind.config.js
```

---

## Auth Flow

```
Phone Entry → requestLogin (API)
  ├── User not found        → Register screen
  ├── verify_phone          → OTP verification
  ├── verify_email          → Email OTP verification
  ├── password_required     → Password login
  └── confirm_login         → Passwordless OTP login
        └── Select Business → Setup Business → Select Plan → First Product → Dashboard
```

---

## Running Tests

```bash
pnpm test           # Run all tests
pnpm test:watch     # Watch mode
pnpm test:coverage  # Coverage report
```
