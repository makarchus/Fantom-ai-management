import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as LocalStrategy } from 'passport-local';
import { findUserById, findUserByEmail, verifyLocalPassword, upsertGoogleUser } from './users.js';

function getCallbackUrl() {
  return process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/api/auth/google/callback';
}

export function configurePassport() {
  passport.serializeUser((user, done) => done(null, user.id));

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await findUserById(id);
      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  passport.use(new LocalStrategy(
    { usernameField: 'email', passwordField: 'password', passReqToCallback: false },
    async (email, password, done) => {
      try {
        const user = await findUserByEmail(email);
        if (!user || !user.password_hash) {
          return done(null, false, { message: 'Invalid email or password' });
        }
        const valid = await verifyLocalPassword(user, password);
        if (!valid) return done(null, false, { message: 'Invalid email or password' });
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    },
  ));

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.warn('⚠️  GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set — Google login disabled');
    return;
  }

  passport.use(new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: getCallbackUrl(),
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const user = await upsertGoogleUser({
          googleId: profile.id,
          email: profile.emails?.[0]?.value,
          name: profile.displayName,
          avatarUrl: profile.photos?.[0]?.value,
        });
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    },
  ));
}
