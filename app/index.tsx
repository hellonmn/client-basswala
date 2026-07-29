import { Redirect } from 'expo-router';

/**
 * Initial entry — boot straight into the home tab on every platform.
 *
 * Guests can browse DJs and gear without an account; the PhoneGate / login
 * gates kick in only when they try to actually book. Authenticated users with
 * an incomplete profile are routed to /onboarding by the AuthGuard in
 * app/_layout.tsx.
 *
 * The branded loading the user sees while the JS bundle boots is the NATIVE
 * splash (the Basswala logo from app.json `expo-splash-screen`) — no extra
 * artificial animated splash / spinner. This makes the app open directly
 * instead of sitting on a multi-second loading screen.
 */
export default function Index() {
  return <Redirect href="/(tabs)" />;
}
