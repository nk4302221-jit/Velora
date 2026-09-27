import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { handleSocialAuth } from '../services/oauthService.js';

/**
 * Registers the Passport Google OAuth2 strategy.
 * Reuses the existing handleSocialAuth() service (finds-or-creates the user by
 * email, links the social account, and generates the app's existing JWT via
 * utils/jwtHelper.js) so there is only one authentication system.
 *
 * Returns true when the strategy was registered, false when credentials are
 * missing (the auth routes then redirect the user to the login page).
 */
export function configureGoogleOAuth() {
  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientID || !clientSecret) {
    console.warn('[OAuth] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set. Google sign-in is disabled.');
    return false;
  }

  const callbackURL =
    process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/api/auth/google/callback';

  passport.use(
    new GoogleStrategy(
      {
        clientID,
        clientSecret,
        callbackURL,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails && profile.emails[0] ? profile.emails[0].value.toLowerCase() : null;

          if (!email) {
            return done(null, false, { message: 'Your Google account does not provide an email address.' });
          }

          const authResult = await handleSocialAuth({
            provider: 'google',
            providerUserId: profile.id,
            email,
            name: profile.displayName || (profile.name && `${profile.name.givenName || ''} ${profile.name.familyName || ''}`.trim()) || email.split('@')[0],
            avatarUrl: profile.photos && profile.photos[0] ? profile.photos[0].value : null,
          });

          return done(null, authResult);
        } catch (error) {
          console.error('[OAuth] Google strategy verification failed:', error);
          return done(error, null);
        }
      }
    )
  );

  return true;
}

export { passport };