import { OAuth2Client } from 'google-auth-library';
import User from '../models/User.js';
import { generateJWT } from '../middleware/auth.js';
import logger from '../utils/logger.js';

// ---- Google sign-in ----
// The browser gets a signed "ID token" from Google. We check it with Google's public keys and the app's own
// client id, so nobody can sign in as someone else by sending an email address.
let googleVerifier = async (idToken) => {
  const client = new OAuth2Client();
  const ticket = await client.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
  return ticket.getPayload();
};

// Tests swap this for a fake so they never call Google
export const setGoogleVerifier = (verifier) => {
  googleVerifier = verifier;
};

// Admins are decided by the server's own settings (ADMIN_EMAILS), never by anything in the app screens.
// Staff are chosen by an admin on the Staff page; everyone else is a customer.
const adminEmails = () =>
  (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

// What the sign-in popup needs to know, so a visitor is never left stuck
export const getAuthConfig = (req, res) => {
  res.json({
    success: true,
    data: { googleClientId: process.env.GOOGLE_CLIENT_ID || null }
  });
};

const publicUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  phoneNumber: user.phoneNumber,
  picture: user.picture,
  role: user.role
});

// Sign in (or sign up, the first time) with a Google ID token
export const googleLogin = async (req, res) => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(503).json({ success: false, message: 'Google sign-in is not set up on this server yet.' });
    }

    let payload;
    try {
      payload = await googleVerifier(req.body.credential);
    } catch (error) {
      logger.authLog('GOOGLE_LOGIN_FAILED', null, { reason: error.message });
      return res.status(401).json({ success: false, message: 'Google could not confirm your sign-in. Please try again.' });
    }

    const email = String(payload?.email || '').trim().toLowerCase();
    if (!payload?.sub || !email || payload.email_verified !== true) {
      return res.status(401).json({ success: false, message: 'Your Google account needs a verified email address.' });
    }

    // Find them by Google id first; an older account with the same email is linked on the first Google sign-in
    let user = await User.findOne({ googleId: payload.sub });
    if (!user) user = await User.findOne({ email });

    if (user && user.isActive === false) {
      return res.status(403).json({
        success: false,
        message: 'This account has been deactivated. Please ask the shop manager.'
      });
    }

    if (!user) {
      try {
        user = new User({ googleId: payload.sub, email, name: payload.name, picture: payload.picture });
        await user.save();
        logger.authLog('NEW_USER_CREATED', user._id, { email });
      } catch (error) {
        // Two sign-ins at the same moment can both try to create the account: use the one that won
        if (error.code === 11000) {
          user = await User.findOne({ $or: [{ googleId: payload.sub }, { email }] });
        }
        if (!user) throw error;
      }
    }

    if (!user.googleId) user.googleId = payload.sub;
    if (!user.email) user.email = email;
    if (payload.picture) user.picture = payload.picture;
    // The name comes from Google only the first time; after that the person owns it (they can edit it in their profile)
    if (!user.name || user.name === 'Temp User') user.name = payload.name || email.split('@')[0];

    if (adminEmails().includes(email) && user.role !== 'admin') {
      user.role = 'admin';
      logger.authLog('ADMIN_FROM_SETTINGS', user._id, { email });
    }

    user.isPhoneVerified = user.isPhoneVerified || false;
    user.lastLogin = new Date();
    await user.save();

    const token = generateJWT(user._id, user.tokenVersion || 0);
    logger.authLog('GOOGLE_LOGIN_SUCCESS', user._id, { email });

    res.json({
      success: true,
      message: 'Login successful',
      data: { token, user: publicUser(user) }
    });
  } catch (error) {
    logger.error('Google login error', { error: error.message });
    res.status(500).json({ success: false, message: 'Sign-in failed. Please try again.' });
  }
};

// Sign out of every device: raising tokenVersion makes all tokens made so far stop working.
export const signOutEverywhere = async (req, res) => {
  try {
    await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
    logger.authLog('SIGN_OUT_EVERYWHERE', req.user._id, {});
    res.json({ success: true, message: 'You were signed out of all devices.' });
  } catch (error) {
    logger.error('Sign out everywhere error', { userId: req.user?._id, error: error.message });
    res.status(500).json({ success: false, message: 'Could not sign you out of all devices' });
  }
};

// Get current user profile
export const getProfile = async (req, res) => {
  try {
    const user = req.user;

    res.json({
      success: true,
      data: {
        id: user._id,
        phoneNumber: user.phoneNumber,
        name: user.name,
        email: user.email,
        picture: user.picture,
        role: user.role,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    logger.error('Get profile error', { userId: req.user?._id, error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to get profile'
    });
  }
};

// Edit the profile: name, and an optional contact phone number (send an empty value to remove it).
// The email belongs to the Google account, so it cannot be edited here.
export const updateProfile = async (req, res) => {
  try {
    const user = req.user;
    const { name, phoneNumber } = req.body;

    if (name !== undefined) user.name = name;
    if (phoneNumber !== undefined) {
      if (phoneNumber === '') {
        user.phoneNumber = undefined;
      } else {
        user.phoneNumber = phoneNumber;
      }
    }

    try {
      await user.save();
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({ success: false, message: 'That phone number is already used by another account.' });
      }
      throw error;
    }

    logger.authLog('PROFILE_UPDATED', user._id, {});

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        id: user._id,
        phoneNumber: user.phoneNumber,
        name: user.name,
        email: user.email,
        picture: user.picture,
        role: user.role
      }
    });
  } catch (error) {
    logger.error('Update profile error', { userId: req.user?._id, error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
};
