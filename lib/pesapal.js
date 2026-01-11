// lib/pesapal.js
// Pesapal API integration utilities
// Usage: authenticate, create order, check status

import fetch from 'node-fetch';

const PESA_BASE_URL = process.env.PESAPAL_BASE_URL || 'https://pay.pesapal.com/v3';
const PESA_CONSUMER_KEY = process.env.PESAPAL_CONSUMER_KEY;
const PESA_CONSUMER_SECRET = process.env.PESAPAL_CONSUMER_SECRET;

let _accessToken = null;
let _tokenExpiry = 0;

export async function pesapalAuthenticate() {
  if (_accessToken && Date.now() < _tokenExpiry - 60000) return _accessToken;
  const res = await fetch(`${PESA_BASE_URL}/api/Auth/RequestToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      consumer_key: PESA_CONSUMER_KEY,
      consumer_secret: PESA_CONSUMER_SECRET,
    }),
  });
  if (!res.ok) throw new Error('Pesapal auth failed');
  const data = await res.json();
  _accessToken = data.token;
  _tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;
  return _accessToken;
}

export async function pesapalCreateOrder({
  amount,
  currency = 'UGX',
  description,
  callback_url,
  reference,
  customer,
  payment_method = 'MOBILE_MONEY',
  ...rest
}) {
  const token = await pesapalAuthenticate();
  const res = await fetch(`${PESA_BASE_URL}/api/Transactions/SubmitOrderRequest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      amount,
      currency,
      description,
      callback_url,
      reference,
      customer,
      payment_method,
      ...rest,
    }),
  });
  if (!res.ok) throw new Error('Pesapal order creation failed');
  return await res.json();
}

export async function pesapalQueryStatus(orderTrackingId) {
  const token = await pesapalAuthenticate();
  const res = await fetch(`${PESA_BASE_URL}/api/Transactions/GetTransactionStatus?orderTrackingId=${orderTrackingId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Pesapal status query failed');
  return await res.json();
}
