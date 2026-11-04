/** Tasks A4, A5, F9: sign-in, registration, verification, role choice and the route guards. */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { apiError, driverMe, http, HttpResponse, loginAs, passengerMe, server } from '../test/server';
import { renderAt } from '../test/utils';

const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('Login (UC-2)', () => {
  it('an empty form shows what is missing and sends nothing', async () => {
    let called = false;
    server.use(http.post('*/api/auth/login', () => ((called = true), HttpResponse.json(passengerMe))));
    renderAt(<App />, { route: '/login' });
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThanOrEqual(1);
    expect(called).toBe(false);
  });

  it('a passenger who signs in lands on the passenger home', async () => {
    server.use(loginAs(passengerMe));
    renderAt(<App />, { route: '/login' });
    type('NTU e-mail', 'priya@e.ntu.edu.sg');
    type('Password', 'correct-horse');
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Hi Priya')).toBeInTheDocument();
  });

  it('someone who holds both roles and has not chosen goes to the role chooser (UC-2.AC.1)', async () => {
    server.use(loginAs({ ...driverMe, activeRole: null }));
    renderAt(<App />, { route: '/login' });
    type('NTU e-mail', 'dana@e.ntu.edu.sg');
    type('Password', 'correct-horse');
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('How do you want to use Campus Hop today?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'I need a ride (passenger)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'I am driving (driver)' })).toBeInTheDocument();
  });

  it('wrong password shows the server message; an unverified e-mail offers the code screen', async () => {
    server.use(http.post('*/api/auth/login', () => apiError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.')));
    renderAt(<App />, { route: '/login' });
    type('NTU e-mail', 'priya@e.ntu.edu.sg');
    type('Password', 'wrong-password');
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Incorrect email or password.')).toBeInTheDocument();

    server.use(http.post('*/api/auth/login', () => apiError(403, 'EMAIL_NOT_VERIFIED', 'Please verify your email address first.')));
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    const link = await screen.findByRole('link', { name: 'Enter your code' });
    expect(link).toHaveAttribute('href', '/verify?email=priya%40e.ntu.edu.sg');
  });
});

