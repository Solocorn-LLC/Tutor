import nodemailer from 'nodemailer'

/**
 * Configure SMTP transport for Solocorn.
 * Using environment variables for security.
 */
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'mail.privateemail.com',
  port: parseInt(process.env.EMAIL_PORT || '465'),
  secure: process.env.EMAIL_PORT === '465' || !process.env.EMAIL_PORT, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  // Short, explicit timeouts so unconfigured/misconfigured SMTP does not hang
  // registration in CI or local integration tests. Production values remain
  // reasonable for real mail servers.
  connectionTimeout: 5000,
  greetingTimeout: 5000,
  socketTimeout: 5000,
})

/**
 * Send an inquiry email to support@solocorn.co.
 */
export async function sendInquiryEmail({
  name,
  email,
  message,
}: {
  name: string
  email: string
  message: string
}) {
  const mailOptions = {
    from: `"Solocorn Landing" <${process.env.EMAIL_USER || 'support@solocorn.co'}>`,
    to: 'support@solocorn.co',
    subject: `New Inquiry from ${name}`,
    text: `You have a new inquiry from the landing page.

Name: ${name}
Email: ${email}
Message: ${message}`,
    html: `
      <h2>New Landing Page Inquiry</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Message:</strong></p>
      <div style="padding: 15px; background: #f4f4f4; border-radius: 5px;">
        ${message.replace(/\n/g, '<br>') || 'No message provided.'}
      </div>
    `,
  }

  return transporter.sendMail(mailOptions)
}

/**
 * Send an account email-verification link to a newly registered user.
 */
export async function sendVerificationEmail({
  to,
  name,
  verifyUrl,
}: {
  to: string
  name?: string | null
  verifyUrl: string
}) {
  const greeting = name ? ` ${name}` : ''
  const mailOptions = {
    from: `"Solocorn" <${process.env.EMAIL_USER || 'support@solocorn.co'}>`,
    to,
    subject: 'Verify your email address',
    text: `Hi${greeting},

Confirm your email address to activate your Solocorn account:

${verifyUrl}

This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.`,
    html: `
      <div style="font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1F2933;">
        <h2 style="font-size: 20px;">Verify your email</h2>
        <p>Hi${greeting}, confirm your email address to activate your Solocorn account.</p>
        <p style="margin: 24px 0;">
          <a href="${verifyUrl}" style="display: inline-block; background: #2563EB; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: 600;">Verify email</a>
        </p>
        <p style="font-size: 13px; color: #6b7280;">Or paste this link into your browser:<br><a href="${verifyUrl}">${verifyUrl}</a></p>
        <p style="font-size: 13px; color: #6b7280;">This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.</p>
      </div>
    `,
  }

  return transporter.sendMail(mailOptions)
}

/**
 * Send a tutor signup notification email to support@solocorn.co.
 */
export async function sendTutorSignupEmail({
  username,
  bio,
  country,
}: {
  username: string
  bio?: string | null
  country?: string | null
}) {
  const mailOptions = {
    from: `"Solocorn Landing" <${process.env.EMAIL_USER || 'support@solocorn.co'}>`,
    to: 'support@solocorn.co',
    subject: `New Tutor Signup Request: ${username}`,
    text: `A new tutor has signed up on the landing page.

Username: ${username}
Country: ${country || 'Not specified'}
Bio: ${bio || 'No bio provided'}`,
    html: `
      <h2>New Tutor Signup Request</h2>
      <p><strong>Username:</strong> ${username}</p>
      <p><strong>Country:</strong> ${country || 'Not specified'}</p>
      <p><strong>Bio:</strong> ${bio || 'No bio provided'}</p>
    `,
  }

  return transporter.sendMail(mailOptions)
}
