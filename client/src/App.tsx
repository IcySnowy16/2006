/** Task F9: the routes. Guards live here so a page never has to check who is allowed to see it. */
import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth, RequireRole, useAuth } from './auth/AuthContext';
import { AppShell } from './components/AppShell';
import { Spinner } from './components/Spinner';
import { AccountPagesLazy as A } from './pages/lazy';
import { ChooseRolePage, LoginPage, RegisterPage, VerifyPage } from './pages/AuthPages';
import { DriverHomePage, DriverJourneyPage, DriverTripPage, GoLivePage, TripCompletePage } from './pages/DriverTripPages';
import { PresetEditorPage, PresetsPage } from './pages/DriverSetupPages';
import { BookConfirmPage, BookingPage, MatchesPage, PassengerHomePage, RequestHopPage } from './pages/PassengerPages';
import { DevComponentsPage } from './pages/DevComponents';

const inShell = (page: ReactNode) => (
  <RequireAuth>
    <AppShell>{page}</AppShell>
  </RequireAuth>
);
const driver = (page: ReactNode) => inShell(<RequireRole role="DRIVER">{page}</RequireRole>);
const passenger = (page: ReactNode) => inShell(<RequireRole role="PASSENGER">{page}</RequireRole>);

/** "/" sends everyone to the right place: sign in, choose a role, or their home. */
function Home() {
  const { me, loading } = useAuth();
  if (loading) return <Spinner label="Loading" />;
  if (!me) return <Navigate to="/login" replace />;
  if (me.activeRole === null) return <Navigate to="/choose-role" replace />;
  return <Navigate to={me.activeRole === 'DRIVER' ? '/driver' : '/passenger'} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/verify" element={<VerifyPage />} />
      <Route path="/choose-role" element={<ChooseRolePage />} />

      <Route path="/driver" element={driver(<DriverHomePage />)} />
      <Route path="/driver/presets" element={driver(<PresetsPage />)} />
      <Route path="/driver/presets/new" element={driver(<PresetEditorPage />)} />
      <Route path="/driver/presets/:id" element={driver(<PresetEditorPage />)} />
      <Route path="/driver/go-live" element={driver(<GoLivePage />)} />
      <Route path="/driver/journey/:id" element={driver(<DriverJourneyPage />)} />
      <Route path="/driver/trip/:id" element={driver(<DriverTripPage />)} />
      <Route path="/driver/complete/:id" element={driver(<TripCompletePage />)} />

      <Route path="/passenger" element={passenger(<PassengerHomePage />)} />
      <Route path="/passenger/request" element={passenger(<RequestHopPage />)} />
      <Route path="/passenger/matches/:id" element={passenger(<MatchesPage />)} />
      <Route path="/passenger/book/:journeyId" element={passenger(<BookConfirmPage />)} />
      <Route path="/passenger/booking/:id" element={passenger(<BookingPage />)} />

      <Route path="/wallet" element={inShell(<A.Wallet />)} />
      <Route path="/locked" element={inShell(<A.Locked />)} />
      <Route path="/notifications" element={inShell(<A.Notifications />)} />
      <Route path="/history" element={inShell(<A.History />)} />
      <Route path="/profile" element={inShell(<A.Profile />)} />

      <Route path="/dev/components" element={<DevComponentsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
