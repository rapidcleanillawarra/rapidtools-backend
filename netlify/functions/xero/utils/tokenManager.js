const { db } = require('./firebaseInit');
const admin = require('firebase-admin');

// Store tokens in Firestore
const storeTokens = async (userId, tokenData, tenantInfo) => {
  const tokensRef = db.collection('xero_tokens').doc(userId);
  await tokensRef.set({
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
    tenantId: tenantInfo?.tenantId,
    tenantName: tenantInfo?.tenantName,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
};

// Get valid token (auto-refresh if expired)
const getValidToken = async (userId) => {
  const doc = await db.collection('xero_tokens').doc(userId).get();
  
  if (!doc.exists) {
    throw new Error('No Xero tokens found for user');
  }
  
  const tokenData = doc.data();
  
  // Refresh token if expired (or within 5 minute buffer)
  const expiresAtTime = tokenData.expiresAt.toDate ? tokenData.expiresAt.toDate().getTime() : tokenData.expiresAt.getTime();
  if (Date.now() > expiresAtTime - 300000) {
    const response = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokenData.refreshToken,
        client_id: process.env.XERO_CLIENT_ID,
        client_secret: process.env.XERO_CLIENT_SECRET,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.status}`);
    }
    
    const newTokens = await response.json();
    await storeTokens(userId, newTokens, {
      tenantId: tokenData.tenantId,
      tenantName: tokenData.tenantName
    });
    
    return newTokens.access_token;
  }
  
  return tokenData.accessToken;
};

// Get all available tenant IDs
const getAvailableTenants = async () => {
  const snapshot = await db.collection('xero_tokens').get();
  const tenants = [];
  
  snapshot.forEach(doc => {
    const data = doc.data();
    tenants.push({
      tenantId: doc.id,
      tenantName: data.tenantName,
      updatedAt: data.updatedAt
    });
  });
  
  return tenants;
};

module.exports = { storeTokens, getValidToken, getAvailableTenants }; 