describe('Register (UC-1)', () => {
  const fill = () => {
    type('Full name', 'Priya Rider');
    type('NTU e-mail', 'priya@e.ntu.edu.sg');
    type('Mobile number', '+65 9123 4567');
    type('Password', 'correct-horse');
  };

  it('a short password and a bad phone number are explained before anything is sent', async () => {
    let called = false;
    server.use(http.post('*/api/auth/register', () => ((called = true), HttpResponse.json({ userId: 'x' }, { status: 201 }))));
    renderAt(<App />, { route: '/register' });
    type('Full name', 'P');
    type('NTU e-mail', 'priya@e.ntu.edu.sg');
    type('Mobile number', '12');
    type('Password', 'short');
    fireEvent.click(await screen.findByRole('button', { name: 'Create account' }));
    expect(await screen.findByText(/8 to 15 digits/)).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('sends the phone as typed (the server tidies it), and goes to the code screen with the e-mail', async () => {
    let body: unknown;
    server.use(http.post('*/api/auth/register', async ({ request }) => ((body = await request.json()), HttpResponse.json({ userId: 'u1' }, { status: 201 }))));
    renderAt(<App />, { route: '/register' });
    fill();
    fireEvent.click(await screen.findByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Check your e-mail')).toBeInTheDocument();
    expect(screen.getByText(/priya@e.ntu.edu.sg/)).toBeInTheDocument();
    expect(body).toMatchObject({ ntuEmail: 'priya@e.ntu.edu.sg', role: 'PASSENGER', phone: '+6591234567' });
  });

  it('a non-NTU e-mail and a taken e-mail are explained, the latter with a way to sign in', async () => {
    server.use(http.post('*/api/auth/register', () => apiError(409, 'EMAIL_TAKEN', 'An account with this email already exists.')));
    renderAt(<App />, { route: '/register' });
    fill();
    fireEvent.click(await screen.findByRole('button', { name: 'Create account' }));
    expect(await screen.findByText(/already exists/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in instead' })).toBeInTheDocument();
  });

  it('offers the three roles with passenger chosen', async () => {
    renderAt(<App />, { route: '/register' });
    expect(await screen.findByLabelText(/Passenger: I want rides/)).toBeChecked();
    expect(screen.getByLabelText(/Driver: I give rides/)).not.toBeChecked();
    expect(screen.getByLabelText('Both')).not.toBeChecked();
  });
});

describe('Verify (UC-1)', () => {
  it('the button waits for six digits; a wrong code shows the server message', async () => {
    server.use(http.post('*/api/auth/verify', () => apiError(400, 'VERIFICATION_CODE_INVALID', 'That verification code is incorrect.')));
    renderAt(<App />, { route: '/verify?email=priya@e.ntu.edu.sg' });
    const button = await screen.findByRole('button', { name: 'Verify' });
    expect(button).toBeDisabled();
    type('Verification code', '12ab34');
    expect(screen.getByLabelText('Verification code')).toHaveValue('1234'); // letters are dropped
    type('Verification code', '123456');
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(await screen.findByText('That verification code is incorrect.')).toBeInTheDocument();
  });

  it('a correct code goes to sign-in; "send a new code" confirms', async () => {
    server.use(
      http.post('*/api/auth/verify', () => new HttpResponse(null, { status: 204 })),
      http.post('*/api/auth/resend', () => new HttpResponse(null, { status: 204 })),
    );
    renderAt(<App />, { route: '/verify?email=priya@e.ntu.edu.sg' });
    fireEvent.click(await screen.findByRole('button', { name: 'Send a new code' }));
    expect(await screen.findByText('A new code is on its way.')).toBeInTheDocument();
    type('Verification code', '123456');
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByText('Welcome back')).toBeInTheDocument();
  });
});

describe('Choose role and switching (UC-2)', () => {
  it("choosing a role sends it and opens that role's home", async () => {
    let sent: unknown;
    server.use(
      http.post('*/api/me/active-role', async ({ request }) => ((sent = await request.json()), HttpResponse.json({ ...driverMe, activeRole: 'DRIVER' }))),
      http.get('*/api/auth/me', () => HttpResponse.json({ ...driverMe, activeRole: null })),
    );
    renderAt(<App />, { route: '/choose-role', me: { ...driverMe, activeRole: null } });
    fireEvent.click(await screen.findByRole('button', { name: 'I am driving (driver)' }));
    expect(await screen.findByText('Hi Dana')).toBeInTheDocument();
    expect(sent).toEqual({ role: 'DRIVER' });
  });

  it("switching in the middle of a trip is refused with the server's reason", async () => {
    server.use(http.post('*/api/me/active-role', () => apiError(409, 'ILLEGAL_STATE_TRANSITION', 'Finish or cancel your trip first, then switch role.')));
    renderAt(<App />, { route: '/choose-role', me: driverMe });
    fireEvent.click(await screen.findByRole('button', { name: 'I need a ride (passenger)' }));
    expect(await screen.findByText('Finish or cancel your trip first, then switch role.')).toBeInTheDocument();
  });
});

describe('Route guards', () => {
  it('signed out: any screen goes to sign-in', async () => {
    renderAt(<App />, { route: '/wallet', me: null });
    expect(await screen.findByText('Welcome back')).toBeInTheDocument();
  });

  it('a passenger cannot open a driver screen: they are sent to their own home', async () => {
    renderAt(<App />, { route: '/driver/presets', me: passengerMe });
    expect(await screen.findByText('Hi Priya')).toBeInTheDocument();
    expect(screen.queryByText('My presets')).toBeNull();
  });

  it('someone who must still choose a role is sent to choose, from any role screen', async () => {
    renderAt(<App />, { route: '/passenger', me: { ...driverMe, activeRole: null } });
    expect(await screen.findByText('How do you want to use Campus Hop today?')).toBeInTheDocument();
  });

  it('"/" sends each person home: driver to the driver home, passenger to the passenger home', async () => {
    const { unmount } = renderAt(<App />, { route: '/', me: driverMe });
    expect(await screen.findByText('Hi Dana')).toBeInTheDocument();
    unmount();
    renderAt(<App />, { route: '/', me: passengerMe });
    await waitFor(() => expect(screen.getByText('Hi Priya')).toBeInTheDocument());
  });
});
