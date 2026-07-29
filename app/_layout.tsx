import { Stack, useRouter, useSegments } from 'expo-router';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { LocationProvider } from '@/context/LocationContext';
import { CartProvider } from '@/context/CartContext';
import { SavedProvider } from '@/context/SavedContext';
import { ChatProvider } from '@/context/ChatContext';
import { LoginGateProvider } from '@/components/LoginGate';
import { PaymentSheetProvider } from '@/components/PaymentSheet';
import { PhoneGateProvider } from '@/components/PhoneGate';
import { AppAlertProvider } from '@/components/AppAlert';
import ErrorBoundary from '@/components/ErrorBoundary';
import OfflineBanner from '@/components/OfflineBanner';
import OpenInAppBanner from '@/components/OpenInAppBanner';
import ResponsiveWebShell from '@/components/ResponsiveWebShell';
import AppSidebar, { SIDEBAR_BREAKPOINT } from '@/components/AppSidebar';
import UpdatePopup from '@/components/UpdatePopup';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useEffect } from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';
import 'react-native-reanimated';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, needsProfileCompletion } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inOnboarding = segments[0] === 'onboarding';

    if (isAuthenticated && needsProfileCompletion) {
      if (!inOnboarding) {
        router.replace('/onboarding');
      }
    } else if (inOnboarding && (!isAuthenticated || !needsProfileCompletion)) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isLoading, segments, needsProfileCompletion]);

  return <>{children}</>;
}

function RootLayoutContent() {
  // No more blocking LocationLoadingScreen — the app boots straight into
  // routing. The home tab uses LocationContext's default city until the
  // user explicitly opts into precise GPS via the location pill.

  // Push notifications: register the device's Expo push token + listen for
  // taps to route into deep links sent in the notification's data payload.
  const { usePushTokenSync, useNotificationTapNavigator } = require('../services/pushNotifications');
  usePushTokenSync();
  useNotificationTapNavigator();

  // Desktop chrome — render a persistent sidebar to the left of the
  // entire Stack so every route (tabs + internal screens like dj-detail,
  // captain/[id], cart, etc.) gets the same navigation column. Guests
  // browsing as "Hey Guest" still get it; the sidebar's nav items just
  // trigger the login gate when they touch something gated.
  const { width } = useWindowDimensions();
  const useSidebar = Platform.OS === 'web' && width >= SIDEBAR_BREAKPOINT;

  return (
    <AuthGuard>
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: '#f4f8ff' }}>
        {useSidebar && <AppSidebar />}
        <View style={{ flex: 1, minHeight: 0 }}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="equipment/[id]" />
          <Stack.Screen name="booking-flow" />
          <Stack.Screen name="djs" />
          <Stack.Screen name="dj-detail" />
          <Stack.Screen name="my-bookings" />
          <Stack.Screen name="captain/[id]" />
          <Stack.Screen name="cart" />
          <Stack.Screen name="quick-booking" />
        <Stack.Screen name="scan" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
          <Stack.Screen name="chat/index" />
          <Stack.Screen name="chat/[id]" />
          <Stack.Screen name="profile/payout-methods" />
          <Stack.Screen name="profile/addresses" />
        </Stack>
        <OfflineBanner />
        <OpenInAppBanner />
        </View>
      </View>
      {/* App update available popup — checks backend on launch + each
          time the app comes back to foreground. Lives at the very root
          so it overlays any tab/screen. */}
      <UpdatePopup />
    </AuthGuard>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        {/* ResponsiveWebShell sits OUTSIDE all the providers so the navy
            phone-frame backdrop is visible even during the initial auth
            check. On native it's a passthrough. */}
        <ResponsiveWebShell>
          <AuthProvider>
            <AppAlertProvider>
            <LoginGateProvider>
              <PhoneGateProvider>
                <PaymentSheetProvider>
                  <LocationProvider>
                    <CartProvider>
                      <SavedProvider>
                        <ChatProvider>
                          <RootLayoutContent />
                        </ChatProvider>
                      </SavedProvider>
                    </CartProvider>
                  </LocationProvider>
                </PaymentSheetProvider>
              </PhoneGateProvider>
            </LoginGateProvider>
            </AppAlertProvider>
          </AuthProvider>
        </ResponsiveWebShell>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
