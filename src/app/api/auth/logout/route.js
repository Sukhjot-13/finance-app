// src/app/api/auth/logout/route.js
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

/**
 * Handles the POST request to log a user out.
 * It clears the accessToken cookie, effectively ending the user's session.
 * @param {Request} req - The incoming request object.
 * @returns {NextResponse} A response object.
 */
export async function POST(req) {
  try {
    // To log the user out, we overwrite the cookie with an expiration date in the past.
    // This instructs the browser to delete it immediately.
    cookies().set({
      name: 'accessToken',
      value: '',
      httpOnly: true,
      path: '/',
      expires: new Date(0), // Set expiration to a past date
    });

    // Return a success message.
    return NextResponse.json({ message: 'Logged out successfully' }, { status: 200 });

  } catch (error) {
    // Log any unexpected errors that occur during the process.
    console.error('Logout error:', error);

    // Return a generic error response to the client.
    return NextResponse.json({ error: 'Logout failed' }, { status: 500 });
  }
}
