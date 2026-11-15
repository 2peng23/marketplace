import 'server-only';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import type { MessageRow } from './database.types';

export function createMailTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM;
  if (
    !host ||
    !user ||
    !password ||
    !from ||
    !z.email().safeParse(from).success ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  )
    return null;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  // A loopback receiver supports local mail testing; remote providers always require TLS.
  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(host);
  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure && !loopback,
    auth: { user, pass: host === 'smtp.gmail.com' ? password.replace(/\s/g, '') : password },
    connectionTimeout: 12_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return { transport, from };
}

export function sellerEmailContent(message: MessageRow, title: string, from: string) {
  const site =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : 'http://localhost:3000');
  const listingUrl = new URL(`/listings/${message.listing_id}`, site).href;
  return {
    from: { name: 'Marketplace', address: from },
    to: message.seller_email,
    replyTo: message.buyer_email,
    subject: `Message about ${title.replace(/[\r\n]+/g, ' ')}`,
    messageId: `<marketplace-${message.id}@${from.split('@')[1]}>`,
    text: `New inquiry about ${title}\n\n${message.message}\n\nReply to: ${message.buyer_email}\nListing: ${listingUrl}`,
  };
}
